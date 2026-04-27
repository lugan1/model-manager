import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * 표준화된 API 응답 형식
 */
export interface ApiResponse<T> {
  data?: T;
  error?: {
    status: number;
    message: string;
    body?: string;
  };
}

/**
 * 흐름 제어를 위한 간단한 세마포어 클래스
 */
export class Semaphore {
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(private max: number) {}

  async acquire() {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release() {
    this.active--;
    if (this.queue.length > 0) {
      this.active++;
      const next = this.queue.shift();
      next?.();
    }
  }
}

/**
 * Tauri Invoke 및 외부 HTTP 요청을 관리하는 기본 클라이언트
 */
export const apiClient = {
  // --- Tauri Commands ---
  async invoke<T>(cmd: string, args?: Record<string, any>): Promise<T> {
    try {
      return await invoke<T>(cmd, args);
    } catch (error: any) {
      console.error(`Tauri Invoke Error [${cmd}]:`, error);
      throw error;
    }
  },

  // --- HTTP Requests ---
  async fetch<T>(
    url: string,
    options: RequestInit & { timeout?: number } = {}
  ): Promise<T> {
    const { timeout = 15000, ...fetchOptions } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });
      clearTimeout(id);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "EMPTY_BODY");
        throw {
          status: response.status,
          message: `HTTP_${response.status}`,
          body: errorBody,
        };
      }
      return await response.json();
    } catch (error: any) {
      clearTimeout(id);
      if (error.name === "AbortError") {
        throw { status: 408, message: "Request Timeout" };
      }
      throw error;
    }
  },

  // --- Utility ---
  async openExternal(url: string): Promise<void> {
    try {
      // 1. Tauri 환경인지 확인 시도
      const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__;
      
      if (isTauri) {
        await openUrl(url);
      } else {
        // 2. 브라우저/웹 환경 (Reforge 등)
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      console.error("[APIClient] Failed to open external URL:", error);
      // Fallback
      if (typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    }
  },
};
