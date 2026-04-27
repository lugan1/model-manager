import Database from "@tauri-apps/plugin-sql";
import { CivitaiModelResponse, CivitaiModelVersion } from "../types";
import { stripHtml } from "../utils";

// TODO: DB_PATH를 설정 모달에서 변경 가능하게 하거나, 상대 경로를 사용하도록 개선 검토 필요
const DB_PATH = "sqlite:D:/ImageGenerator/model-manager/model-manager.db";

export class DBService {
  private static dbPromise: Promise<Database> | null = null;
  private static queryQueue: Promise<any> = Promise.resolve();

  private static async runExclusive<T>(fn: (db: Database) => Promise<T>): Promise<T> {
    const db = await this.getDB();
    // 쿼리 실행을 순차적으로 정렬하여 'database is locked' 에러 방지
    const result = this.queryQueue.then(() => fn(db));
    this.queryQueue = result.catch(() => {}); // 다음 쿼리를 위해 에러와 무관하게 큐 유지
    return result;
  }

  private static async getDB() {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = (async () => {
      try {
        const db = await Database.load(DB_PATH);
        return db;
      } catch (err: any) {
        console.error("[DBService] Critical Database Error:", err);
        this.dbPromise = null;
        throw err;
      }
    })();

    // 초기화 및 마이그레이션 로직도 runExclusive로 보호하기 위해 내부에서 처리하지 않고 
    // 별도의 초기화 래퍼를 사용하거나, 첫 실행 시 보장해야 함.
    // 여기서는 getDB가 처음 호출될 때 한 번만 실행되므로 안전함.
    const db = await this.dbPromise;
    
    // 마이그레이션: 기존 구조(updates 테이블)나 하이브리드 구조(civitai_images 테이블 없음) 감지 시 초기화
    const hasUpdates = (await db.select<{ name: string }[]>("SELECT name FROM sqlite_master WHERE type='table' AND name='updates'")).length > 0;
    const hasLocalFiles = (await db.select<{ name: string }[]>("SELECT name FROM sqlite_master WHERE type='table' AND name='local_files'")).length > 0;
    const hasImages = (await db.select<{ name: string }[]>("SELECT name FROM sqlite_master WHERE type='table' AND name='civitai_images'")).length > 0;

    if (hasUpdates || (hasLocalFiles && !hasImages)) {
      console.log("[DBService] Old or Hybrid schema detected. Resetting database for full normalization...");
      await db.execute("DROP TABLE IF EXISTS updates");
      await db.execute("DROP TABLE IF EXISTS hashes");
      await db.execute("DROP TABLE IF EXISTS local_files");
      await db.execute("DROP TABLE IF EXISTS civitai_versions");
      await db.execute("DROP TABLE IF EXISTS civitai_models");
      await db.execute("DROP TABLE IF EXISTS civitai_model_tags");
      await db.execute("DROP TABLE IF EXISTS civitai_version_words");
      await db.execute("DROP TABLE IF EXISTS civitai_files");
      await db.execute("DROP TABLE IF EXISTS civitai_images");
    }

    // 1. 로컬 파일 정보 (경로 중심)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS local_files (
        path TEXT PRIMARY KEY,
        hash TEXT,
        version_id INTEGER,
        modified INTEGER,
        stable_modified INTEGER,
        preview_path TEXT,
        info_path TEXT,
        json_path TEXT,
        is_not_found BOOLEAN DEFAULT 0,
        image_fetch_failed BOOLEAN DEFAULT 0,
        has_new_version BOOLEAN DEFAULT 0,
        is_new_base BOOLEAN DEFAULT 0
      );
    `);

    // 마이그레이션: 기존 테이블에 컬럼이 없는 경우 추가
    try { await db.execute("ALTER TABLE local_files ADD COLUMN has_new_version BOOLEAN DEFAULT 0"); } catch(e) {}
    try { await db.execute("ALTER TABLE local_files ADD COLUMN is_new_base BOOLEAN DEFAULT 0"); } catch(e) {}
    try { await db.execute("ALTER TABLE local_files ADD COLUMN stable_modified INTEGER"); } catch(e) {}

    // 2. Civitai 모델 정보
    await db.execute(`
      CREATE TABLE IF NOT EXISTS civitai_models (
        id INTEGER PRIMARY KEY,
        name TEXT,
        description TEXT,
        type TEXT,
        allowNoCredit BOOLEAN,
        allowCommercialUse TEXT,
        allowDerivatives BOOLEAN,
        allowDifferentLicense BOOLEAN,
        nsfw BOOLEAN,
        nsfwLevel INTEGER,
        minor BOOLEAN,
        poi BOOLEAN,
        userId INTEGER,
        availability TEXT,
        stat_downloadCount INTEGER,
        stat_thumbsUpCount INTEGER,
        stat_thumbsDownCount INTEGER,
        stat_commentCount INTEGER,
        stat_tippedAmountCount INTEGER,
        creator_username TEXT,
        creator_image TEXT,
        last_fetched_at TEXT
      );
    `);

    await db.execute(`CREATE TABLE IF NOT EXISTS civitai_model_tags (model_id INTEGER, tag TEXT, PRIMARY KEY(model_id, tag))`);

    // 3. Civitai 버전 정보
    await db.execute(`
      CREATE TABLE IF NOT EXISTS civitai_versions (
        id INTEGER PRIMARY KEY,
        model_id INTEGER,
        name TEXT,
        createdAt TEXT,
        updatedAt TEXT,
        publishedAt TEXT,
        status TEXT,
        baseModel TEXT,
        baseModelType TEXT,
        description TEXT,
        availability TEXT,
        nsfwLevel INTEGER,
        stat_downloadCount INTEGER,
        stat_thumbsUpCount INTEGER,
        stat_thumbsDownCount INTEGER,
        downloadUrl TEXT,
        lookup_hash TEXT
      );
    `);

    await db.execute(`CREATE TABLE IF NOT EXISTS civitai_version_words (version_id INTEGER, word TEXT, PRIMARY KEY(version_id, word))`);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS civitai_files (
        id INTEGER PRIMARY KEY,
        version_id INTEGER,
        sizeKB REAL,
        name TEXT,
        type TEXT,
        pickleScanResult TEXT,
        pickleScanMessage TEXT,
        virusScanResult TEXT,
        scannedAt TEXT,
        meta_format TEXT,
        meta_size TEXT,
        meta_fp TEXT,
        hash_AutoV1 TEXT,
        hash_AutoV2 TEXT,
        hash_SHA256 TEXT,
        hash_CRC32 TEXT,
        hash_BLAKE3 TEXT,
        hash_AutoV3 TEXT,
        downloadUrl TEXT,
        is_primary BOOLEAN
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS civitai_images (
        url TEXT PRIMARY KEY,
        version_id INTEGER,
        nsfwLevel INTEGER,
        width INTEGER,
        height INTEGER,
        hash TEXT,
        type TEXT,
        hasMeta BOOLEAN,
        hasPositivePrompt BOOLEAN,
        meta_json TEXT
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS error_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT,
        method TEXT,
        url TEXT,
        status INTEGER,
        message TEXT,
        body TEXT,
        headers TEXT,
        target TEXT,
        path TEXT
      );
    `);

    return db;
  }

  // --- Local Files ---

  static async getLocalFile(path: string) {
    return this.runExclusive(async (db) => {
      const rows = await db.select<any[]>("SELECT * FROM local_files WHERE path = $1", [path]);
      return rows.length > 0 ? rows[0] : null;
    });
  }

  static async upsertLocalFile(params: {
    path: string;
    hash?: string | null;
    versionId?: number | null;
    modified: number;
    stable_modified?: number | null;
    preview_path?: string | null;
    info_path?: string | null;
    json_path?: string | null;
    isNotFound?: boolean;
    imageFetchFailed?: boolean;
    hasNewVersion?: boolean;
    isNewBase?: boolean;
  }) {
    return this.runExclusive(async (db) => {
      // 만약 stable_modified가 제공되지 않았다면, 기존 값이 있는지 확인하여 유지하거나 현재 modified를 사용
      let stableModified = params.stable_modified;
      if (stableModified === undefined || stableModified === null) {
        const rows = await db.select<any[]>("SELECT stable_modified FROM local_files WHERE path = $1", [params.path]);
        stableModified = (rows.length > 0 ? rows[0].stable_modified : null) || params.modified;
      }

      console.log(`[DBService] Upserting local file: ${params.path}`, { ...params, stable_modified: stableModified });
      await db.execute(
        `INSERT OR REPLACE INTO local_files 
         (path, hash, version_id, modified, stable_modified, preview_path, info_path, json_path, is_not_found, image_fetch_failed, has_new_version, is_new_base) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          params.path, 
          params.hash || null, 
          params.versionId || null, 
          params.modified, 
          stableModified,
          params.preview_path || null, 
          params.info_path || null, 
          params.json_path || null, 
          params.isNotFound ? 1 : 0,
          params.imageFetchFailed ? 1 : 0,
          params.hasNewVersion ? 1 : 0,
          params.isNewBase ? 1 : 0
        ]
      );
    });
  }

  static async deleteLocalFile(path: string) {
    return this.runExclusive(async (db) => {
      console.log(`[DBService] Deleting local file: ${path}`);
      await db.execute("DELETE FROM local_files WHERE path = $1", [path]);
    });
  }

  // --- Civitai Versions ---

  static async getCivitaiVersion(versionId: number): Promise<CivitaiModelVersion | null> {
    return this.runExclusive(async (db) => {
      const rows = await db.select<any[]>("SELECT * FROM civitai_versions WHERE id = $1", [versionId]);
      if (rows.length === 0) return null;
      return this.buildVersionDTOWithDB(db, rows[0]);
    });
  }

  static async getCivitaiVersionByHash(hash: string): Promise<CivitaiModelVersion | null> {
    return this.runExclusive(async (db) => {
      const rows = await db.select<any[]>("SELECT * FROM civitai_versions WHERE lookup_hash = $1", [hash]);
      if (rows.length === 0) return null;
      return this.buildVersionDTOWithDB(db, rows[0]);
    });
  }

  static async upsertCivitaiVersion(v: CivitaiModelVersion, lookupHash?: string) {
    return this.runExclusive(async (db) => {
      await this.upsertCivitaiVersionInternal(db, v, lookupHash);
    });
  }

  private static async upsertCivitaiVersionInternal(db: any, v: CivitaiModelVersion, lookupHash?: string) {
    const cleanDescription = v.description ? stripHtml(v.description) : null;
    console.log(`[DBService] Upserting version: ${v.id} (${v.name})`);
    await db.execute(
      `INSERT OR REPLACE INTO civitai_versions 
       (id, model_id, name, createdAt, updatedAt, publishedAt, status, baseModel, baseModelType, description, availability, nsfwLevel, stat_downloadCount, stat_thumbsUpCount, stat_thumbsDownCount, downloadUrl, lookup_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [v.id, v.modelId, v.name, v.createdAt, v.updatedAt, v.publishedAt, v.status, v.baseModel, v.baseModelType, cleanDescription, v.availability, v.nsfwLevel, v.stats?.downloadCount || 0, v.stats?.thumbsUpCount || 0, v.stats?.thumbsDownCount || 0, v.downloadUrl, lookupHash || null]
    );

    // 추가: 버전 데이터 안에 모델 정보(설명 등)가 포함되어 있다면 civitai_models 테이블도 함께 갱신
    if (v.model) {
      const cleanModelDesc = v.model.description ? stripHtml(v.model.description) : "";
      console.log(`[DBService] Upserting model info from version: ${v.modelId}`);
      await db.execute(
        `INSERT INTO civitai_models (id, name, description, type, nsfw, userId, last_fetched_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT(id) DO UPDATE SET 
           name = excluded.name,
           description = CASE 
             WHEN excluded.description != '' AND excluded.description IS NOT NULL THEN excluded.description 
             ELSE description 
           END,
           last_fetched_at = excluded.last_fetched_at`,
        [v.modelId, v.model.name, cleanModelDesc, v.model.type, v.model.nsfw ? 1 : 0, v.model.userId, new Date().toISOString()]
      );
    }

    // Words
    await db.execute("DELETE FROM civitai_version_words WHERE version_id = $1", [v.id]);
    if (v.trainedWords && v.trainedWords.length > 0) {
      for (const word of v.trainedWords) {
        await db.execute("INSERT OR REPLACE INTO civitai_version_words (version_id, word) VALUES ($1, $2)", [v.id, word]);
      }
    }

    // Files
    await db.execute("DELETE FROM civitai_files WHERE version_id = $1", [v.id]);
    if (v.files && v.files.length > 0) {
      for (const f of v.files) {
        await db.execute(
          `INSERT OR REPLACE INTO civitai_files 
           (id, version_id, sizeKB, name, type, pickleScanResult, pickleScanMessage, virusScanResult, scannedAt, meta_format, meta_size, meta_fp, hash_AutoV1, hash_AutoV2, hash_SHA256, hash_CRC32, hash_BLAKE3, hash_AutoV3, downloadUrl, is_primary)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
          [f.id, v.id, f.sizeKB, f.name, f.type, f.pickleScanResult, f.pickleScanMessage, f.virusScanResult, f.scannedAt, f.metadata?.format, f.metadata?.size, f.metadata?.fp, f.hashes?.AutoV1, f.hashes?.AutoV2, f.hashes?.SHA256, f.hashes?.CRC32, f.hashes?.BLAKE3, f.hashes?.AutoV3, f.downloadUrl, f.primary ? 1 : 0]
        );
      }
    }

    // Images
    await db.execute("DELETE FROM civitai_images WHERE version_id = $1", [v.id]);
    if (v.images && v.images.length > 0) {
      for (const img of v.images) {
        await db.execute(
          `INSERT OR REPLACE INTO civitai_images 
           (url, version_id, nsfwLevel, width, height, hash, type, hasMeta, hasPositivePrompt, meta_json)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [img.url, v.id, img.nsfwLevel, img.width, img.height, img.hash, img.type, img.hasMeta ? 1 : 0, img.hasPositivePrompt ? 1 : 0, img.meta ? JSON.stringify(img.meta) : null]
        );
      }
    }
  }

  // --- Civitai Models ---

  static async getCivitaiModel(modelId: number): Promise<CivitaiModelResponse | null> {
    return this.runExclusive(async (db) => {
      const rows = await db.select<any[]>("SELECT * FROM civitai_models WHERE id = $1", [modelId]);
      if (rows.length === 0) return null;
      return this.buildModelDTOWithDB(db, rows[0]);
    });
  }

  static async upsertCivitaiModel(m: CivitaiModelResponse) {
    return this.runExclusive(async (db) => {
      const cleanDescription = m.description ? stripHtml(m.description) : "";
      await db.execute(
        `INSERT OR REPLACE INTO civitai_models 
         (id, name, description, type, allowNoCredit, allowCommercialUse, allowDerivatives, allowDifferentLicense, nsfw, nsfwLevel, minor, poi, userId, availability, stat_downloadCount, stat_thumbsUpCount, stat_thumbsDownCount, stat_commentCount, stat_tippedAmountCount, creator_username, creator_image, last_fetched_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
        [m.id, m.name, cleanDescription, m.type, m.allowNoCredit ? 1 : 0, Array.isArray(m.allowCommercialUse) ? m.allowCommercialUse.join(",") : m.allowCommercialUse, m.allowDerivatives ? 1 : 0, m.allowDifferentLicense ? 1 : 0, m.nsfw ? 1 : 0, m.nsfwLevel, m.minor ? 1 : 0, m.poi ? 1 : 0, m.userId, m.availability, m.stats?.downloadCount || 0, m.stats?.thumbsUpCount || 0, m.stats?.thumbsDownCount || 0, m.stats?.commentCount || 0, m.stats?.tippedAmountCount || 0, m.creator?.username, m.creator?.image || null, new Date().toISOString()]
      );

      // Tags
      await db.execute("DELETE FROM civitai_model_tags WHERE model_id = $1", [m.id]);
      if (m.tags && m.tags.length > 0) {
        for (const tag of m.tags) {
          await db.execute("INSERT OR IGNORE INTO civitai_model_tags (model_id, tag) VALUES ($1, $2)", [m.id, tag]);
        }
      }

      // Versions
      if (m.modelVersions && m.modelVersions.length > 0) {
        for (const v of m.modelVersions) {
          // 중요: API 응답에 따라 modelId가 누락될 수 있으므로 부모의 ID를 강제 할당
          if (!v.modelId) v.modelId = m.id;
          // Internal 버전을 호출하여 데드락 방지
          await this.upsertCivitaiVersionInternal(db, v);
        }
      }
    });
  }

  // --- Reconstruction Helpers ---

  private static async buildVersionDTOWithDB(db: Database, row: any): Promise<CivitaiModelVersion> {
    const words = await db.select<{word: string}[]>("SELECT word FROM civitai_version_words WHERE version_id = $1", [row.id]);
    const files = await db.select<any[]>("SELECT * FROM civitai_files WHERE version_id = $1", [row.id]);
    const images = await db.select<any[]>("SELECT * FROM civitai_images WHERE version_id = $1", [row.id]);

    return {
      id: row.id,
      modelId: row.model_id,
      name: row.name,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      publishedAt: row.publishedAt,
      status: row.status,
      baseModel: row.baseModel,
      baseModelType: row.baseModelType,
      description: row.description,
      availability: row.availability,
      nsfwLevel: row.nsfwLevel,
      trainedWords: words.map(w => w.word),
      stats: {
        downloadCount: row.stat_downloadCount,
        thumbsUpCount: row.stat_thumbsUpCount,
        thumbsDownCount: row.stat_thumbsDownCount
      },
      files: files.map(f => ({
        id: f.id,
        sizeKB: f.sizeKB,
        name: f.name,
        type: f.type,
        pickleScanResult: f.pickleScanResult,
        pickleScanMessage: f.pickleScanMessage,
        virusScanResult: f.virusScanResult,
        scannedAt: f.scannedAt,
        metadata: { format: f.meta_format, size: f.meta_size, fp: f.meta_fp },
        hashes: {
          AutoV1: f.hash_AutoV1, AutoV2: f.hash_AutoV2, SHA256: f.hash_SHA256,
          CRC32: f.hash_CRC32, BLAKE3: f.hash_BLAKE3, AutoV3: f.hash_AutoV3
        },
        downloadUrl: f.downloadUrl,
        primary: !!f.is_primary
      })),
      images: images.map(img => ({
        url: img.url,
        nsfwLevel: img.nsfwLevel,
        width: img.width,
        height: img.height,
        hash: img.hash,
        type: img.type as "image" | "video",
        hasMeta: !!img.hasMeta,
        hasPositivePrompt: !!img.hasPositivePrompt,
        meta: img.meta_json ? JSON.parse(img.meta_json) : null
      })),
      downloadUrl: row.downloadUrl
    };
  }

  private static async buildModelDTOWithDB(db: Database, row: any): Promise<CivitaiModelResponse> {
    const tags = await db.select<{tag: string}[]>("SELECT tag FROM civitai_model_tags WHERE model_id = $1", [row.id]);
    const versionsRows = await db.select<any[]>("SELECT * FROM civitai_versions WHERE model_id = $1 ORDER BY createdAt DESC", [row.id]);
    const versions = await Promise.all(versionsRows.map(v => this.buildVersionDTOWithDB(db, v)));

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      type: row.type,
      allowNoCredit: !!row.allowNoCredit,
      allowCommercialUse: row.allowCommercialUse?.includes(",") ? row.allowCommercialUse.split(",") : row.allowCommercialUse,
      allowDerivatives: !!row.allowDerivatives,
      allowDifferentLicense: !!row.allowDifferentLicense,
      nsfw: !!row.nsfw,
      nsfwLevel: row.nsfwLevel,
      minor: !!row.minor,
      poi: !!row.poi,
      userId: row.userId,
      availability: row.availability as "Public" | "Private",
      stats: {
        downloadCount: row.stat_downloadCount,
        thumbsUpCount: row.stat_thumbsUpCount,
        thumbsDownCount: row.stat_thumbsDownCount,
        commentCount: row.stat_commentCount,
        tippedAmountCount: row.stat_tippedAmountCount
      },
      creator: { username: row.creator_username, image: row.creator_image || undefined },
      tags: tags.map(t => t.tag),
      modelVersions: versions
    };
  }

  // --- Composite Queries ---

  /**
   * 모든 로컬 파일의 캐시 데이터를 가져와서 관계형 데이터를 병합하여 반환합니다.
   */
  static async getAllCachedData() {
    return this.runExclusive(async (db) => {
      // 로컬 파일 목록
      const locals = await db.select<any[]>("SELECT * FROM local_files");
      
      // 관계형 데이터 벌크 로드
      const modelsRaw = await db.select<any[]>("SELECT * FROM civitai_models");
      const versionsRaw = await db.select<any[]>("SELECT * FROM civitai_versions");
      const tagsRaw = await db.select<any[]>("SELECT * FROM civitai_model_tags");
      const wordsRaw = await db.select<any[]>("SELECT * FROM civitai_version_words");
      const filesRaw = await db.select<any[]>("SELECT * FROM civitai_files");
      const imagesRaw = await db.select<any[]>("SELECT * FROM civitai_images");

      // 매핑 맵 구축
      const tagMap = new Map<number, string[]>();
      tagsRaw.forEach(t => {
        if (!tagMap.has(t.model_id)) tagMap.set(t.model_id, []);
        tagMap.get(t.model_id)!.push(t.tag);
      });

      const wordMap = new Map<number, string[]>();
      wordsRaw.forEach(w => {
        if (!wordMap.has(w.version_id)) wordMap.set(w.version_id, []);
        wordMap.get(w.version_id)!.push(w.word);
      });

      const fileMap = new Map<number, any[]>();
      filesRaw.forEach(f => {
        if (!fileMap.has(f.version_id)) fileMap.set(f.version_id, []);
        fileMap.get(f.version_id)!.push({
          id: f.id, sizeKB: f.sizeKB, name: f.name, type: f.type,
          pickleScanResult: f.pickleScanResult, pickleScanMessage: f.pickleScanMessage,
          virusScanResult: f.virusScanResult, scannedAt: f.scannedAt,
          metadata: { format: f.meta_format, size: f.meta_size, fp: f.meta_fp },
          hashes: { AutoV1: f.hash_AutoV1, AutoV2: f.hash_AutoV2, SHA256: f.hash_SHA256, CRC32: f.hash_CRC32, BLAKE3: f.hash_BLAKE3, AutoV3: f.hash_AutoV3 },
          downloadUrl: f.downloadUrl, primary: !!f.is_primary
        });
      });

      const imageMap = new Map<number, any[]>();
      imagesRaw.forEach(img => {
        if (!imageMap.has(img.version_id)) imageMap.set(img.version_id, []);
        imageMap.get(img.version_id)!.push({
          url: img.url, nsfwLevel: img.nsfwLevel, width: img.width, height: img.height,
          hash: img.hash, type: img.type as "image" | "video", hasMeta: !!img.hasMeta, hasPositivePrompt: !!img.hasPositivePrompt,
          meta: img.meta_json ? JSON.parse(img.meta_json) : null
        });
      });

      // 버전 객체 조립
      const vMap = new Map<number, CivitaiModelVersion>();
      versionsRaw.forEach(v => {
        vMap.set(v.id, {
          id: v.id, modelId: v.model_id, name: v.name, createdAt: v.createdAt, updatedAt: v.updatedAt,
          publishedAt: v.publishedAt, status: v.status as "Published" | "Draft" | "Archived", 
          baseModel: v.baseModel, baseModelType: v.baseModelType,
          description: v.description, availability: v.availability as "Public" | "Private", nsfwLevel: v.nsfwLevel,
          trainedWords: wordMap.get(v.id) || [],
          stats: { downloadCount: v.stat_downloadCount, thumbsUpCount: v.stat_thumbsUpCount, thumbsDownCount: v.stat_thumbsDownCount },
          files: fileMap.get(v.id) || [],
          images: imageMap.get(v.id) || [],
          downloadUrl: v.downloadUrl
        });
      });

      // 모델 객체 조립용 버전 그룹화
      const mVersionMap = new Map<number, CivitaiModelVersion[]>();
      vMap.forEach(v => {
        if (!mVersionMap.has(v.modelId)) mVersionMap.set(v.modelId, []);
        mVersionMap.get(v.modelId)!.push(v);
      });

      // 모델 객체 조립
      const mMap = new Map<number, any>();
      modelsRaw.forEach(m => {
        const versions = mVersionMap.get(m.id) || [];
        versions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        mMap.set(m.id, {
          id: m.id, 
          name: m.name, 
          description: m.description, // DB의 평문 설명
          type: m.type,
          allowNoCredit: !!m.allowNoCredit,
          allowCommercialUse: m.allowCommercialUse?.includes(",") ? m.allowCommercialUse.split(",") : m.allowCommercialUse,
          allowDerivatives: !!m.allowDerivatives, allowDifferentLicense: !!m.allowDifferentLicense,
          nsfw: !!m.nsfw, nsfwLevel: m.nsfwLevel, minor: !!m.minor, poi: !!m.poi,
          userId: m.userId, availability: m.availability as "Public" | "Private",
          stats: { downloadCount: m.stat_downloadCount, thumbsUpCount: m.stat_thumbsUpCount, thumbsDownCount: m.stat_thumbsDownCount, commentCount: m.stat_commentCount, tippedAmountCount: m.stat_tippedAmountCount },
          creator: { username: m.creator_username, image: m.creator_image || undefined },
          tags: tagMap.get(m.id) || [],
          modelVersions: versions,
          last_fetched_at: m.last_fetched_at
        });
      });

      const result: Record<string, any> = {};
      for (const f of locals) {
        const vData = f.version_id ? vMap.get(f.version_id) : null;
        const mData = vData ? mMap.get(vData.modelId) : null;
        const latestV = mData?.modelVersions?.[0] || vData;

        result[f.path] = {
          hash: f.hash,
          modified: f.modified,
          stableModified: f.stable_modified, // DB의 stable_modified를 반환 객체에 매핑
          versionId: f.version_id,
          currentVersionId: f.version_id,
          latestVersionId: latestV?.id,
          isNotFound: !!f.is_not_found,
          imageFetchFailed: !!f.image_fetch_failed,
          preview_path: f.preview_path,
          info_path: f.info_path,
          json_path: f.json_path,
          
          // 화면 표시용 필드 명시적 추가
          modelName: mData?.name || vData?.model?.name,
          currentVersion: vData?.name,
          latestVersion: latestV?.name,
          localReleaseDate: vData?.createdAt,
          lastReleaseDate: latestV?.createdAt,
          baseModel: latestV?.baseModel,
          localBaseModel: vData?.baseModel,
          hasNewVersion: !!f.has_new_version,
          isNewBase: !!f.is_new_base,
          
          localVersionData: vData,
          latestVersionData: latestV,
          modelDescription: mData?.description, // mData.description에 이미 평문이 들어있음
          civitaiUrl: mData ? `https://civitai.com/models/${mData.id}` : null,
          lastFetchedAt: mData?.last_fetched_at
        };
      }
      return result;
    });
  }

  // --- Error Logs ---

  static async saveErrorLog(log: any) {
    return this.runExclusive(async (db) => {
      await db.execute(
        `INSERT OR REPLACE INTO error_logs 
         (id, timestamp, method, url, status, message, body, headers, target, path)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          log.id, 
          log.timestamp, 
          log.method, 
          log.url || null, 
          log.status || null, 
          log.message, 
          log.body || null, 
          log.headers ? JSON.stringify(log.headers) : null,
          log.target || null,
          log.path || null
        ]
      );
    });
  }

  static async getErrorLogs() {
    return this.runExclusive(async (db) => {
      const rows = await db.select<any[]>("SELECT * FROM error_logs ORDER BY timestamp DESC");
      return rows.map(row => ({
        ...row,
        headers: row.headers ? JSON.parse(row.headers) : undefined
      }));
    });
  }

  static async deleteErrorLog(id: string) {
    return this.runExclusive(async (db) => {
      await db.execute("DELETE FROM error_logs WHERE id = $1", [id]);
    });
  }

  static async clearErrorLogs() {
    return this.runExclusive(async (db) => {
      await db.execute("DELETE FROM error_logs");
    });
  }
}
