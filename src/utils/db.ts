import Database from "@tauri-apps/plugin-sql";

// 현재 프로젝트 폴더를 직접 지정하여 그 안에 DB를 생성하게 합니다.
const DB_PATH = "sqlite:D:/ImageGenerator/model-manager/model-manager.db";
let dbPromise: Promise<Database> | null = null;

async function getDB() {
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    try {
      const db = await Database.load(DB_PATH);
      
      // 테이블 초기화
      await db.select(`
        CREATE TABLE IF NOT EXISTS updates (
          path TEXT PRIMARY KEY,
          data TEXT,
          modified INTEGER
        );
      `);
      await db.select(`
        CREATE TABLE IF NOT EXISTS hashes (
          path TEXT PRIMARY KEY,
          hash TEXT,
          modified INTEGER
        );
      `);
      
      return db;
    } catch (err: any) {
      console.error("[DB] Critical Database Error:", err);
      dbPromise = null;
      throw err;
    }
  })();

  return dbPromise;
}

export const db = {
  getUpdateEntry: async (path: string) => {
    const database = await getDB();
    const rows = await database.select<any[]>("SELECT data FROM updates WHERE path = $1", [path]);
    return rows.length > 0 ? JSON.parse(rows[0].data) : null;
  },

  setUpdateEntry: async (path: string, data: any) => {
    const database = await getDB();
    const modified = data.modified || 0;
    const jsonStr = JSON.stringify(data);
    await database.select(
      "INSERT OR REPLACE INTO updates (path, data, modified) VALUES ($1, $2, $3)",
      [path, jsonStr, modified]
    );
  },

  deleteEntry: async (path: string) => {
    const database = await getDB();
    await database.select("DELETE FROM updates WHERE path = $1", [path]);
  },

  getAllUpdates: async () => {
    const database = await getDB();
    const rows = await database.select<any[]>("SELECT path, data FROM updates");
    const result: Record<string, any> = {};
    rows.forEach(row => { result[row.path] = JSON.parse(row.data); });
    return result;
  },
  
  getHashEntry: async (path: string) => {
    const database = await getDB();
    const rows = await database.select<any[]>("SELECT hash, modified FROM hashes WHERE path = $1", [path]);
    return rows.length > 0 ? { hash: rows[0].hash, modified: rows[0].modified } : null;
  },

  setHashEntry: async (path: string, data: { hash: string; modified: number }) => {
    const database = await getDB();
    await database.select(
      "INSERT OR REPLACE INTO hashes (path, hash, modified) VALUES ($1, $2, $3)",
      [path, data.hash, data.modified]
    );
  },

  deleteHash: async (path: string) => {
    const database = await getDB();
    await database.select("DELETE FROM hashes WHERE path = $1", [path]);
  },

  clearAll: async () => {
    const database = await getDB();
    await database.select("DELETE FROM updates");
    await database.select("DELETE FROM hashes");
  }
};
