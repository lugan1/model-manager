import { CivitaiModelVersion } from './civitai.ts';

export type ModelType = "checkpoint" | "lora" | "lycoris";

export * from "./civitai";

export interface ModelInfo {
  name: string;
  category: string;
  model_path: string;
  preview_path: string | null;
  info_path: string | null;
  json_path: string | null;
  size: number;
  modified: number;
}

export interface ModelWithStatus extends ModelInfo {
  isOutdated: boolean;
  baseModel?: string; // 서버 최신 버전의 베이스 모델 (UI 표시용으로 유지하거나 최신 기준)
  localBaseModel?: string; // 로컬에 실제 있는 파일의 베이스 모델
  isNewBase?: boolean; // 베이스 모델이 변경되었는지 여부
  modelName?: string; // Civitai 실제 모델명
  modelDescription?: string; // Civitai 모델 전체 설명
  currentVersion?: string; // 현재 내 파일의 버전명
  currentVersionId?: number; // 현재 내 파일의 실제 버전 ID
  localVersionData?: CivitaiModelVersion; // 현재 내 파일의 상세 메타데이터 (Civitai 버전 정보)
  localPreviewUrl?: string; // 현재 내 파일의 프리뷰 이미지 URL (서버)
  localReleaseDate?: string; // 현재 내 파일의 릴리즈 날짜
  latestVersion?: string; // 서버 최신 버전명
  latestVersionId?: number;
  stableModified?: number; // 정렬 고정용 타임스탬프
  downloadUrl?: string;
  previewUrl?: string;
  latestVersionData?: CivitaiModelVersion;
  civitaiUrl?: string;
  hash?: string;
  hasNewVersion?: boolean;
  lastReleaseDate?: string;
  lastFetchedAt?: string; // 마지막 API 조회 시각
  isNotFound?: boolean; // 서버에 정보가 없는 모델인지 여부
  imageFetchFailed?: boolean; // 추가: 프리뷰 이미지 다운로드 실패 여부
  currentTask?: string; // 현재 진행 중인 작업 상태
}

export interface DownloadProgress {
  id: string;
  received: number;
  total: number | null;
  speed: number;
}

export interface DirNode {
  name: string;
  path: string;
  children: Record<string, DirNode>;
}

export interface ToastState {
  message: string;
  subMessage?: string;
  show: boolean;
  type: "success" | "error" | "warning";
}

export interface ErrorLog {
  id: string;
  timestamp: string;
  method: string;
  url?: string;
  status?: number;
  message: string;
  body?: string;
  headers?: Record<string, string>;
  target?: string;
}
