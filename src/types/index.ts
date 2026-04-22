export type ModelType = "checkpoint" | "lora";

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
  latestVersion?: string;
  latestVersionId?: number;
  downloadUrl?: string;
  previewUrl?: string;
  latestVersionData?: any;
  civitaiUrl?: string;
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
