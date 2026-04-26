import { apiClient } from "./api.client";
import { DBService } from "./db.service";
import { CivitaiService } from "./civitai.service";
import { ModelInfo, ModelWithStatus } from "../types";
import { calculateIsOutdated } from "../utils";

export class ModelService {
  /**
   * 폴더를 스캔하여 모델 목록을 가져옵니다.
   */
  static async scanModels(path: string): Promise<ModelInfo[]> {
    return await apiClient.invoke<ModelInfo[]>("scan_models", { path });
  }

  /**
   * 모델의 해시값을 계산합니다. (로컬 DB 캐시 활용)
   */
  static async getModelHash(path: string, modified: number): Promise<string> {
    const cached = await DBService.getLocalFile(path);
    if (cached && cached.modified === modified && cached.hash) {
      return cached.hash;
    }

    const hash = await apiClient.invoke<string>("calculate_model_hash", { path });
    await DBService.upsertLocalFile({ path, hash, modified });
    return hash;
  }

  /**
   * 모델 정보를 Civitai API를 통해 업데이트합니다.
   */
  static async updateModelMetadata(
    model: ModelWithStatus,
    options: { checkNewVersion?: boolean; ignoreTTL?: boolean; ttlHours?: number } = {}
  ) {
    // 이 부분은 useModels.ts의 updateModelInfo 로직을 서비스로 옮긴 것입니다.
    // 복잡한 상태 업데이트 로직은 여기서 처리하지 않고 데이터만 반환하거나 
    // 최소한의 비즈니스 로직만 수행합니다.
    
    // 1. 해시 계산
    const hash = await this.getModelHash(model.model_path, model.modified);
    
    // 2. Civitai에서 정보 조회
    try {
      const data = await CivitaiService.getModelVersionByHash(hash);
      return { hash, data, status: "success" as const };
    } catch (error: any) {
      return { hash, error, status: "error" as const };
    }
  }

  /**
   * 파일 다운로드
   */
  static async downloadFile(id: string, url: string, path: string, overwrite: boolean = false): Promise<{ path: string, modified: number }> {
    return await apiClient.invoke("download_file", { id, url, path, overwrite });
  }

  /**
   * 파일 삭제
   */
  static async deleteFiles(paths: string[]): Promise<void> {
    return await apiClient.invoke("delete_files", { paths });
  }

  /**
   * 텍스트 파일 읽기
   */
  static async readTextFile(path: string): Promise<string> {
    return await apiClient.invoke("read_text_file", { path });
  }

  /**
   * 텍스트 파일 쓰기
   */
  static async writeTextFile(path: string, content: string): Promise<void> {
    return await apiClient.invoke("write_text_file", { path, content });
  }

  /**
   * 폴더 열기 (Explorer/Finder)
   */
  static async openFolder(path: string): Promise<void> {
    return await apiClient.invoke("open_folder", { path });
  }
}
