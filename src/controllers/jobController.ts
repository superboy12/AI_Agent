import { Request, Response } from 'express';
import { JobManager } from '../managers/jobManager';
import fs from 'fs';
import path from 'path';

export class JobController {
    public async getAllJobs(req: Request, res: Response): Promise<void> {
        try {
            const repo = JobManager.getInstance().getBatchService().getRepo();
            const jobs = await repo.getAll();
            res.json(jobs);
        } catch (error) {
            console.error('Error fetching jobs:', error);
            res.status(500).json({ error: 'Failed to fetch jobs' });
        }
    }

    public async getJob(req: Request, res: Response): Promise<void> {
        try {
            const id = req.params.id as string;
            const repo = JobManager.getInstance().getBatchService().getRepo();
            const job = await repo.getById(id);
            if (!job) {
                res.status(404).json({ error: 'Job not found' });
                return;
            }
            res.json(job);
        } catch (error) {
            console.error('Error fetching job:', error);
            res.status(500).json({ error: 'Failed to fetch job' });
        }
    }

    public async deleteJob(req: Request, res: Response): Promise<void> {
        try {
            const id = req.params.id as string;
            const repo = JobManager.getInstance().getBatchService().getRepo();
            const job = await repo.getById(id);
            if (!job) {
                res.status(404).json({ error: 'Job not found' });
                return;
            }
            
            // Delete ZIP if exists
            const zipPath = path.join(process.cwd(), 'storage', 'downloads', `${job.id}.zip`);
            if (fs.existsSync(zipPath)) {
                fs.unlinkSync(zipPath);
            }

            await repo.delete(job.id);
            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting job:', error);
            res.status(500).json({ error: 'Failed to delete job' });
        }
    }

    public async viewDownloadPage(req: Request, res: Response): Promise<void> {
        try {
            const fileId = req.params.fileId as string;
            if (!fileId.endsWith('.zip')) {
                res.status(400).send('Invalid file ID');
                return;
            }

            const repo = JobManager.getInstance().getBatchService().getRepo();
            const jobId = fileId.replace('.zip', '');
            const job = await repo.getById(jobId);

            if (!job) {
                res.status(404).send('<h2>Error 404: File Not Found</h2><p>Pastikan link yang Anda masukkan benar.</p>');
                return;
            }

            if (job.expireAt && Date.now() > job.expireAt) {
                res.status(403).send('<h2>Error 403: Link Expired</h2><p>Link download ini sudah kedaluwarsa.</p>');
                return;
            }

            const zipPath = path.join(process.cwd(), 'storage', 'downloads', fileId);
            if (!fs.existsSync(zipPath)) {
                res.status(404).send('<h2>Error 404: File Not Found on Disk</h2>');
                return;
            }

            const html = `
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AiAgent - Download File</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            height: 100vh;
            margin: 0;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .container {
            background-color: white;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
            text-align: center;
            max-width: 400px;
            width: 90%;
        }
        .icon {
            font-size: 60px;
            margin-bottom: 20px;
            color: #4CAF50;
        }
        h1 {
            color: #333;
            font-size: 24px;
            margin-bottom: 10px;
        }
        p {
            color: #666;
            margin-bottom: 30px;
            line-height: 1.5;
        }
        .btn {
            background-color: #4CAF50;
            color: white;
            padding: 12px 30px;
            border: none;
            border-radius: 25px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            transition: background-color 0.3s, transform 0.2s;
            box-shadow: 0 4px 6px rgba(76, 175, 80, 0.3);
        }
        .btn:hover {
            background-color: #45a049;
            transform: translateY(-2px);
        }
        .btn:active {
            transform: translateY(0);
        }
        .file-info {
            margin-top: 20px;
            font-size: 12px;
            color: #999;
            background: #f9f9f9;
            padding: 10px;
            border-radius: 6px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">📦</div>
        <h1>File Anda Sudah Siap!</h1>
        <p>Batch Job <strong>${job.id}</strong> telah berhasil diproses. Dokumen Anda telah di-zip dan siap diunduh.</p>
        <a href="/api/download/raw/${fileId}" class="btn">Unduh Sekarang</a>
        <div class="file-info">
            Ukuran: ${((job.zipSize || 0) / 1024).toFixed(2)} KB<br>
            Berlaku hingga: ${new Date(job.expireAt || Date.now()).toLocaleString('id-ID')}
        </div>
    </div>
</body>
</html>`;
            res.send(html);
        } catch (error) {
            console.error('Error serving download page:', error);
            res.status(500).send('Failed to serve download page');
        }
    }

    public async downloadZipRaw(req: Request, res: Response): Promise<void> {
        try {
            const fileId = req.params.fileId as string;
            if (!fileId.endsWith('.zip')) {
                res.status(400).send('Invalid file ID');
                return;
            }

            const repo = JobManager.getInstance().getBatchService().getRepo();
            const jobId = fileId.replace('.zip', '');
            const job = await repo.getById(jobId);

            if (!job || (job.expireAt && Date.now() > job.expireAt)) {
                res.status(404).send('File not found or expired');
                return;
            }

            const zipPath = path.join(process.cwd(), 'storage', 'downloads', fileId);
            if (!fs.existsSync(zipPath)) {
                res.status(404).send('File not found');
                return;
            }

            res.download(zipPath);
        } catch (error) {
            console.error('Error downloading file:', error);
            res.status(500).send('Failed to download file');
        }
    }
}
