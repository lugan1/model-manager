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

export const isTauri = (): boolean => {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
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

/**
 * 문자열 내의 비-ASCII 문자(한글 등)를 \uXXXX 형태의 유니코드 이스케이프 시퀀스로 변환합니다.
 * 
 * [배경] 
 * 1. 한국어 윈도우 환경의 Python(ReForge 등)은 파일을 읽을 때 기본값으로 cp949 인코딩을 시도하는 경우가 많습니다.
 * 2. UTF-8로 저장된 생 한글 데이터가 포함되면 Python 측에서 UnicodeDecodeError가 발생하여 확장이 멈춥니다.
 * 3. 모든 문자를 ASCII 범위 내의 이스케이프 시퀀스로 변환함으로써, 어떤 인코딩 환경에서도 데이터 손실 없이 안전하게 읽을 수 있게 합니다.
 */
export const escapeUnicode = (str: string): string => {
  return str.replace(/[\u007F-\uFFFF]/g, (chr) => {
    return "\\u" + ("0000" + chr.charCodeAt(0).toString(16)).slice(-4);
  });
};
