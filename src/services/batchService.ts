import { BatchRepo, BatchJob } from '../repositories/batchRepo';
import { QueueService } from './queueService';
import { ZipService } from './zipService';
import { AgentService } from './agentService';
import { SmartMappingService } from './ai/SmartMappingService';
import { FileHandler } from '../utils/fileHandler';
import fs from 'fs';
import path from 'path';

export interface BatchItem {
    name: string;
    urlOrPath: string;
    isLocal: boolean;
}

export class BatchService {
    private batchRepo: BatchRepo;
    private queueService: QueueService;
    private zipService: ZipService;
    private agentService: AgentService;
    private fileHandler: FileHandler;
    private smartMappingService: SmartMappingService;
    
    constructor(workspaceId?: string) {
        this.batchRepo = new BatchRepo(workspaceId);
        this.queueService = new QueueService();
        this.zipService = new ZipService();
        this.agentService = new AgentService(workspaceId);
        this.fileHandler = new FileHandler();
        this.smartMappingService = new SmartMappingService(workspaceId);
    }

    public async createBatchJob(
        userId: string,
        templateId: string,
        templatePath: string,
        items: BatchItem[],
        onProgress?: (job: BatchJob) => void
    ): Promise<string> {
        const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
        const jobId = `Batch_${timestamp}_${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
        
        const job: BatchJob = {
            id: jobId,
            userId,
            templateId,
            status: 'queue',
            progress: 0,
            totalFiles: items.length,
            successCount: 0,
            failedCount: 0,
            startTime: Date.now()
        };

        await this.batchRepo.add(job);

        // Enqueue the job without awaiting so it runs in background
        this.queueService.enqueue(jobId, () => this.processBatch(job, templatePath, items, onProgress)).catch(console.error);

        return jobId;
    }

    private async processBatch(
        job: BatchJob,
        templatePath: string,
        items: BatchItem[],
        onProgress?: (job: BatchJob) => void
    ): Promise<void> {
        await this.batchRepo.update(job.id, { status: 'processing' });
        job.status = 'processing';
        
        const baseDir = path.join(process.cwd(), 'storage', 'temp', `batch_${job.id}`);
        const docxDir = path.join(baseDir, 'DOCX');
        const pdfDir = path.join(baseDir, 'PDF');
        const logDir = path.join(baseDir, 'LOG');

        fs.mkdirSync(docxDir, { recursive: true });
        fs.mkdirSync(pdfDir, { recursive: true });
        fs.mkdirSync(logDir, { recursive: true });

        const errors: string[] = [];
        const results: any[] = [];

        const updateProgress = async () => {
            job.progress = Math.round(((job.successCount + job.failedCount) / job.totalFiles) * 100);
            await this.batchRepo.update(job.id, {
                successCount: job.successCount,
                failedCount: job.failedCount,
                progress: job.progress
            });
            if (onProgress) onProgress(job);
        };

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const startTime = Date.now();
            try {
                let localExcelPath = item.urlOrPath;
                if (!item.isLocal) {
                    localExcelPath = await this.fileHandler.downloadFile(item.urlOrPath, item.name);
                }

                // Parse Excel data
                const excelData = await this.agentService.excelParser.extractText(localExcelPath);
                if (!item.isLocal) {
                    await this.fileHandler.cleanupFile(localExcelPath);
                }

                // ── SMART MAPPING PATH (Features 1-6) ──────────────────────────
                // Try smart mapping first. If template has legacy {{placeholders}},
                // smartResult.usedLegacyMode will be true and we fall back to Gemini.
                let textData: Record<string, any>;
                
                try {
                    await this.smartMappingService.init();
                    const smartResult = await this.smartMappingService.buildFillData(
                        job.templateId,
                        templatePath,
                        localExcelPath,
                    );

                    if (!smartResult.usedLegacyMode && Object.keys(smartResult.data).length > 0) {
                        // ── SMART MODE: use AI mapping result ─────────────────────
                        console.log(`[BatchService] Using Smart Mapping for ${item.name}`);
                        textData = smartResult.data;
                    } else {
                        // ── LEGACY MODE: use Gemini with raw Excel text ─────────────
                        console.log(`[BatchService] Using Legacy Gemini mode for ${item.name}`);
                        const docText = await this.agentService.docxParser.extractText(templatePath);
                        const geminiResult = await this.agentService.geminiService.generateDocumentData(
                            docText,
                            'Buat laporan dari data Excel yang dilampirkan.',
                            undefined,
                            excelData
                        );
                        textData = geminiResult.textData;
                    }
                } catch (smartErr: any) {
                    // If smart mapping fails for any reason, fall back to legacy Gemini
                    console.warn(`[BatchService] Smart mapping failed, falling back to legacy: ${smartErr?.message}`);
                    const docText = await this.agentService.docxParser.extractText(templatePath);
                    const geminiResult = await this.agentService.geminiService.generateDocumentData(
                        docText,
                        'Buat laporan dari data Excel yang dilampirkan.',
                        undefined,
                        excelData
                    );
                    textData = geminiResult.textData;
                }

                const baseName = path.parse(item.name).name;
                const outDocxPath = path.join(docxDir, `${baseName}.docx`);
                const outPdfPath = path.join(pdfDir, `${baseName}.pdf`);

                // Fill Template
                await this.agentService.documentEngine.fillTemplate(
                    templatePath,
                    textData,
                    outDocxPath
                );

                // Convert to PDF
                await this.agentService.documentEngine.convertToPdf(outDocxPath, outPdfPath);

                job.successCount++;
                results.push({
                    file: item.name,
                    status: 'success',
                    processingTime: Date.now() - startTime
                });
            } catch (err: any) {
                console.error(`Batch ${job.id} failed on ${item.name}:`, err);
                job.failedCount++;
                errors.push(`File: ${item.name} | Error: ${err.message}`);
                results.push({
                    file: item.name,
                    status: 'failed',
                    error: err.message,
                    processingTime: Date.now() - startTime
                });
            }

            await updateProgress();
        }

        // Write Logs
        fs.writeFileSync(path.join(logDir, 'result.json'), JSON.stringify(results, null, 2));
        fs.writeFileSync(path.join(logDir, 'errors.txt'), errors.join('\n'));
        const summary = [
            `Total file: ${job.totalFiles}`,
            `Berhasil: ${job.successCount}`,
            `Gagal: ${job.failedCount}`,
            `Lama proses: ${((Date.now() - job.startTime) / 1000).toFixed(2)} detik`,
            `Template: ${job.templateId}`
        ].join('\n');
        fs.writeFileSync(path.join(logDir, 'summary.txt'), summary);

        // Zip it up
        const zipFilename = `${job.id}.zip`;
        const zipPath = path.join(process.cwd(), 'storage', 'downloads', zipFilename);
        fs.mkdirSync(path.dirname(zipPath), { recursive: true });

        await this.zipService.compressFolder(baseDir, zipPath);
        const zipSize = this.zipService.getZipSize(zipPath);

        job.status = 'completed';
        job.finishTime = Date.now();
        job.zipSize = zipSize;
        job.expireAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days default
        job.downloadUrl = `/download/${zipFilename}`;

        await this.batchRepo.update(job.id, {
            status: job.status,
            finishTime: job.finishTime,
            zipSize: job.zipSize,
            expireAt: job.expireAt,
            downloadUrl: job.downloadUrl
        });

        if (onProgress) onProgress(job);

        // Clean up baseDir
        fs.rmSync(baseDir, { recursive: true, force: true });
    }

    public getRepo(): BatchRepo {
        return this.batchRepo;
    }
}
