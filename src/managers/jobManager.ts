import { BatchService } from '../services/batchService';

export class JobManager {
    private static instance: JobManager;
    private batchService: BatchService;

    private constructor() {
        this.batchService = new BatchService();
    }

    public static getInstance(): JobManager {
        if (!JobManager.instance) {
            JobManager.instance = new JobManager();
        }
        return JobManager.instance;
    }

    public getBatchService(): BatchService {
        return this.batchService;
    }
}
