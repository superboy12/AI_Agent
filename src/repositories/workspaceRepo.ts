import { JsonDB } from '../utils/jsonDB';
import { Workspace } from '../models/workspace';
import fs from 'fs/promises';
import path from 'path';

export class WorkspaceRepo {
    private db: JsonDB<{ workspaces: Workspace[] }>;

    constructor() {
        this.db = new JsonDB('storage/database/workspaces.json');
    }

    public async init() {
        await this.db.init({ workspaces: [] });
    }

    public async getAll(): Promise<Workspace[]> {
        const data = await this.db.read();
        return data?.workspaces || [];
    }

    public async getById(id: string): Promise<Workspace | undefined> {
        const workspaces = await this.getAll();
        return workspaces.find(w => w.id === id);
    }

    public async add(workspace: Workspace): Promise<boolean> {
        const data = await this.db.read();
        if (!data) return false;
        data.workspaces.push(workspace);
        
        // Create workspace directory structure
        const baseDir = path.resolve(process.cwd(), 'storage/workspaces', workspace.id);
        const folders = ['chat', 'documents', 'templates', 'excel', 'history', 'logs', 'memory', 'config', 'exports', 'temp'];
        for (const folder of folders) {
            await fs.mkdir(path.join(baseDir, folder), { recursive: true });
        }

        return await this.db.write(data);
    }

    public async update(id: string, updateData: Partial<Workspace>): Promise<boolean> {
        const data = await this.db.read();
        if (!data) return false;
        
        const index = data.workspaces.findIndex(w => w.id === id);
        if (index === -1) return false;

        data.workspaces[index] = { ...data.workspaces[index], ...updateData };
        return await this.db.write(data);
    }

    public async delete(id: string): Promise<boolean> {
        const data = await this.db.read();
        if (!data) return false;

        const initialLength = data.workspaces.length;
        data.workspaces = data.workspaces.filter(w => w.id !== id);
        
        if (data.workspaces.length === initialLength) return false;
        
        // Remove directory structure
        try {
            const baseDir = path.resolve(process.cwd(), 'storage/workspaces', id);
            await fs.rm(baseDir, { recursive: true, force: true });
        } catch (error) {
            console.error(`[WorkspaceRepo] Failed to delete workspace directory for ${id}:`, error);
        }

        return await this.db.write(data);
    }
}
