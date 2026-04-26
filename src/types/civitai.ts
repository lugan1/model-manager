/**
 * Civitai API Response DTOs
 * Based on API v1 (e.g., https://civitai.com/api/v1/models/{id})
 */

export interface CivitaiModelResponse {
  id: number;
  name: string;
  description: string;
  type: string; // Checkpoint, Lora, LoCon, TextualInversion, Controlnet, etc.
  allowNoCredit: boolean;
  allowCommercialUse: string[] | string;
  allowDerivatives: boolean;
  allowDifferentLicense: boolean;
  nsfw: boolean;
  nsfwLevel: number;
  minor: boolean;
  poi: boolean;
  userId: number;
  availability: "Public" | "Private";
  stats: {
    downloadCount: number;
    thumbsUpCount: number;
    thumbsDownCount: number;
    commentCount: number;
    tippedAmountCount: number;
  };
  creator: {
    username: string;
    image?: string;
  };
  tags: string[];
  modelVersions: CivitaiModelVersion[];
}

export interface CivitaiModelVersion {
  id: number;
  modelId: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  status: "Published" | "Draft" | "Archived";
  baseModel: string; // SD 1.5, SDXL 1.0, Pony, etc.
  baseModelType: string;
  description: string | null; // Version Notes
  availability: "Public" | "Private";
  nsfwLevel: number;
  trainedWords: string[];
  stats: {
    downloadCount: number;
    thumbsUpCount: number;
    thumbsDownCount: number;
  };
  files: CivitaiFile[];
  images: CivitaiImage[];
  downloadUrl: string;
  model?: {
    name: string;
    description?: string;
    type: string;
    nsfw: boolean;
    userId: number;
  };
}

export interface CivitaiFile {
  id: number;
  sizeKB: number;
  name: string;
  type: string; // Model, Config, VAE, etc.
  pickleScanResult: "Success" | "Danger" | "Error";
  pickleScanMessage: string | null;
  virusScanResult: "Success" | "Danger";
  scannedAt: string;
  metadata: {
    format: string; // SafeTensor, Pickle, etc.
    size: string; // pruned, full, etc.
    fp: string; // fp16, fp32, etc.
  };
  hashes: {
    AutoV1?: string;
    AutoV2?: string;
    SHA256?: string;
    CRC32?: string;
    BLAKE3?: string;
    AutoV3?: string;
  };
  downloadUrl: string;
  primary: boolean;
}

export interface CivitaiImage {
  url: string;
  nsfwLevel: number;
  width: number;
  height: number;
  hash: string; // BlurHash
  type: "image" | "video";
  hasMeta: boolean;
  hasPositivePrompt: boolean;
  meta: CivitaiImageMeta | null;
}

export interface CivitaiImageMeta {
  prompt?: string;
  negativePrompt?: string;
  steps?: number;
  sampler?: string;
  cfgScale?: number;
  seed?: number;
  Size?: string;
  Model?: string;
  "Model hash"?: string;
  VAE?: string;
  hashes?: Record<string, string>;
  resources?: {
    hash: string;
    name: string;
    type: string;
  }[];
  Version?: string;
  [key: string]: any; // Catch-all for extra generation params
}
