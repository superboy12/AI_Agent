import fs from 'fs';
import path from 'path';
import libre from 'libreoffice-convert';
import { promisify } from 'util';
import { config } from '../../config/env';

const libreConvert = promisify(libre.convert);

export class ExportEngine {
    
    /**
     * Converts a DOCX file to PDF using LibreOffice.
     */
    public async convertToPdf(docxPath: string, outputFilename: string): Promise<string> {
        try {
            const fileBuf = fs.readFileSync(docxPath);
            const pdfBuf = await libreConvert(fileBuf, '.pdf', undefined);

            const outputPath = path.isAbsolute(outputFilename) ? outputFilename : path.join(config.tempDir, outputFilename);
            fs.writeFileSync(outputPath, pdfBuf);

            return outputPath;
        } catch (error) {
            console.error('[ExportEngine] Error converting to PDF:', error);
            throw new Error('Gagal mengkonversi dokumen ke PDF. Pastikan LibreOffice terinstal.');
        }
    }

    /**
     * Converts a PDF file to DOCX using LibreOffice.
     */
    public async convertToDocx(pdfPath: string, outputFilename: string): Promise<string> {
        try {
            const libreConvertWithOptions = require('util').promisify(require('libreoffice-convert').convertWithOptions);
            const fileBuf = fs.readFileSync(pdfPath);
            const options = {
                fileName: 'source.pdf',
                sofficeAdditionalArgs: ['--infilter=writer_pdf_import']
            };
            const docxBuf = await libreConvertWithOptions(fileBuf, '.docx', undefined, options);

            const outputPath = path.join(config.tempDir, outputFilename);
            fs.writeFileSync(outputPath, docxBuf);

            return outputPath;
        } catch (error) {
            console.error('[ExportEngine] Error converting to DOCX:', error);
            throw new Error('Gagal mengkonversi dokumen ke DOCX. Pastikan LibreOffice terinstal.');
        }
    }
}
