import fs from 'fs';
import path from 'path';

export interface BatchJob {
    id: string; // e.g., Batch_20260727_001
    userId: string;
    templateId: string;
    status: 'queue' | 'processing' | 'completed' | 'failed';
    progress: number; // 0 to 100
    totalFiles: number;
    successCount: number;
    failedCount: number;
    startTime: number;
    finishTime?: number;
    downloadUrl?: string;
    zipSize?: number;
    expireAt?: number;
}

export class BatchRepo {
    private filePath: string;
    private jobs: BatchJob[] = [];

    constructor(workspaceId?: string) {
        const storageDir = workspaceId
            ? path.join(process.cwd(), 'storage', 'workspaces', workspaceId, 'db')
            : path.join(process.cwd(), 'storage', 'db');
            
        if (!fs.existsSync(storageDir)) {
            fs.mkdirSync(storageDir, { recursive: true });
        }
        
        this.filePath = path.join(storageDir, 'batches.json');
        this.load();
    }

    private load(): void {
        try {
            if (fs.existsSync(this.filePath)) {
                const data = fs.readFileSync(this.filePath, 'utf-8');
                this.jobs = JSON.parse(data);
            }
        } catch (error) {
            console.error('Failed to load batches.json', error);
        }
    }

    private save(): void {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(this.jobs, null, 2));
        } catch (error) {
            console.error('Failed to save batches.json', error);
        }
    }

    public async add(job: BatchJob): Promise<void> {
        this.jobs.push(job);
        this.save();
    }

    public async update(id: string, partialJob: Partial<BatchJob>): Promise<void> {
        const index = this.jobs.findIndex(j => j.id === id);
        if (index !== -1) {
            this.jobs[index] = { ...this.jobs[index], ...partialJob };
            this.save();
        }
    }

    public async getById(id: string): Promise<BatchJob | undefined> {
        return this.jobs.find(j => j.id === id);
    }

    public async getAll(): Promise<BatchJob[]> {
        return this.jobs;
    }

    public async delete(id: string): Promise<boolean> {
        const index = this.jobs.findIndex(j => j.id === id);
        if (index !== -1) {
            this.jobs.splice(index, 1);
            this.save();
            return true;
        }
        return false;
    }
}
