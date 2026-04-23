import { apiClient, Semaphore } from "./api.client";

/**
 * Civitai API 전용 서비스
 */
export class CivitaiService {
  private static apiSemaphore = new Semaphore(5); // Civitai API 요청 제한

  private static BASE_URL = "https://civitai.red/api/v1";

  /**
   * 모델 ID로 정보 조회
   */
  static async getModel(modelId: number) {
    await this.apiSemaphore.acquire();
    try {
      return await apiClient.fetch(`${this.BASE_URL}/models/${modelId}`);
    } finally {
      this.apiSemaphore.release();
    }
  }

  /**
   * 해시값으로 모델 버전 정보 조회
   */
  static async getModelVersionByHash(hash: string) {
    await this.apiSemaphore.acquire();
    try {
      return await apiClient.fetch(
        `${this.BASE_URL}/model-versions/by-hash/${hash}`
      );
    } finally {
      this.apiSemaphore.release();
    }
  }
}
