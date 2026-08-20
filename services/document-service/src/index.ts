import express from 'express';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ service: 'document-service', status: 'OK' }));

app.post('/api/document/fill', (req, res) => {
    const { templatePath, data, outputName } = req.body;
    // Generate DOCX...
    res.json({ documentPath: `/virtual/${outputName}` });
});

app.post('/api/document/convert-pdf', (req, res) => {
    const { docxPath, outputPdfName } = req.body;
    // Convert to PDF...
    res.json({ pdfPath: `/virtual/${outputPdfName}` });
});

app.listen(process.env.PORT || 3002, () => console.log('Document Service running'));
