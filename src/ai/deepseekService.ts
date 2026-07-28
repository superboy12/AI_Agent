import OpenAI from 'openai';
import { config } from '../config/env';
import { ImageData, GeminiDocumentResult } from './geminiService'; // Reusing interfaces

export class DeepseekService {
    private ai: OpenAI;
    private chatHistory: Map<string, any[]> = new Map();
    private static instance: DeepseekService;

    private constructor() {
        this.ai = new OpenAI({
            baseURL: 'https://api.deepseek.com',
            apiKey: config.deepseekApiKey
        });
    }

    public static getInstance(): DeepseekService {
        if (!DeepseekService.instance) {
            DeepseekService.instance = new DeepseekService();
        }
        return DeepseekService.instance;
    }

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
            ? `\n(Catatan: User melampirkan ${imagesData!.length} gambar. Sayangnya, saya belum mendukung analisis gambar secara langsung, gunakan informasi lain sebaik mungkin.)`
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
1. Pahami instruksi user${excelData ? ' beserta data Excel' : ''}, perbaiki tata bahasa menjadi formal dan profesional.
2. Jangan mengarang informasi. Jika informasi untuk sebuah field tidak tersedia, gunakan "-" atau string kosong sesuai konteks.
3. Anda HANYA boleh mengembalikan data dalam format JSON yang valid. Hanya untuk placeholder TEKS, bukan placeholder gambar ({%...}).
4. Key pada JSON harus sesuai dengan nama placeholder teks yang Anda temukan (tanpa kurung kurawal).
5. Jangan mengembalikan markdown, kode blocks, atau teks penjelasan. Hanya JSON murni.

Contoh output:
{"Tanggal": "20 Juli 2026", "Deskripsi": "Melakukan maintenance server.", "Kendala": "-"}`;

        try {
            console.log('[Deepseek] Sending request...');
            const response = await this.ai.chat.completions.create({
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: textPrompt }],
                response_format: { type: 'json_object' }
            });

            const responseText = response.choices[0]?.message?.content || '{}';
            console.log('[Deepseek] Raw response:', responseText);

            const cleaned = responseText
                .replace(/^```json\s*/i, '')
                .replace(/^```\s*/i, '')
                .replace(/```\s*$/i, '')
                .trim();

            const textData = JSON.parse(cleaned);
            return { textData, imagePlaceholderNames };
        } catch (error: any) {
            console.error('[Deepseek] Error:', error?.message || error);
            throw new Error(`Gagal memproses instruksi dengan AI Deepseek: ${error?.message || 'Unknown error'}`);
        }
    }

    public async generateDocumentStructure(
        userInstruction: string,
        imagesData?: ImageData[]
    ): Promise<any> {
        const hasImages = imagesData && imagesData.length > 0;
        const imageCountNote = hasImages
            ? `\n(Catatan: User melampirkan gambar, tetapi fitur ini terbatas pada teks saat ini.)`
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

        try {
            console.log('[Deepseek] Sending document structure request...');
            const response = await this.ai.chat.completions.create({
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: prompt }],
                response_format: { type: 'json_object' }
            });

            const responseText = response.choices[0]?.message?.content || '{}';
            console.log('[Deepseek] Raw structure response:', responseText);

            const cleaned = responseText
                .replace(/^```json\s*/i, '')
                .replace(/^```\s*/i, '')
                .replace(/```\s*$/i, '')
                .trim();

            return JSON.parse(cleaned);
        } catch (error: any) {
            console.error('[Deepseek] Error:', error?.message || error);
            throw new Error(`Gagal membuat struktur dokumen dengan AI Deepseek: ${error?.message || 'Unknown error'}`);
        }
    }

    public async chat(userId: string, message: string): Promise<string> {
        if (!this.chatHistory.has(userId)) {
            this.chatHistory.set(userId, [
                {
                    role: 'system',
                    content: 'Anda adalah AI Asisten profesional untuk pembuatan dokumen. Berikan jawaban yang singkat, padat, dan ramah. Gunakan bahasa Indonesia.'
                }
            ]);
        }
        
        const history = this.chatHistory.get(userId)!;
        history.push({ role: 'user', content: message });

        try {
            const response = await this.ai.chat.completions.create({
                model: 'deepseek-chat',
                messages: history,
            });

            const reply = response.choices[0]?.message?.content || '';
            history.push({ role: 'assistant', content: reply });

            return reply;
        } catch (error: any) {
            console.error('[Deepseek Chat] Error:', error);
            history.pop();
            throw new Error(`Gagal menghubungi AI Deepseek: ${error?.message || 'Unknown error'}`);
        }
    }

    public clearChat(userId: string): void {
        this.chatHistory.delete(userId);
    }
}
