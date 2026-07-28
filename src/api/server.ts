import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { WorkspaceController } from '../controllers/workspaceController';
import { ImageController } from '../controllers/imageController';
import { JobController } from '../controllers/jobController';
import { config } from '../config/env';

export class ApiServer {
    private app: express.Application;
    private workspaceController: WorkspaceController;
    private imageController: ImageController;
    private jobController: JobController;
    private upload: multer.Multer;

    constructor() {
        this.app = express();
        this.workspaceController = new WorkspaceController();
        this.imageController = new ImageController();
        this.jobController = new JobController();
        this.upload = multer({ dest: 'storage/temp/' });

        this.setupMiddleware();
        this.setupRoutes();
    }

    private setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        // Serve static files for dashboard frontend
        this.app.use(express.static(path.join(process.cwd(), 'public')));
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
    }

    public start() {
        const port = process.env.PORT || 3000;
        this.app.listen(port, () => {
            console.log(`API Server & Web Dashboard running at http://localhost:${port}`);
        });
    }
}
