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
