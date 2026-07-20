import { GoogleGenAI, Part } from '@google/genai';
import fs from 'fs';
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

    constructor() {
        this.ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
    }

    /**
     * Extracts image placeholder names ({%name}) from the raw document text.
     * Returns them in the order they appear in the document.
     */
    public extractImagePlaceholders(documentText: string): string[] {
        const regex = /\{%(\w+)\}/g;
        const found: string[] = [];
        let match;
        while ((match = regex.exec(documentText)) !== null) {
            if (!found.includes(match[1])) found.push(match[1]);
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
        imagesData?: ImageData[]
    ): Promise<GeminiDocumentResult> {
        const imagePlaceholderNames = this.extractImagePlaceholders(documentText);
        const hasImages = imagesData && imagesData.length > 0;

        const imagePlaceholderNote = imagePlaceholderNames.length > 0
            ? `\nCatatan: Template ini memiliki placeholder gambar: ${imagePlaceholderNames.map(n => `{%${n}}`).join(', ')}. JANGAN sertakan placeholder gambar tersebut di dalam JSON output — placeholder gambar diproses secara terpisah.`
            : '';

        const imageCountNote = hasImages
            ? `\nUser melampirkan ${imagesData!.length} gambar. Baca dan ekstrak informasi TEKS yang relevan dari gambar-gambar tersebut untuk melengkapi data dokumen.`
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
${imageCountNote}${imagePlaceholderNote}

Aturan:
1. Pahami instruksi user${hasImages ? ' dan baca informasi dari gambar yang dilampirkan' : ''}, perbaiki tata bahasa menjadi formal dan profesional.
2. Jangan mengarang informasi. Jika informasi untuk sebuah field tidak tersedia, gunakan "-" atau string kosong sesuai konteks.
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
                    const imageBuffer = fs.readFileSync(imgData.path);
                    const base64Image = imageBuffer.toString('base64');
                    parts.push({
                        inlineData: {
                            mimeType: imgData.mimeType,
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
  "title": "Judul Dokumen (digunakan untuk nama file jika ada)",
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
  ]
}

Aturan tambahan:
1. Pahami instruksi user dengan baik. Buat dokumen dengan bahasa formal dan profesional (bahasa Indonesia, kecuali diminta lain).
2. Jika tipe elemen tidak sesuai, gunakan salah satu dari: "heading", "paragraph", "list", atau "table".
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
                    const imageBuffer = fs.readFileSync(imgData.path);
                    const base64Image = imageBuffer.toString('base64');
                    parts.push({
                        inlineData: {
                            mimeType: imgData.mimeType,
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
}
