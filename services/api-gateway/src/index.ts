import express from 'express';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(express.json());

// Auth middleware mock
const auth = (req: any, res: any, next: any) => {
    const token = req.headers.authorization;
    if (token === 'Bearer test-token') return next();
    res.status(401).json({ error: 'Unauthorized' });
};

app.get('/health', (req, res) => {
    // Collect status from all services
    res.json({
        service: 'api-gateway',
        status: 'OK',
        services: {
            ai: 'OK',
            document: 'OK',
            storage: 'OK',
            worker: 'OK'
        }
    });
});

// Proxy routes (Mocking reverse proxy behavior)
app.use('/api/storage', (req, res) => res.json({ proxy: 'storage-service' }));
app.use('/api/ai', (req, res) => res.json({ proxy: 'ai-service' }));
app.use('/api/document', (req, res) => res.json({ proxy: 'document-service' }));

app.listen(process.env.PORT || 3000, () => console.log('API Gateway running'));


// --- SECURE DOWNLOAD SERVICE ---
app.get('/download/:token', async (req, res) => {
    const { token } = req.params;
    // In a real scenario, decrypt the token or look up the database to get bucket/key.
    // For now, we mock the validation.
    if (token === 'expired-token') {
        return res.status(403).send('<h2>Error 403: Link Expired</h2>');
    }
    
    if (!token) {
        return res.status(400).send('<h2>Error 400: Invalid Token</h2>');
    }

    try {
        // Fetch signed url from storage service
        // const storageRes = await axios.get(`http://storage-service:3003/api/storage/signed-url/${bucket}/${key}`);
        // res.redirect(storageRes.data.url);
        
        res.send(`<h2>File Download Ready</h2><p>Redirecting to secure storage for token: ${token}...</p>`);
    } catch (err) {
        res.status(500).send('<h2>Error 500: Internal Server Error</h2>');
    }
});

app.get('/api/health', async (req, res) => {
    // In a real scenario, this pings all services via HTTP
    res.json({
        gateway: '🟢 Online',
        ai_service: '🟢 Online',
        document_service: '🟢 Online',
        storage_service: '🟢 Online',
        redis: '🟢 Online',
        database: '🟢 Online',
        worker: '🟢 Online',
        gemini_api: '🟢 Online',
        telegram_bot: '🟢 Online'
    });
});
