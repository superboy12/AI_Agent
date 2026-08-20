const fs = require('fs');
const path = require('path');

// --- AI SERVICE ---
const aiDir = 'd:/AiAgent/services/ai-service/src';
if (!fs.existsSync(aiDir)) fs.mkdirSync(aiDir, { recursive: true });
fs.writeFileSync(path.join(aiDir, 'index.ts'), `import express from 'express';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ service: 'ai-service', status: 'OK' }));

app.post('/api/ai/generate-data', (req, res) => {
    const { documentText, instruction, imagesData, parsedExcelData } = req.body;
    // Call Gemini API...
    res.json({ textData: { "ContohField": "Data dari Gemini" }, imagePlaceholderNames: [] });
});

app.post('/api/ai/analyze-template', (req, res) => {
    const { templatePath } = req.body;
    // Semantic analysis...
    res.json({ fields: [] });
});

app.listen(process.env.PORT || 3001, () => console.log('AI Service running'));
`);

// --- DOCUMENT SERVICE ---
const docDir = 'd:/AiAgent/services/document-service/src';
if (!fs.existsSync(docDir)) fs.mkdirSync(docDir, { recursive: true });
fs.writeFileSync(path.join(docDir, 'index.ts'), `import express from 'express';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ service: 'document-service', status: 'OK' }));

app.post('/api/document/fill', (req, res) => {
    const { templatePath, data, outputName } = req.body;
    // Generate DOCX...
    res.json({ documentPath: \`/virtual/\${outputName}\` });
});

app.post('/api/document/convert-pdf', (req, res) => {
    const { docxPath, outputPdfName } = req.body;
    // Convert to PDF...
    res.json({ pdfPath: \`/virtual/\${outputPdfName}\` });
});

app.listen(process.env.PORT || 3002, () => console.log('Document Service running'));
`);

// --- API GATEWAY ---
const gwDir = 'd:/AiAgent/services/api-gateway/src';
if (!fs.existsSync(gwDir)) fs.mkdirSync(gwDir, { recursive: true });
fs.writeFileSync(path.join(gwDir, 'index.ts'), `import express from 'express';
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
`);

console.log('Phase 4 Services Generated.');
