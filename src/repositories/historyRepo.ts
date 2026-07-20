import { JsonDB } from '../utils/jsonDB';

export interface HistoryRecord {
    id: string;
    filename: string;
    templateName: string;
    generateDate: number;
    userId: string;
    status: 'success' | 'failed';
    processingTimeMs: number;
    sizeBytes: number;
    filePath: string;
}

export class HistoryRepo {
    private db: JsonDB<{ records: HistoryRecord[] }>;

    constructor() {
        this.db = new JsonDB('storage/database/history.json');
    }

    public async init() {
        await this.db.init({ records: [] });
    }

    public async getAll(): Promise<HistoryRecord[]> {
        const data = await this.db.read();
        return data?.records || [];
    }
    
    public async getByUserId(userId: string): Promise<HistoryRecord[]> {
        const records = await this.getAll();
        return records.filter(r => r.userId === userId);
    }

    public async add(record: HistoryRecord): Promise<boolean> {
        const data = await this.db.read();
        if (!data) return false;
        data.records.push(record);
        return await this.db.write(data);
    }

    public async getById(id: string): Promise<HistoryRecord | undefined> {
        const records = await this.getAll();
        return records.find(r => r.id === id);
    }

    public async delete(id: string): Promise<boolean> {
        const data = await this.db.read();
        if (!data) return false;

        const initialLength = data.records.length;
        data.records = data.records.filter(r => r.id !== id);
        
        if (data.records.length === initialLength) return false;
        return await this.db.write(data);
    }
}
