import express from 'express';
import dotenv from 'dotenv';
import { WorkerManager } from './queue/WorkerManager';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3004;
const workerManager = new WorkerManager();

app.get('/health', (req, res) => res.json({ service: 'worker-service', status: 'OK' }));

app.listen(PORT, async () => {
    console.log(`Worker Service running on port ${PORT}`);
    await workerManager.start();
});
