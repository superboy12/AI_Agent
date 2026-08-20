import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export class QueueClient {
    private static connection = new IORedis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        maxRetriesPerRequest: null,
    });
    
    private static documentQueue = new Queue('document-jobs', {
        connection: QueueClient.connection,
        defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 }
        }
    });

    static async enqueueBatch(jobData: any): Promise<void> {
        await this.documentQueue.add('generate-batch', jobData);
    }
    
    static async enqueueSingle(jobData: any): Promise<void> {
        await this.documentQueue.add('generate-single', jobData);
    }
}
