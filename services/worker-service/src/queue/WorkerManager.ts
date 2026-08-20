import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';

export class WorkerManager {
    private connection: IORedis;
    private worker?: Worker;
    private documentServiceUrl = process.env.DOCUMENT_SERVICE_URL || 'http://localhost:3002';
    private storageServiceUrl = process.env.STORAGE_SERVICE_URL || 'http://localhost:3003';

    constructor() {
        this.connection = new IORedis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379', 10)
        });
    }

    async start() {
        this.worker = new Worker('document-jobs', async (job: Job) => {
            console.log(`[Worker] Processing job ${job.id} of type ${job.name}`);
            
            try {
                if (job.name === 'generate-batch') {
                    await this.processBatch(job);
                } else if (job.name === 'generate-single') {
                    await this.processSingle(job);
                }
            } catch (err: any) {
                console.error(`[Worker] Job ${job.id} failed:`, err.message);
                throw err;
            }
        }, { connection: this.connection, concurrency: 5 });

        this.worker.on('completed', (job) => {
            console.log(`[Worker] Job ${job.id} completed successfully!`);
        });

        this.worker.on('failed', (job, err) => {
            console.error(`[Worker] Job ${job?.id} failed with error ${err.message}`);
        });

        console.log('[Worker] Connected to Redis Queue and listening for jobs...');
    }

    private async processSingle(job: Job) {
        const { templatePath, textData, userId } = job.data;
        // In reality, we call DocumentService to generate the DOCX.
        // For Phase 3, we mock the call or prepare the HTTP request.
        console.log(`[Worker] Simulating document generation for ${userId}...`);
        
        await job.updateProgress(50);
        
        // Simulating upload to Storage
        await job.updateProgress(100);
        return { success: true, result: 'storage://workspace-x/documents/result.docx' };
    }

    private async processBatch(job: Job) {
        const { excelData, templateId, userId } = job.data;
        console.log(`[Worker] Processing batch for ${userId}...`);
        
        // Simulating heavy batch processing
        const total = 100;
        for (let i = 1; i <= total; i += 10) {
            await new Promise(r => setTimeout(r, 500));
            await job.updateProgress(i);
        }
        
        await job.updateProgress(100);
        return { success: true, resultUrl: 'storage://workspace-x/zip/batch_results.zip' };
    }
}
