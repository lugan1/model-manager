import { useCallback } from "react";
import { ModelWithStatus, CivitaiModelResponse, CivitaiModelVersion } from "../types";
import { ModelService } from "../services/model.service";
import { DBService } from "../services/db.service";
import { CivitaiService } from "../services/civitai.service";
import { useModelContext } from "../contexts/ModelContext";
import { useSettings } from "../contexts/SettingsContext";
import { useErrorLogs } from "./useErrorLogs";
import { normalizePath, calculateIsOutdated, stripHtml, normalizeError, escapeUnicode } from "../utils";

export const useModelUpdate = (addLog?: any, clearDownload?: (id: string) => void) => {
  const { patchModel } = useModelContext();
  const { updateTTL } = useSettings();
  const { deleteLogByPath } = useErrorLogs();

  const updateModelInfo = useCallback(async (
    model: ModelWithStatus, 
    options: { checkNewVersion?: boolean; ignoreTTL?: boolean; ttlHours?: number } = {},
    onTaskChange?: (task: string) => void
  ) => {
    const { checkNewVersion = false, ignoreTTL = false, ttlHours = updateTTL } = options;
    const updateTask = (task: string) => { 
      patchModel(model.model_path, { currentTask: task }); 
      onTaskChange?.(task); 
    };
    
    const baseName = model.model_path.replace(/\.(safetensors|ckpt)$/i, "");

    try {
      // 0. 강제 업데이트 시 상태 초기화 및 변수 정리
      if (ignoreTTL) {
        patchModel(model.model_path, { 
          imageFetchFailed: false, 
          isNotFound: false,
          currentTask: "FORCE_SCAN: 강제 재검사 시작"
        });
      }
      
      if (!ignoreTTL && model.isNotFound) return updateTask("IDLE: SKIPPED (404 캐시)");

      // 변수 초기화 (강제 업데이트면 null로 시작해서 무조건 새로 조회하게 함)
      let modelId = ignoreTTL ? null : (model.latestVersionData?.modelId || null);
      let versionData = ignoreTTL ? null : (model.localVersionData || model.latestVersionData || null);
      let localVersionId = ignoreTTL ? null : (model.currentVersionId || model.latestVersionId || null);
      let localVersionName = ignoreTTL ? null : (model.currentVersion || model.latestVersion || null);
      let localReleaseDate = ignoreTTL ? null : (model.localReleaseDate || model.lastReleaseDate || null);

      // 1. 로컬 메타데이터 확인 (.info, .json) - 강제가 아닐 때만 참조
      const localMetaPath = model.info_path || model.json_path;
      if (!ignoreTTL && !modelId && localMetaPath) {
        try {
          const content = await ModelService.readTextFile(localMetaPath);
          const localMetadata = JSON.parse(content);
          if (localMetadata.id) localVersionId = localMetadata.id;
          if (localMetadata.name) localVersionName = localMetadata.name;
          if (localMetadata.modelId) modelId = localMetadata.modelId;
          localReleaseDate = localMetadata.createdAt || localMetadata.publishedAt || localMetadata.updatedAt || localReleaseDate;
          versionData = localMetadata;
        } catch (e) {}
      }

      // 2. 서버 정보 캐시 확인 (DB) - 강제가 아닐 때만 참조
      if (!ignoreTTL && !modelId) {
        const cached = await DBService.getLocalFile(model.model_path);
        if (cached && cached.version_id) {
          const vData = await DBService.getCivitaiVersion(cached.version_id);
          if (vData) {
            modelId = vData.modelId;
            versionData = vData;
            localVersionId = vData.id;
            localVersionName = vData.name;
            localReleaseDate = vData.createdAt;
          }
        }
      }

      // [보완] 로컬 정보는 있으나 이미지 주소가 없는 경우, 이미지 정보를 위해 서버 조회 강제
      const needsImageInfo = !ignoreTTL && modelId && (!versionData?.images || versionData.images.length === 0);
      
      // 3. 해시 식별 (강제 업데이트면 무조건 이 블록 진입)
      let currentHash = model.hash;
      if (!modelId || ignoreTTL || needsImageInfo) {
        updateTask(ignoreTTL ? "FORCE_SCAN: 지문 재추출 중..." : (needsImageInfo ? "API_FETCH: 이미지 정보 보완 중..." : "API_FETCH: 모델 식별 중..."));
        
        let data: CivitaiModelVersion | null = null;
        
        // 강제가 아니고 이미 ID를 알고 있다면 해시 계산 없이 바로 조회
        if (!ignoreTTL && needsImageInfo && localVersionId) {
          try {
            data = await CivitaiService.getModelVersion(localVersionId) as CivitaiModelVersion;
          } catch (e) {}
        }

        // 강제 업데이트거나 정보를 못 찾았다면 해시 계산 수행
        if (!data) {
          currentHash = await ModelService.getModelHash(model.model_path, model.modified);
          try {
            data = await CivitaiService.getModelVersionByHash(currentHash) as CivitaiModelVersion;
          } catch (err: any) {
            const is404 = err.status === 404 || 
                          err.message?.includes("404") || 
                          err.message?.toLowerCase().includes("not found");
            
            if (is404) {
              await DBService.upsertLocalFile({ 
                path: model.model_path, 
                modified: model.modified, 
                hash: currentHash,
                isNotFound: true 
              });
              patchModel(model.model_path, { isNotFound: true, hash: currentHash });
              addLog?.({
                method: "IDENTIFY",
                target: model.name,
                path: model.model_path,
                message: "Civitai 서버에 모델 정보가 없습니다 (404).",
                status: 404
              });
              return updateTask("IDLE: 서버 정보 없음 (404)");
            }

            addLog?.({
              method: "IDENTIFY",
              target: model.name,
              path: model.model_path,
              message: `식별 실패: ${normalizeError(err)}`,
              status: err.status
            });
            return updateTask(`IDLE: 식별 실패 (${err.status || "ERR"})`);
          }
        }

        if (data) {
          modelId = data.modelId;
          localVersionId = data.id;
          versionData = data;
          
          // 모델 상세 정보 보완 (설명 등)
          const fullModel = await CivitaiService.getModel(modelId).catch(() => null) as CivitaiModelResponse | null;
          if (fullModel) {
            await DBService.upsertCivitaiModel(fullModel);
            data.model = {
              name: fullModel.name,
              description: fullModel.description,
              type: fullModel.type,
              nsfw: fullModel.nsfw,
              userId: fullModel.userId
            };
          }

          await DBService.upsertCivitaiVersion(data);
          
          const modelDesc = fullModel?.description || data.model?.description || "";
          const cleanModelDesc = stripHtml(modelDesc);
          const versionNotes = data.description ? stripHtml(data.description) : "";

          // 메타데이터 파일 갱신
          const civitaiUrl = `https://civitai.com/models/${data.modelId}?modelVersionId=${data.id}`;
          const notesContent = `URL: ${civitaiUrl}\n\n[MODEL DESCRIPTION]\n${cleanModelDesc}\n\n[VERSION NOTES]\n${versionNotes}`;
          const enrichedData = {
            ...data,
            "description": cleanModelDesc || versionNotes,
            "modelDescription": cleanModelDesc,
            "notes": notesContent.trim(),
            "modelId": data.modelId,
            "civitai_model_id": data.modelId,
            "url": civitaiUrl,
            "civitaiUrl": civitaiUrl,
            "source": civitaiUrl,
            "activation text": (data.trainedWords || []).join("\n"),
            "preferred weight": 1.0,
            "sd version": data.baseModel
          };
          // ReForge/Python 환경(cp949 인코딩)과의 호환성을 위해 비-ASCII 문자를 유니코드 시퀀스로 변환하여 저장
          const metaStr = escapeUnicode(JSON.stringify(enrichedData, null, 2));
          
          if (model.info_path) await ModelService.writeTextFile(model.info_path, metaStr).catch(() => {});
          else await ModelService.writeTextFile(`${baseName}.civitai.info`, metaStr).catch(() => {});

          const meta = { 
            modelName: data.model?.name,
            modelDescription: cleanModelDesc,
            currentVersion: data.name,
            currentVersionId: data.id,
            localVersionData: data,
            localBaseModel: data.baseModel,
            localPreviewUrl: data.images?.[0]?.url,
            localReleaseDate: data.createdAt,
            civitaiUrl: `https://civitai.com/models/${modelId}`, 
            baseModel: data.baseModel, 
            latestVersion: data.name, 
            latestVersionId: data.id, 
            latestVersionData: data,
            previewUrl: data.images?.[0]?.url, 
            lastReleaseDate: data.createdAt,
            lastFetchedAt: new Date().toISOString(), 
            isNotFound: false,
            modified: model.modified,
            hash: currentHash
          };

          await DBService.upsertLocalFile({
            path: model.model_path,
            modified: model.modified,
            versionId: data.id,
            hash: currentHash,
            preview_path: model.preview_path,
            info_path: model.info_path || `${baseName}.civitai.info`,
            json_path: model.json_path || `${baseName}.json`,
            isNotFound: false
          });

          patchModel(model.model_path, { ...meta, currentTask: "IDLE: 식별 완료" });
        }
      }

      // 4. 로컬 프리뷰 이미지 자동 다운로드 (식별되었으나 이미지가 없는 경우)
      const hasImages = versionData?.images && versionData.images.length > 0;
      // 중요: model.preview_path가 있더라도 실제 파일이 있는지 여부는 스캐너가 판단한 결과(m.preview_path)가 
      // ModelContext에서 보정되어 들어오므로, 여기서도 model.preview_path를 신뢰할 수 있게 됨
      const needsPreview = !model.preview_path || model.imageFetchFailed;

      if (modelId && needsPreview && hasImages) {
        // 정적 이미지(영상/GIF 제외) 우선 찾기
        const staticImage = versionData.images.find((img: any) => {
          const url = (img.url || "").toLowerCase();
          return !url.endsWith(".gif") && !url.endsWith(".mp4") && !url.endsWith(".webm");
        });
        
        const imageUrl = staticImage?.url || versionData.images[0].url;
        if (imageUrl) {
          const ext = imageUrl.split(".").pop()?.split("?")[0] || "png";
          const previewPath = `${baseName}.preview.${ext}`;
          const downloadId = `${model.model_path}:preview`;
          
          console.log(`[useModelUpdate] Starting preview download: ${imageUrl}`);
          
          ModelService.downloadFile(downloadId, imageUrl, previewPath, true)
            .then((res) => {
              console.log(`[useModelUpdate] Preview download success: ${res.path}`);
              patchModel(model.model_path, { preview_path: res.path, imageFetchFailed: false });
              DBService.upsertLocalFile({ 
                path: model.model_path, 
                modified: model.modified, 
                preview_path: res.path,
                imageFetchFailed: false,
                hasNewVersion: model.hasNewVersion,
                isNewBase: model.isNewBase
              } as any);
            })
            .catch((err) => {
              console.error(`[useModelUpdate] Preview download failed:`, err);
              patchModel(model.model_path, { imageFetchFailed: true });
              addLog?.({
                method: "DOWNLOAD",
                target: `${model.name} (Preview)`,
                path: model.model_path,
                message: `현재 버전 이미지 다운로드 실패: ${normalizeError(err)}`,
                status: err.status
              });
            })
            .finally(() => {
              if (clearDownload) clearDownload(downloadId);
            });
        }
      }

      // 5. 최신 버전 업데이트 확인
      if (checkNewVersion && modelId) {
        updateTask(`API_FETCH: 최신 정보 조회 중...`);
        try {
          const civitData = await CivitaiService.getModel(modelId) as CivitaiModelResponse;
          if (!civitData) return updateTask("IDLE: 상세 요청 실패");

          console.log(`[useModelUpdate] Saving full model data for ${modelId}`);
          await DBService.upsertCivitaiModel(civitData);

          const allVersions = civitData.modelVersions || [];
          const latestVersion = allVersions[0]; 

          if (!latestVersion) return updateTask("IDLE: 서버 버전 정보 없음");

          const hasNewVersion = (localVersionId !== latestVersion.id);
          const currentLocalBase = model.localBaseModel || model.baseModel || versionData?.baseModel;
          const isNewBase = hasNewVersion && (latestVersion.baseModel !== currentLocalBase);

          const nowISO = new Date().toISOString();
          const staticImage = latestVersion.images?.find((img: any) => {
            const url = img.url.toLowerCase();
            return !url.endsWith(".gif") && !url.endsWith(".mp4");
          });
          const selectedPreviewUrl = staticImage?.url || latestVersion.images?.[0]?.url;

          const updateMeta = { 
            modelName: civitData.name, 
            modelDescription: civitData.description ? stripHtml(civitData.description) : "",
            latestVersion: latestVersion.name, 
            latestVersionId: latestVersion.id,
            latestVersionData: latestVersion,
            civitaiUrl: `https://civitai.com/models/${modelId}`,
            hasNewVersion,
            isNewBase,
            baseModel: latestVersion.baseModel,
            lastReleaseDate: latestVersion.createdAt,
            previewUrl: selectedPreviewUrl, 
            lastFetchedAt: nowISO,
            isNotFound: false,
            modified: model.modified
          };

          // 중요: 업데이트 상태를 DB에 영구 기록
          await DBService.upsertLocalFile({
            path: model.model_path,
            modified: model.modified,
            hash: model.hash,
            versionId: localVersionId,
            preview_path: model.preview_path,
            info_path: model.info_path,
            json_path: model.json_path,
            hasNewVersion,
            isNewBase,
            isNotFound: false
          });

          patchModel(model.model_path, { ...updateMeta, currentTask: "IDLE: 업데이트 확인 완료" });
        } catch (err: any) {
          addLog?.({
            method: "UPDATE_CHECK",
            target: model.name,
            path: model.model_path,
            message: `최신 정보 조회 실패: ${normalizeError(err)}`,
            status: err.status
          });
          return updateTask("IDLE: 상세 정보 요청 실패");
        }
      }

    } catch (e: any) {
      const errorMsg = normalizeError(e);
      addLog?.({
        method: "UPDATE",
        target: model.name,
        path: model.model_path,
        message: errorMsg,
        status: e.status
      });
      updateTask(`IDLE: 오류 (${errorMsg})`);
    }
  }, [patchModel, updateTTL, addLog]);

  return { updateModelInfo };
};
