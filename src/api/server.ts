import express from 'express';
import http from 'http';
import { SocketManager } from '../services/monitor/SocketManager';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { WorkspaceController } from '../controllers/workspaceController';
import { ImageController } from '../controllers/imageController';
import { JobController } from '../controllers/jobController';
import { TemplateController } from '../controllers/templateController';
import { ChatController } from '../controllers/chatController';
import { config } from '../config/env';

export class ApiServer {
    private app: express.Application;
    private server: http.Server;
    private workspaceController: WorkspaceController;
    private imageController: ImageController;
    private jobController: JobController;
    private templateController: TemplateController;
    private chatController: ChatController;
    private upload: multer.Multer;

    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.workspaceController = new WorkspaceController();
        this.imageController = new ImageController();
        this.jobController = new JobController();
        this.templateController = new TemplateController();
        this.chatController = new ChatController();
        // Increase limit for large ZIP uploads
        this.upload = multer({ dest: 'storage/temp/', limits: { fileSize: 500 * 1024 * 1024 } });

        this.setupMiddleware();
        this.setupRoutes();
    }

    private setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        // Serve static files for dashboard frontend
        this.app.use(express.static(path.join(process.cwd(), 'public')));
        
        // Serve static files for the new React monitoring frontend
        this.app.use('/monitor', express.static(path.join(process.cwd(), 'public/monitor')));
        // SPA fallback for React router
        this.app.get(/^\/monitor\/.*/, (req, res) => {
            res.sendFile(path.join(process.cwd(), 'public/monitor/index.html'));
        });
    }

    private setupRoutes() {
        // Workspace Routes
        this.app.get('/api/workspaces', this.workspaceController.getAllWorkspaces);
        this.app.post('/api/workspaces', this.workspaceController.createWorkspace);
        this.app.get('/api/workspaces/global-stats', this.workspaceController.getGlobalStats);
        
        this.app.get('/api/workspaces/:id', this.workspaceController.getWorkspace);
        this.app.put('/api/workspaces/:id', this.workspaceController.updateWorkspace);
        this.app.delete('/api/workspaces/:id', this.workspaceController.deleteWorkspace);
        
        this.app.post('/api/workspaces/:id/duplicate', this.workspaceController.duplicateWorkspace);
        this.app.get('/api/workspaces/:id/export', this.workspaceController.exportWorkspace);
        this.app.post('/api/workspaces/import', this.upload.single('file'), this.workspaceController.importWorkspace);
        
        this.app.get('/api/workspaces/:id/stats', this.workspaceController.getWorkspaceStats);

        // Template Routes
        this.app.get('/api/templates', this.templateController.getTemplates);
        this.app.post('/api/templates/upload', this.upload.single('file'), this.templateController.uploadTemplate);
        this.app.delete('/api/templates/:id', this.templateController.deleteTemplate);

        // ─── AI Cache & Learning Routes ───────────────────────────────────────
        this.app.get('/api/cache/stats', async (req, res) => {
            try {
                const { cacheService } = require('../services/ai/CacheService');
                const stats = await cacheService.getStats();
                res.json(stats);
            } catch (err: any) {
                res.status(500).json({ error: err.message });
            }
        });
        
        this.app.get('/api/learning/stats', async (req, res) => {
            try {
                const { learningService } = require('../services/ai/LearningService');
                const stats = await learningService.getStats();
                res.json(stats);
            } catch (err: any) {
                res.status(500).json({ error: err.message });
            }
        });

        // ─── Image Engine Routes ──────────────────────────────────────────────
        const imgUpload = multer({ dest: 'storage/temp/' });
        this.app.get('/api/image/modes', this.imageController.getModes);
        this.app.post('/api/image/process', imgUpload.single('image'), this.imageController.processImage);
        this.app.post('/api/image/layout',  imgUpload.array('images', 9), this.imageController.createLayout);
        this.app.post('/api/image/resolve-mode', this.imageController.resolveMode);

        // ─── Job Routes ──────────────────────────────────────────────
        this.app.get('/api/jobs', this.jobController.getAllJobs);
        this.app.get('/api/jobs/:id', this.jobController.getJob);
        this.app.delete('/api/jobs/:id', this.jobController.deleteJob);
        this.app.get('/download/:fileId', this.jobController.viewDownloadPage.bind(this.jobController));
        this.app.get('/api/download/raw/:fileId', this.jobController.downloadZipRaw.bind(this.jobController));

        // ─── Chat Route ──────────────────────────────────────────────
        this.app.post('/api/chat', this.upload.single('file'), this.chatController.handleChat);
    }

    public start() {
        const port = process.env.PORT || 3000;
        
        // Initialize Socket.IO
        SocketManager.getInstance().init(this.server);

        this.server.listen(port, '0.0.0.0', () => {
            console.log(`API Server & Web Dashboard running at http://localhost:${port}`);
            console.log(`Monitoring Dashboard running at http://localhost:${port}/monitor`);
        });
    }
}
