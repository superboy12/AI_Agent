import { JsonDB } from '../utils/jsonDB';

export interface MemoryRecord {
    userId: string;
    content: string;
    lastUpdated: number;
}

export class MemoryRepo {
    private db: JsonDB<{ records: MemoryRecord[] }>;
    private workspaceId?: string;

    constructor(workspaceId?: string) {
        this.workspaceId = workspaceId;
        const dbPath = workspaceId 
            ? `storage/workspaces/${workspaceId}/database/memory.json`
            : 'storage/database/memory.json';
        this.db = new JsonDB(dbPath);
    }

    public async init() {
        await this.db.init({ records: [] });
    }

    public async getAll(): Promise<MemoryRecord[]> {
        const data = await this.db.read();
        return data?.records || [];
    }
    
    public async getByUserId(userId: string): Promise<MemoryRecord | undefined> {
        const records = await this.getAll();
        return records.find(r => r.userId === userId);
    }

    public async saveMemory(userId: string, content: string): Promise<boolean> {
        const data = await this.db.read();
        if (!data) return false;

        const existingIndex = data.records.findIndex(r => r.userId === userId);
        if (existingIndex >= 0) {
            // Append with double newline
            data.records[existingIndex].content += `\n\n${content}`;
            data.records[existingIndex].lastUpdated = Date.now();
        } else {
            // Create new
            data.records.push({
                userId,
                content,
                lastUpdated: Date.now()
            });
        }
        
        return await this.db.write(data);
    }

    public async clearMemory(userId: string): Promise<boolean> {
        const data = await this.db.read();
        if (!data) return false;

        const initialLength = data.records.length;
        data.records = data.records.filter(r => r.userId !== userId);
        
        if (data.records.length === initialLength) return false;
        return await this.db.write(data);
    }
}
