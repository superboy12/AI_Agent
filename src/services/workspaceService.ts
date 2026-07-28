import { WorkspaceRepo } from '../repositories/workspaceRepo';
import { Workspace } from '../models/workspace';
import { HistoryRepo } from '../repositories/historyRepo';
import { TemplateRepo } from '../repositories/templateRepo';
import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs/promises';

export class WorkspaceService {
    private repo: WorkspaceRepo;

    constructor() {
        this.repo = new WorkspaceRepo();
    }

    public async init() {
        await this.repo.init();
    }

    public async getAllWorkspaces(): Promise<Workspace[]> {
        const workspaces = await this.repo.getAll();
        // Decorate with stats
        for (const w of workspaces) {
            const historyRepo = new HistoryRepo(w.id);
            const templateRepo = new TemplateRepo(w.id);
            await historyRepo.init();
            await templateRepo.init();
            
            const history = await historyRepo.getAll();
            const templates = await templateRepo.getAll();
            
            w.stats = {
                documentCount: history.length,
                templateCount: templates.length,
                chatCount: 0 // Placeholder
            };
        }
        return workspaces;
    }

    public async getWorkspace(id: string): Promise<Workspace | undefined> {
        return await this.repo.getById(id);
    }

    public async createWorkspace(name: string, description: string, icon: string, color: string): Promise<Workspace> {
        const workspace: Workspace = {
            id: Date.now().toString(),
            name,
            description,
            icon,
            color,
            isFavorite: false,
            createdAt: Date.now(),
            lastOpenedAt: Date.now()
        };
        await this.repo.add(workspace);
        return workspace;
    }

    public async updateWorkspace(id: string, data: Partial<Workspace>): Promise<boolean> {
        return await this.repo.update(id, data);
    }

    public async deleteWorkspace(id: string): Promise<boolean> {
        return await this.repo.delete(id);
    }

    public async duplicateWorkspace(id: string): Promise<Workspace | null> {
        const existing = await this.repo.getById(id);
        if (!existing) return null;

        const newId = Date.now().toString();
        const newWorkspace: Workspace = {
            ...existing,
            id: newId,
            name: `${existing.name} (Copy)`,
            createdAt: Date.now(),
            lastOpenedAt: Date.now(),
            isFavorite: false
        };

        await this.repo.add(newWorkspace);
        
        // Copy directory contents
        const srcDir = path.resolve(process.cwd(), 'storage/workspaces', id);
        const destDir = path.resolve(process.cwd(), 'storage/workspaces', newId);
        
        try {
            await this.copyDirectory(srcDir, destDir);
        } catch (error) {
            console.error(`Failed to copy directory contents for duplicated workspace ${newId}`, error);
        }

        return newWorkspace;
    }

    public async exportWorkspace(id: string): Promise<string | null> {
        const workspace = await this.repo.getById(id);
        if (!workspace) return null;

        const srcDir = path.resolve(process.cwd(), 'storage/workspaces', id);
        const exportPath = path.resolve(process.cwd(), 'temp', `workspace_${id}_export.zip`);

        try {
            await fs.mkdir(path.dirname(exportPath), { recursive: true });
            
            const zip = new AdmZip();
            zip.addLocalFolder(srcDir);
            // Also append the workspace metadata
            zip.addFile('workspace_meta.json', Buffer.from(JSON.stringify(workspace, null, 2), 'utf8'));
            
            zip.writeZip(exportPath);
            return exportPath;
        } catch (error) {
            console.error(`Failed to export workspace ${id}`, error);
            return null;
        }
    }

    public async importWorkspace(zipFilePath: string): Promise<Workspace | null> {
        try {
            const zip = new AdmZip(zipFilePath);
            const zipEntries = zip.getEntries();
            
            const metaEntry = zipEntries.find(e => e.entryName === 'workspace_meta.json');
            if (!metaEntry) {
                throw new Error("Invalid workspace export format.");
            }

            const metaStr = metaEntry.getData().toString('utf8');
            const originalMeta: Workspace = JSON.parse(metaStr);
            
            // Create a new ID to avoid collisions
            const newId = Date.now().toString();
            const newWorkspace: Workspace = {
                ...originalMeta,
                id: newId,
                name: `${originalMeta.name} (Imported)`,
                createdAt: Date.now(),
                lastOpenedAt: Date.now(),
            };

            await this.repo.add(newWorkspace);

            const destDir = path.resolve(process.cwd(), 'storage/workspaces', newId);
            
            // Extract everything EXCEPT workspace_meta.json
            for (const entry of zipEntries) {
                if (entry.entryName !== 'workspace_meta.json') {
                    zip.extractEntryTo(entry, destDir, true, true);
                }
            }
            
            return newWorkspace;
        } catch (error) {
            console.error("Failed to import workspace", error);
            return null;
        } finally {
            // Clean up the uploaded zip
            try {
                await fs.unlink(zipFilePath);
            } catch (e) { }
        }
    }

    private async copyDirectory(src: string, dest: string) {
        const entries = await fs.readdir(src, { withFileTypes: true });
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);

            if (entry.isDirectory()) {
                await fs.mkdir(destPath, { recursive: true });
                await this.copyDirectory(srcPath, destPath);
            } else {
                await fs.copyFile(srcPath, destPath);
            }
        }
    }
}
