import Database from "@tauri-apps/plugin-sql";

// TODO: DB_PATH를 설정 모달에서 변경 가능하게 하거나, 상대 경로를 사용하도록 개선 검토 필요
const DB_PATH = "sqlite:D:/ImageGenerator/model-manager/model-manager.db";

export class DBService {
  private static dbPromise: Promise<Database> | null = null;

  private static async getDB() {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = (async () => {
      try {
        const db = await Database.load(DB_PATH);
        
        // 테이블 초기화
        await db.execute(`
          CREATE TABLE IF NOT EXISTS updates (
            path TEXT PRIMARY KEY,
            data TEXT,
            modified INTEGER
          );
        `);
        await db.execute(`
          CREATE TABLE IF NOT EXISTS hashes (
            path TEXT PRIMARY KEY,
            hash TEXT,
            modified INTEGER
          );
        `);
        
        return db;
      } catch (err: any) {
        console.error("[DBService] Critical Database Error:", err);
        this.dbPromise = null;
        throw err;
      }
    })();

    return this.dbPromise;
  }

  static async getUpdateEntry(path: string) {
    const db = await this.getDB();
    const rows = await db.select<any[]>("SELECT data FROM updates WHERE path = $1", [path]);
    return rows.length > 0 ? JSON.parse(rows[0].data) : null;
  }

  static async setUpdateEntry(path: string, data: any) {
    const db = await this.getDB();
    const modified = data.modified || 0;
    const jsonStr = JSON.stringify(data);
    await db.execute(
      "INSERT OR REPLACE INTO updates (path, data, modified) VALUES ($1, $2, $3)",
      [path, jsonStr, modified]
    );
  }

  static async getAllUpdates() {
    const db = await this.getDB();
    const rows = await db.select<any[]>("SELECT path, data FROM updates");
    const result: Record<string, any> = {};
    rows.forEach(row => { result[row.path] = JSON.parse(row.data); });
    return result;
  }
  
  static async getHashEntry(path: string) {
    const db = await this.getDB();
    const rows = await db.select<any[]>("SELECT hash, modified FROM hashes WHERE path = $1", [path]);
    return rows.length > 0 ? { hash: rows[0].hash, modified: rows[0].modified } : null;
  }

  static async setHashEntry(path: string, data: { hash: string; modified: number }) {
    const db = await this.getDB();
    await db.execute(
      "INSERT OR REPLACE INTO hashes (path, hash, modified) VALUES ($1, $2, $3)",
      [path, data.hash, data.modified]
    );
  }

  static async deleteEntry(path: string) {
    const db = await this.getDB();
    await db.execute("DELETE FROM updates WHERE path = $1", [path]);
  }

  static async deleteHash(path: string) {
    const db = await this.getDB();
    await db.execute("DELETE FROM hashes WHERE path = $1", [path]);
  }

  static async clearAll() {
    const db = await this.getDB();
    await db.execute("DELETE FROM updates");
    await db.execute("DELETE FROM hashes");
  }
}
