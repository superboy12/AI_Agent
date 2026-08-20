import { JsonDB } from '../utils/jsonDB';
import { SocketManager } from '../services/monitor/SocketManager';

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
    private workspaceId?: string;

    constructor(workspaceId?: string) {
        this.workspaceId = workspaceId;
        const dbPath = workspaceId 
            ? `storage/workspaces/${workspaceId}/database/history.json`
            : 'storage/database/history.json';
        this.db = new JsonDB(dbPath);
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
        const success = await this.db.write(data);
        if (success) {
            SocketManager.getInstance().emitActivity({
                time: record.generateDate,
                user: record.userId,
                action: record.templateName === 'N/A (Dari Nol)' ? 'Generate from scratch' : 'Generate DOCX',
                status: record.status === 'success' ? 'Success' : 'Failed',
                details: record.filename
            });
        }
        return success;
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
