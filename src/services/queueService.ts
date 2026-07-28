export interface QueueJob<T> {
    id: string;
    task: () => Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: any) => void;
}

export class QueueService {
    private queue: QueueJob<any>[] = [];
    private isProcessing = false;

    public async enqueue<T>(id: string, task: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.queue.push({ id, task, resolve, reject });
            this.processNext();
        });
    }

    private async processNext(): Promise<void> {
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }

        this.isProcessing = true;
        const job = this.queue.shift();

        if (job) {
            try {
                const result = await job.task();
                job.resolve(result);
            } catch (error) {
                job.reject(error);
            } finally {
                this.isProcessing = false;
                this.processNext();
            }
        } else {
            this.isProcessing = false;
        }
    }

    public getQueueLength(): number {
        return this.queue.length;
    }
}
