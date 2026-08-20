import { HistoryRepo } from '../../repositories/historyRepo';
import { JobManager } from '../../managers/jobManager';
import os from 'os';
import path from 'path';
import fs from 'fs';

export class AnalyticsService {
    private historyRepo = new HistoryRepo();

    public async getDashboardStats() {
        const history = await this.historyRepo.getAll();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        let todayCount = 0;
        let monthCount = 0;
        let docxCount = 0;
        let pdfCount = 0;
        let errors = 0;
        const users = new Set<string>();

        history.forEach(item => {
            const itemDate = new Date(item.generateDate);
            if (itemDate >= today) todayCount++;
            if (itemDate >= startOfMonth) monthCount++;
            
            if (item.filePath.endsWith('.docx')) docxCount++;
            if (item.filePath.endsWith('.pdf')) pdfCount++;
            if (item.status === 'failed') errors++;
            users.add(item.userId);
        });

        // Uptime logic
        const uptimeSeconds = os.uptime();
        const uptime = `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m`;

        return {
            today: todayCount,
            month: monthCount,
            docx: docxCount,
            pdf: pdfCount,
            templates: 0, // Would query TemplateRepo if imported
            users: users.size,
            errors,
            storage: '0 MB', // Will be calculated in storage stats
            cpu: `${(os.loadavg()[0] * 100 / os.cpus().length).toFixed(1)}%`,
            ram: `${(100 - (os.freemem() / os.totalmem() * 100)).toFixed(1)}%`,
            uptime
        };
    }

    public async getActiveJobs() {
        // Gets batch jobs from JobManager
        const batchService = JobManager.getInstance().getBatchService();
        const allJobs = await batchService.getRepo().getAll();
        
        return allJobs.map(j => ({
            id: j.id,
            template: j.templateId,
            user: j.userId,
            status: j.status,
            progress: j.progress,
            startedAt: j.startTime
        }));
    }

    public async getStorageStats() {
        const history = await this.historyRepo.getAll();
        
        let pdfs = 0;
        let docxs = 0;
        let zips = 0;
        let totalSize = 0;
        let largestFile = { name: '-', size: 0 };

        history.forEach(item => {
            if (item.filePath.endsWith('.pdf')) pdfs++;
            if (item.filePath.endsWith('.docx')) docxs++;
            if (item.filePath.endsWith('.zip')) zips++;
            totalSize += item.sizeBytes || 0;

            if ((item.sizeBytes || 0) > largestFile.size) {
                largestFile = { name: path.basename(item.filePath), size: item.sizeBytes || 0 };
            }
        });

        const free = os.freemem();

        return {
            templates: 0,
            pdfs,
            docxs,
            zips,
            used: `${(totalSize / 1024 / 1024).toFixed(2)} MB`,
            free: `${(free / 1024 / 1024 / 1024).toFixed(2)} GB`,
            largestFile: largestFile.name,
            largestTemplate: '-'
        };
    }

    public async getRecentActivities() {
        const history = await this.historyRepo.getAll();
        
        // Convert history to activities
        const activities = history.sort((a, b) => b.generateDate - a.generateDate).slice(0, 100).map(h => ({
            time: h.generateDate,
            user: h.userId,
            action: h.templateName === 'N/A (Dari Nol)' ? 'Generate from scratch' : 'Generate DOCX',
            status: h.status === 'success' ? 'Success' : 'Failed',
            details: h.filename
        }));

        return activities;
    }

    public async getAnalyticsData() {
        const history = await this.historyRepo.getAll();
        
        // Group by day for the last 7 days
        const dailyMap = new Map<string, number>();
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = `${d.getDate()}/${d.getMonth()+1}`;
            dailyMap.set(dateStr, 0);
        }

        const templateMap = new Map<string, number>();

        history.forEach(item => {
            const d = new Date(item.generateDate);
            const dateStr = `${d.getDate()}/${d.getMonth()+1}`;
            if (dailyMap.has(dateStr)) {
                dailyMap.set(dateStr, dailyMap.get(dateStr)! + 1);
            }

            if (item.templateName) {
                templateMap.set(item.templateName, (templateMap.get(item.templateName) || 0) + 1);
            }
        });

        const daily = Array.from(dailyMap.entries()).map(([date, count]) => ({ date, count }));
        
        const templates = Array.from(templateMap.entries())
            .map(([name, usage]) => ({ name, usage }))
            .sort((a, b) => b.usage - a.usage)
            .slice(0, 5);

        return { daily, templates };
    }
}
