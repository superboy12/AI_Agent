import { JsonDB } from '../utils/jsonDB';

export interface LearnedAlias {
    canonical: string;   // e.g. "tanggal"
    alias: string;       // e.g. "nama kth"
    learnedAt: number;   // timestamp
    source: 'ai_match' | 'user_confirm' | 'auto'; // how it was learned
}

interface FieldDictionaryDB {
    learnedAliases: LearnedAlias[];
}

/**
 * FieldDictionaryRepository
 *
 * Persists aliases that the AI learns during usage (Field Learning feature).
 * On startup, these learned aliases are merged into the FieldDictionary singleton
 * so subsequent runs benefit without needing another AI call.
 *
 * DB path: storage/database/field_dictionary.json
 * ADDITIVE ONLY — does not modify any existing service.
 */
export class FieldDictionaryRepository {
    private db: JsonDB<FieldDictionaryDB>;

    constructor(workspaceId?: string) {
        const dbPath = workspaceId
            ? `storage/workspaces/${workspaceId}/database/field_dictionary.json`
            : 'storage/database/field_dictionary.json';
        this.db = new JsonDB(dbPath);
    }

    public async init(): Promise<void> {
        await this.db.init({ learnedAliases: [] });
    }

    public async getAll(): Promise<LearnedAlias[]> {
        const data = await this.db.read();
        return data?.learnedAliases ?? [];
    }

    /**
     * Save a newly learned alias.
     * Skips duplicates silently.
     */
    public async addAlias(
        canonical: string,
        alias: string,
        source: LearnedAlias['source'] = 'ai_match',
    ): Promise<void> {
        const data = await this.db.read() ?? { learnedAliases: [] };
        const normAlias = alias.toLowerCase().trim();

        const exists = data.learnedAliases.some(
            a => a.canonical === canonical && a.alias === normAlias
        );
        if (exists) return;

        data.learnedAliases.push({
            canonical,
            alias: normAlias,
            learnedAt: Date.now(),
            source,
        });
        await this.db.write(data);
        console.log(`[FieldDictionary] Learned new alias: "${alias}" → "${canonical}"`);
    }

    /**
     * Delete all learned aliases for a canonical field (for reset/cleanup).
     */
    public async clearCanonical(canonical: string): Promise<void> {
        const data = await this.db.read();
        if (!data) return;
        data.learnedAliases = data.learnedAliases.filter(a => a.canonical !== canonical);
        await this.db.write(data);
    }

    /**
     * Delete all learned aliases (full reset).
     */
    public async clearAll(): Promise<void> {
        await this.db.write({ learnedAliases: [] });
    }
}
