import mammoth from 'mammoth';

export class DocxParser {
    /**
     * Extracts raw text from a DOCX file.
     * @param filepath Absolute path to the DOCX file
     * @returns The extracted raw text
     */
    public async extractText(filepath: string): Promise<string> {
        try {
            const result = await mammoth.extractRawText({ path: filepath });
            return result.value;
        } catch (error) {
            console.error('Error extracting text with mammoth:', error);
            throw new Error('Gagal membaca isi file DOCX. Pastikan file tidak rusak.');
        }
    }
}
