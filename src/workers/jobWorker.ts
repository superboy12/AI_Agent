import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { BatchService } from '../services/batchService';
import { JobManager } from '../managers/jobManager';

const connection = new IORedis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    maxRetriesPerRequest: null,
});

export const initWorkers = () => {
    console.log('Initializing BullMQ Workers...');

    const worker = new Worker('document-jobs', async (job: Job) => {
        console.log(`[Worker] Processing Job ID: ${job.id}, Name: ${job.name}`);
        
        if (job.name === 'generate-batch') {
            const { jobId, templatePath, items } = job.data;
            
            const batchService = JobManager.getInstance().getBatchService();
            const batchRepo = batchService.getRepo();
            
            const batchJobObj = await batchRepo.getById(jobId);
            if (!batchJobObj) {
                throw new Error(`Batch job ${jobId} not found in DB`);
            }

            await batchService.processBatch(batchJobObj, templatePath, items, async (updatedJob) => {
                // Update progress to BullMQ
                await job.updateProgress(updatedJob.progress);
            });
            
            return { status: 'completed', jobId };
        }
    }, { connection, concurrency: 1 });

    worker.on('completed', job => {
        console.log(`[Worker] Job ${job.id} has completed!`);
    });

    worker.on('failed', (job, err) => {
        console.error(`[Worker] Job ${job?.id} has failed with ${err.message}`);
    });

    return worker;
};
