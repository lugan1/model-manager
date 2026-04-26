import { fromUnixTime, differenceInMonths } from "date-fns";

export const normalizePath = (p: string): string => {
  if (!p) return "";
  return p.replace(/[\\\/]+/g, "\\").replace(/\\$/, "").toLowerCase();
};

export const formatSize = (bytes: number): string => {
  if (!bytes) return "0 GB";
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(2)} GB`;
};

export const calculateIsOutdated = (modified: number, filterMonths: number): boolean => {
  return differenceInMonths(new Date(), fromUnixTime(modified)) >= filterMonths;
};

export const getParentPath = (filePath: string): string => {
  const parts = filePath.split(/[\\\/]/);
  parts.pop();
  return parts.join("\\");
};

export const getBaseName = (filePath: string): string => {
  const fullFileName = filePath.split(/[\\\/]/).pop() || "model.safetensors";
  return fullFileName.replace(/\.(safetensors|ckpt)$/i, "");
};

export const stripHtml = (html: string): string => {
  if (!html) return "";
  return html
    .replace(/<br\s*[\/]?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>?/gm, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
};

/**
 * 에러 객체를 표준화된 메시지로 변환합니다.
 */
export const normalizeError = (err: any): string => {
  if (!err) return "알 수 없는 오류";
  if (typeof err === "string") return err;
  
  // Tauri 에러 또는 HTTP 에러 객체
  if (err.message) return err.message;
  if (err.status) {
    if (err.status === 408) return "요청 시간 초과 (네트워크 불안정)";
    if (err.status === 429) return "Civitai 요청 제한 (잠시 후 시도)";
    if (err.status === 404) return "서버 정보 없음 (404)";
    if (err.status >= 500) return "Civitai 서버 오류";
    return `HTTP 에러: ${err.status}`;
  }
  
  try {
    return JSON.stringify(err);
  } catch (e) {
    return "분석할 수 없는 오류";
  }
};
