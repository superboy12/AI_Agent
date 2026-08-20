import IORedis from 'ioredis';

export interface CacheEntry {
    id: string; // Hash of (excelHash + templateVersion + promptVersion + aiVersion + mode)
    excelHash: string;
    templateName: string;
    templateVersion: string;
    promptVersion: string;
    aiVersion: string;
    mappingResult: any;
    placeholderMapping: any;
    metadata: any;
    outputDocxPath?: string;
    outputPdfPath?: string;
    createdAt: number;
    sizeBytes: number;
    hits: number;
}

export interface CacheStats {
    totalHits: number;
    totalMisses: number;
    totalSize: number;
}

export class CacheRepo {
    private redis: IORedis;

    constructor() {
        this.redis = new IORedis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
            maxRetriesPerRequest: null,
        });
    }

    public async init() {
        // Redis doesn't need explicit schema initialization
    }

    public async getById(id: string): Promise<CacheEntry | undefined> {
        const data = await this.redis.get(`cache:entry:${id}`);
        if (!data) return undefined;
        try {
            return JSON.parse(data) as CacheEntry;
        } catch (e) {
            return undefined;
        }
    }

    public async getStats(): Promise<CacheStats> {
        const stats = await this.redis.hgetall('cache:stats');
        return {
            totalHits: parseInt(stats.totalHits || '0', 10),
            totalMisses: parseInt(stats.totalMisses || '0', 10),
            totalSize: parseInt(stats.totalSize || '0', 10)
        };
    }

    public async add(entry: CacheEntry): Promise<boolean> {
        // If it already exists, subtract the old size first
        const oldData = await this.redis.get(`cache:entry:${entry.id}`);
        if (oldData) {
            try {
                const oldEntry = JSON.parse(oldData);
                await this.redis.hincrby('cache:stats', 'totalSize', -oldEntry.sizeBytes);
            } catch (e) {}
        }

        await this.redis.set(`cache:entry:${entry.id}`, JSON.stringify(entry));
        await this.redis.zadd('cache:createdAt', entry.createdAt, entry.id);
        await this.redis.hincrby('cache:stats', 'totalSize', entry.sizeBytes);
        return true;
    }

    public async incrementHit(id: string): Promise<void> {
        const data = await this.redis.get(`cache:entry:${id}`);
        if (data) {
            try {
                const entry = JSON.parse(data) as CacheEntry;
                entry.hits += 1;
                await this.redis.set(`cache:entry:${id}`, JSON.stringify(entry));
            } catch (e) {}
        }
        await this.redis.hincrby('cache:stats', 'totalHits', 1);
    }

    public async incrementMiss(): Promise<void> {
        await this.redis.hincrby('cache:stats', 'totalMisses', 1);
    }

    public async cleanup(days: number): Promise<number> {
        const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
        
        // Find all IDs older than cutoffTime
        const expiredIds = await this.redis.zrangebyscore('cache:createdAt', '-inf', cutoffTime);
        
        if (expiredIds.length === 0) return 0;

        let removedSize = 0;
        let count = 0;

        for (const id of expiredIds) {
            const data = await this.redis.get(`cache:entry:${id}`);
            if (data) {
                try {
                    const entry = JSON.parse(data) as CacheEntry;
                    removedSize += entry.sizeBytes;
                } catch(e) {}
                await this.redis.del(`cache:entry:${id}`);
                count++;
            }
        }

        if (expiredIds.length > 0) {
            await this.redis.zremrangebyscore('cache:createdAt', '-inf', cutoffTime);
        }

        if (removedSize > 0) {
            await this.redis.hincrby('cache:stats', 'totalSize', -removedSize);
        }

        return count;
    }

    public async clearAll(): Promise<void> {
        const keys = await this.redis.keys('cache:entry:*');
        if (keys.length > 0) {
            await this.redis.del(...keys);
        }
        await this.redis.del('cache:createdAt');
        await this.redis.del('cache:stats');
    }
}
