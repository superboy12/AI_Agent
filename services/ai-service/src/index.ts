import express from 'express';
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
