import { GoogleGenAI, Part } from '@google/genai';
import fs from 'fs';
import sharp from 'sharp';
import { config } from '../config/env';

export interface ImageData {
    path: string;
    mimeType: string;
}

export interface GeminiDocumentResult {
    textData: Record<string, any>;
    imagePlaceholderNames: string[];
}

export class GeminiService {
    private ai: GoogleGenAI;
    private static instance: GeminiService;

    private constructor() {
        this.ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
    }

    public static getInstance(): GeminiService {
        if (!GeminiService.instance) {
            GeminiService.instance = new GeminiService();
        }
        return GeminiService.instance;
    }

    /**
     * Extracts image placeholder names ({%name}) from the raw document text.
     * Returns them in the order they appear in the document.
     */
    public extractImagePlaceholders(documentText: string): string[] {
        const regex = /\{%?\{?(\w+)\}?\}/g;
        const found: string[] = [];
        let match;
        while ((match = regex.exec(documentText)) !== null) {
            const name = match[1];
            if (match[0].startsWith('{%') || /gambar|foto|image|img|pic/i.test(name)) {
                if (!found.includes(name)) found.push(name);
            }
        }
        return found;
    }

    /**
     * Maps user instruction (and optional images) to structured JSON using Gemini.
     * Supports multiple images for Vision mode.
     *
     * @param documentText The extracted text from the DOCX template
     * @param userInstruction The instruction provided by the user
     * @param imagesData Optional array of image data for multimodal processing
     * @returns GeminiDocumentResult containing text data and image placeholder names
     */
    public async generateDocumentData(
        documentText: string,
        userInstruction: string,
        imagesData?: ImageData[],
        excelData?: string
    ): Promise<GeminiDocumentResult> {
        const imagePlaceholderNames = this.extractImagePlaceholders(documentText);
        const hasImages = imagesData && imagesData.length > 0;

        const imagePlaceholderNote = imagePlaceholderNames.length > 0
            ? `\nCatatan: Template ini memiliki placeholder gambar: ${imagePlaceholderNames.map(n => `{%${n}}`).join(', ')}. JANGAN sertakan placeholder gambar tersebut di dalam JSON output — placeholder gambar diproses secara terpisah.`
            : '';

        const imageCountNote = hasImages
            ? `\nUser melampirkan ${imagesData!.length} gambar. Baca dan ekstrak informasi TEKS yang relevan dari gambar-gambar tersebut untuk melengkapi data dokumen.`
            : '';

        const excelNote = excelData
            ? `\n\nData Excel:\n"""\n${excelData}\n"""\n\nCatatan Khusus Excel: User melampirkan file Excel. Tugas Anda adalah membaca, menganalisis struktur tabel, dan membuat kesimpulan atau laporan naratif dalam bahasa Indonesia yang formal. Jangan sekadar menyalin tabel. Rangkum isinya, kenali kolom seperti tanggal, lokasi, kegiatan, hasil, dan kendala secara cerdas, lalu gunakan narasi tersebut untuk mengisi placeholder DOCX yang sesuai.`
            : '';

        const textPrompt = `Anda adalah AI Document Assistant profesional.
Tugas Anda adalah memetakan instruksi user ke dalam placeholder TEKS yang ada di dalam template dokumen.
User menggunakan placeholder teks berformat {NamaPlaceholder} di dalam dokumennya.

Berikut adalah teks kasar dari template dokumen tersebut:
"""
${documentText}
"""

Instruksi User:
"""
${userInstruction}
"""
${imageCountNote}${imagePlaceholderNote}${excelNote}

Aturan:
1. Pahami instruksi user${hasImages ? ' dan gambar' : ''}${excelData ? ' beserta data Excel' : ''}, perbaiki tata bahasa menjadi formal dan profesional.
2. Jangan mengarang informasi. Jika informasi untuk sebuah field tidak tersedia, gunakan "-" atau string kosong sesuai konteks. KHUSUS untuk field yang mengandung kata kunci (ttd, signature, wfo, WFO, tk, TK), JANGAN gunakan "-" atau kosong, melainkan kembalikan nama placeholdernya lengkap dengan kurung kurawal (contoh: "{ttd_pengirim}", "{wfo_status}").
3. Anda HANYA boleh mengembalikan data dalam format JSON yang valid. Hanya untuk placeholder TEKS, bukan placeholder gambar ({%...}).
4. Key pada JSON harus sesuai dengan nama placeholder teks yang Anda temukan (tanpa kurung kurawal).
5. Jangan mengembalikan markdown, kode blocks, atau teks penjelasan. Hanya JSON murni.

Contoh output:
{"Tanggal": "20 Juli 2026", "Deskripsi": "Melakukan maintenance server.", "Kendala": "-"}`;

        // Build multimodal parts — text first, then all images
        const parts: Part[] = [{ text: textPrompt }];

        if (hasImages) {
            for (let i = 0; i < imagesData!.length; i++) {
                const imgData = imagesData![i];
                try {
                    let imageBuffer = fs.readFileSync(imgData.path);
                    
                    // Resize large images for AI payload to prevent "Request entity too large" (HTTP 413).
                    // This downscaling is ONLY for the AI's OCR and context extraction,
                    // it does NOT overwrite the original image file used in the document.
                    imageBuffer = await sharp(imageBuffer)
                        .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
                        .jpeg({ quality: 80 })
                        .toBuffer();

                    const base64Image = imageBuffer.toString('base64');
                    parts.push({
                        inlineData: {
                            mimeType: 'image/jpeg', // We forced jpeg above
                            data: base64Image,
                        }
                    });
                    console.log(`[Gemini] Image ${i + 1}/${imagesData!.length} attached (${imgData.mimeType})`);
                } catch (err) {
                    console.error(`[Gemini] Failed to read image ${i + 1}, skipping:`, err);
                }
            }
        }

        try {
            console.log('[Gemini] Sending request to Gemini API...');

            const response = await this.ai.models.generateContent({
                model: 'gemini-flash-latest',
                contents: [{ role: 'user', parts }],
            });

            const responseText = response.text || '{}';
            console.log('[Gemini] Raw response:', responseText);

            const cleaned = responseText
                .replace(/^```json\s*/i, '')
                .replace(/^```\s*/i, '')
                .replace(/```\s*$/i, '')
                .trim();

            const textData = JSON.parse(cleaned);
            return { textData, imagePlaceholderNames };
        } catch (error: any) {
            console.error('[Gemini] Full error:', error?.message || error);
            if (error?.status) console.error('[Gemini] HTTP Status:', error.status);
            if (error?.errorDetails) console.error('[Gemini] Error Details:', JSON.stringify(error.errorDetails));
            throw new Error(`Gagal memproses instruksi dengan AI Gemini: ${error?.message || 'Unknown error'}`);
        }
    }

    /**
     * Maps user instruction (and optional images) to structured JSON representing a document from scratch.
     *
     * @param userInstruction The instruction provided by the user
     * @param imagesData Optional array of image data for multimodal processing
     * @returns Structured JSON representing the document content
     */
    public async generateDocumentStructure(
        userInstruction: string,
        imagesData?: ImageData[]
    ): Promise<any> {
        const hasImages = imagesData && imagesData.length > 0;
        const imageCountNote = hasImages
            ? `\nUser melampirkan ${imagesData!.length} gambar. Gunakan informasi atau deskripsi dari gambar tersebut bila relevan dengan dokumen.`
            : '';

        const prompt = `Anda adalah AI Document Generator profesional.
Tugas Anda adalah membuat dokumen baru dari nol berdasarkan instruksi user.
Anda HARUS merespons HANYA dengan format JSON yang merepresentasikan struktur dokumen tersebut.
Jangan mengembalikan markdown, kode blocks, atau teks penjelasan. Hanya JSON murni.

Struktur JSON yang diharapkan:
{
  "format": "docx", // atau "xlsx" sesuai permintaan user
  "title": "Judul Dokumen (digunakan untuk nama file jika ada)",
  
  // JIKA format = "docx", sertakan 'content'
  "content": [
    {
      "type": "heading",
      "level": 1, // 1 sampai 6
      "text": "Teks Heading"
    },
    {
      "type": "paragraph",
      "text": "Isi paragraf di sini."
    },
    {
      "type": "list",
      "items": ["Item pertama", "Item kedua"]
    },
    {
      "type": "table",
      "headers": ["Kolom 1", "Kolom 2"],
      "rows": [
        ["Baris 1 Kolom 1", "Baris 1 Kolom 2"]
      ]
    }
  ],

  // JIKA format = "xlsx", sertakan 'sheets'
  "sheets": [
    {
      "name": "Sheet1",
      "rows": [
        ["Header 1", "Header 2", "Header 3"], // baris pertama otomatis ditebalkan
        ["Data 1", "Data 2", "Data 3"]
      ]
    }
  ]
}

Aturan tambahan:
1. Pahami instruksi user dengan baik. Jika user meminta Excel, spreadsheet, atau .xlsx, set "format": "xlsx". Jika meminta dokumen, surat, laporan, .docx, set "format": "docx".
2. Untuk "docx", gunakan property "content". Untuk "xlsx", gunakan property "sheets".
3. PASTIKAN JSON valid dan tidak ada karakter markdown (seperti \`\`\`json).

Instruksi User:
"""
${userInstruction}
"""
${imageCountNote}`;

        const parts: Part[] = [{ text: prompt }];

        if (hasImages) {
            for (let i = 0; i < imagesData!.length; i++) {
                const imgData = imagesData![i];
                try {
                    let imageBuffer = fs.readFileSync(imgData.path);
                    
                    // Resize for AI payload to prevent 413 Payload Too Large
                    imageBuffer = await sharp(imageBuffer)
                        .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
                        .jpeg({ quality: 80 })
                        .toBuffer();

                    const base64Image = imageBuffer.toString('base64');
                    parts.push({
                        inlineData: {
                            mimeType: 'image/jpeg',
                            data: base64Image,
                        }
                    });
                } catch (err) {
                    console.error(`[Gemini] Failed to read image ${i + 1} for document generation, skipping:`, err);
                }
            }
        }

        try {
            console.log('[Gemini] Sending document structure request to Gemini API...');
            const response = await this.ai.models.generateContent({
                model: 'gemini-flash-latest',
                contents: [{ role: 'user', parts }],
            });

            const responseText = response.text || '{}';
            console.log('[Gemini] Raw structure response:', responseText);

            const cleaned = responseText
                .replace(/^```json\s*/i, '')
                .replace(/^```\s*/i, '')
                .replace(/```\s*$/i, '')
                .trim();

            return JSON.parse(cleaned);
        } catch (error: any) {
            console.error('[Gemini] Full error:', error?.message || error);
            throw new Error(`Gagal membuat struktur dokumen dengan AI Gemini: ${error?.message || 'Unknown error'}`);
        }
    }

    /**
     * Interactive chat with memory.
     */
    private chatHistory: Map<string, any[]> = new Map();

    public async chat(userId: string, message: string): Promise<string> {
        if (!this.chatHistory.has(userId)) {
            // Initialize with system prompt
            this.chatHistory.set(userId, [
                {
                    role: 'user',
                    parts: [{ text: 'Anda adalah AI Asisten profesional untuk pembuatan dokumen. Berikan jawaban yang singkat, padat, dan ramah. Gunakan bahasa Indonesia.' }]
                },
                {
                    role: 'model',
                    parts: [{ text: 'Baik, saya mengerti. Saya siap membantu Anda.' }]
                }
            ]);
        }
        
        const history = this.chatHistory.get(userId)!;
        history.push({ role: 'user', parts: [{ text: message }] });

        try {
            const response = await this.ai.models.generateContent({
                model: 'gemini-flash-latest',
                contents: history,
            });

            const reply = response.text || '';
            history.push({ role: 'model', parts: [{ text: reply }] });

            return reply;
        } catch (error: any) {
            console.error('[Gemini Chat] Error:', error);
            history.pop(); // Revert user message on error
            throw new Error(`Gagal menghubungi AI: ${error?.message || 'Unknown error'}`);
        }
    }

    public clearChat(userId: string): void {
        this.chatHistory.delete(userId);
    }

    /**
     * One-shot generation — no chat history, no side effects.
     * Used by ImageEngine's auto_ai mode resolver.
     */
    public async generateSimple(prompt: string): Promise<string> {
        const response = await this.ai.models.generateContent({
            model:    'gemini-flash-latest',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });
        return response.text ?? '';
    }
}
