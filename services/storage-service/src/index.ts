import express from 'express';
import dotenv from 'dotenv';
import multer from 'multer';
import { StorageController } from './controllers/StorageController';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3003;
const upload = multer({ dest: 'temp/' });
const storageController = new StorageController();

// Routes
app.get('/health', (req, res) => res.json({ service: 'storage-service', status: 'OK' }));
app.post('/api/storage/upload', upload.single('file'), storageController.uploadFile.bind(storageController));
app.get('/api/storage/download/:bucket/:key(*)', storageController.downloadFile.bind(storageController));
app.delete('/api/storage/:bucket/:key(*)', storageController.deleteFile.bind(storageController));
app.get('/api/storage/signed-url/:bucket/:key(*)', storageController.getSignedUrl.bind(storageController));

app.listen(PORT, () => {
    console.log(`Storage Service running on port ${PORT}`);
});
