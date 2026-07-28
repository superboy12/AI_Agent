import { Request, Response } from 'express';
import { WorkspaceService } from '../services/workspaceService';
import { AgentService } from '../services/agentService';
import multer from 'multer';

const upload = multer({ dest: 'storage/temp/' });

export class WorkspaceController {
    private workspaceService: WorkspaceService;

    constructor() {
        this.workspaceService = new WorkspaceService();
    }

    public getAllWorkspaces = async (req: Request, res: Response) => {
        try {
            const workspaces = await this.workspaceService.getAllWorkspaces();
            res.json(workspaces);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    };

    public getWorkspace = async (req: Request, res: Response) => {
        try {
            const workspace = await this.workspaceService.getWorkspace(req.params.id as string);
            if (!workspace) {
                return res.status(404).json({ error: 'Workspace not found' });
            }
            res.json(workspace);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    };

    public createWorkspace = async (req: Request, res: Response) => {
        try {
            const { name, description } = req.body;
            if (!name) {
                return res.status(400).json({ error: 'Name is required' });
            }
            const icon = req.body.icon || 'fa-solid fa-folder';
            const color = req.body.color || '#3b82f6';
            const workspace = await this.workspaceService.createWorkspace(name, description || '', icon, color);
            res.status(201).json(workspace);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    };

    public updateWorkspace = async (req: Request, res: Response) => {
        try {
            const { name, description } = req.body;
            const workspace = await this.workspaceService.updateWorkspace(req.params.id as string, { name, description });
            if (!workspace) {
                return res.status(404).json({ error: 'Workspace not found' });
            }
            res.json(workspace);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    };

    public deleteWorkspace = async (req: Request, res: Response) => {
        try {
            const success = await this.workspaceService.deleteWorkspace(req.params.id as string);
            if (!success) {
                return res.status(404).json({ error: 'Workspace not found' });
            }
            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    };

    public duplicateWorkspace = async (req: Request, res: Response) => {
        try {
            const newWorkspace = await this.workspaceService.duplicateWorkspace(req.params.id as string);
            res.json(newWorkspace);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    };

    public exportWorkspace = async (req: Request, res: Response) => {
        try {
            const zipPath = await this.workspaceService.exportWorkspace(req.params.id as string);
            if (zipPath) {
                res.download(zipPath, `workspace_${req.params.id}.zip`, (err) => {
                    const fs = require('fs');
                    if (fs.existsSync(zipPath)) {
                        fs.unlinkSync(zipPath); // Cleanup after send
                    }
                });
            } else {
                res.status(500).json({ error: 'Failed to export workspace' });
            }
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    };

    public importWorkspace = async (req: Request, res: Response) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'Zip file is required' });
            }
            const workspace = await this.workspaceService.importWorkspace(req.file.path);
            res.json(workspace);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    };

    public getWorkspaceStats = async (req: Request, res: Response) => {
        try {
            const workspace = await this.workspaceService.getWorkspace(req.params.id as string);
            if (!workspace) {
                return res.status(404).json({ error: 'Workspace not found' });
            }
            
            const agentService = new AgentService(req.params.id as string);
            await agentService.init();
            
            const templates = await agentService.templateRepo.getAll();
            const histories = await agentService.historyRepo.getAll();
            
            res.json({
                templateCount: templates.length,
                documentCount: histories.length,
                memoryCount: 0 // Simplification since memory is per-user
            });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    };

    public getGlobalStats = async (req: Request, res: Response) => {
        try {
            const agentService = new AgentService();
            await agentService.init();
            
            const templates = await agentService.templateRepo.getAll();
            const histories = await agentService.historyRepo.getAll();
            
            res.json({
                templateCount: templates.length,
                documentCount: histories.length,
                memoryCount: 0 // Simplification since memory is per-user
            });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    };
}
