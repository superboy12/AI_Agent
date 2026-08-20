import crypto from 'crypto';
import { CacheRepo, CacheEntry, CacheStats } from '../../repositories/cacheRepo';

export class CacheService {
    private repo: CacheRepo;

    constructor() {
        this.repo = new CacheRepo();
        this.repo.init();
    }

    private generateHash(excelHash: string, templateVersion: string, promptVersion: string, aiVersion: string, mode: string): string {
        const payload = `${excelHash}|${templateVersion}|${promptVersion}|${aiVersion}|${mode}`;
        return crypto.createHash('sha256').update(payload).digest('hex');
    }

    public async checkCache(
        excelHash: string, 
        templateVersion: string, 
        promptVersion: string, 
        aiVersion: string,
        mode: string
    ): Promise<CacheEntry | null> {
        const hash = this.generateHash(excelHash, templateVersion, promptVersion, aiVersion, mode);
        const entry = await this.repo.getById(hash);
        
        if (entry) {
            await this.repo.incrementHit(hash);
            return entry;
        } else {
            await this.repo.incrementMiss();
            return null;
        }
    }

    public async saveCache(
        excelHash: string,
        templateName: string,
        templateVersion: string,
        promptVersion: string,
        aiVersion: string,
        mode: string,
        mappingResult: any,
        placeholderMapping: any,
        metadata: any,
        outputDocxPath?: string,
        outputPdfPath?: string
    ): Promise<void> {
        const hash = this.generateHash(excelHash, templateVersion, promptVersion, aiVersion, mode);
        
        // Approximate size
        const sizeBytes = JSON.stringify(mappingResult).length + JSON.stringify(placeholderMapping).length;
        
        const entry: CacheEntry = {
            id: hash,
            excelHash,
            templateName,
            templateVersion,
            promptVersion,
            aiVersion,
            mappingResult,
            placeholderMapping,
            metadata,
            outputDocxPath,
            outputPdfPath,
            createdAt: Date.now(),
            sizeBytes,
            hits: 0
        };

        await this.repo.add(entry);
    }

    public async getStats(): Promise<{ stats: CacheStats, efficiency: number }> {
        const stats = await this.repo.getStats();
        const totalReqs = stats.totalHits + stats.totalMisses;
        const efficiency = totalReqs > 0 ? (stats.totalHits / totalReqs) * 100 : 0;
        
        return {
            stats,
            efficiency
        };
    }

    public async cleanup(days: number = 30): Promise<number> {
        return await this.repo.cleanup(days);
    }

    public async clearAll(): Promise<void> {
        return await this.repo.clearAll();
    }
}

export const cacheService = new CacheService();
