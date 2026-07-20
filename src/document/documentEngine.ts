import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
// @ts-ignore - no type definitions available for this module
import ImageModule from 'docxtemplater-image-module-free';
import libre from 'libreoffice-convert';
import { promisify } from 'util';
import sharp from 'sharp';
import { config } from '../config/env';

const libreConvert = promisify(libre.convert);

// Full-width size for A4 paper content area (pixels at 96dpi, standard margins excluded)
const FULL_WIDTH_PX = 600;

export interface ImagePlaceholderMap {
    [placeholderName: string]: string; // placeholder -> absolute file path
}

export class DocumentEngine {
    /**
     * Pre-processes an image using sharp:
     * - Auto-rotates based on EXIF orientation (fixes phone camera photos)
     * - Returns the corrected buffer and its true visual dimensions
     */
    private async normalizeImage(filePath: string): Promise<{ buffer: Buffer; width: number; height: number; density: number }> {
        // .rotate() with no args auto-rotates based on EXIF and strips EXIF orientation tag
        const pipeline = sharp(filePath).rotate();
        const metadata = await pipeline.metadata();
        const buffer = await pipeline.toBuffer();

        return {
            buffer,
            width: metadata.width || FULL_WIDTH_PX,
            height: metadata.height || Math.round(FULL_WIDTH_PX * 0.75),
            density: metadata.density || 96, // DPI, default to 96 if not in EXIF
        };
    }

    /**
     * Fills a DOCX template with text data and optional images.
     * - Text placeholders: {NamaField}
     * - Image placeholders: {%namaGambar}
     *
     * @param templatePath Path to the input DOCX template
     * @param data JSON object containing the text replacement data
     * @param outputFilename Desired filename for the output
     * @param imagePlaceholders Optional map of image placeholder name -> file path
     * @returns Path to the filled DOCX file
     */
    public async fillTemplate(
        templatePath: string,
        data: Record<string, any>,
        outputFilename: string,
        imagePlaceholders?: ImagePlaceholderMap
    ): Promise<string> {
        try {
            const content = fs.readFileSync(templatePath, 'binary');
            const zip = new PizZip(content);
            const modules: any[] = [];

            if (imagePlaceholders && Object.keys(imagePlaceholders).length > 0) {
                // Pre-process ALL images with sharp BEFORE Docxtemplater runs (sync context)
                // This normalizes EXIF orientation so dimensions are always visually correct
                const normalizedImages = new Map<string, { buffer: Buffer; width: number; height: number; density: number }>();

                for (const [placeholderName, filePath] of Object.entries(imagePlaceholders)) {
                    if (fs.existsSync(filePath)) {
                        console.log(`[DocumentEngine] Normalizing image for {%${placeholderName}}...`);
                        const normalized = await this.normalizeImage(filePath);
                        normalizedImages.set(placeholderName, normalized);
                        console.log(`[DocumentEngine] {%${placeholderName}}: normalized to ${normalized.width}x${normalized.height}`);
                    } else {
                        console.warn(`[DocumentEngine] Image file not found: ${filePath}`);
                    }
                }

                const imageModule = new ImageModule({
                    centered: false,
                    fileType: 'docx',
                    getImage: (tagValue: string, tagName: string) => {
                        const img = normalizedImages.get(tagName);
                        if (img) {
                            console.log(`[DocumentEngine] Inserting image for {%${tagName}}`);
                            return img.buffer;
                        }
                        console.warn(`[DocumentEngine] No normalized image found for {%${tagName}}`);
                        return null;
                    },
                    getSize: (imgBuffer: Buffer, tagValue: string, tagName: string) => {
                        const img = normalizedImages.get(tagName);
                        if (!img) return [FULL_WIDTH_PX, Math.round(FULL_WIDTH_PX * 0.75)];

                        // Always use natural image size based on DPI metadata.
                        // This preserves the image's original print size without cropping or distortion.
                        const density = img.density || 96;
                        const naturalWidthPx = Math.round((img.width / density) * 96);
                        const naturalHeightPx = Math.round((img.height / density) * 96);

                        // Only scale down if the image is naturally wider than the page content area
                        if (naturalWidthPx > FULL_WIDTH_PX) {
                            const scale = FULL_WIDTH_PX / naturalWidthPx;
                            const w = FULL_WIDTH_PX;
                            const h = Math.round(naturalHeightPx * scale);
                            console.log(`[DocumentEngine] {%${tagName}} → scaled down: ${w}x${h}`);
                            return [w, h];
                        }

                        console.log(`[DocumentEngine] {%${tagName}} → natural: ${naturalWidthPx}x${naturalHeightPx}`);
                        return [naturalWidthPx, naturalHeightPx];
                    }
                });

                modules.push(imageModule);

                // Docxtemplater needs a truthy value for each image placeholder key
                for (const key of Object.keys(imagePlaceholders)) {
                    data[key] = true;
                }
            }

            const doc = new Docxtemplater(zip, {
                paragraphLoop: true,
                linebreaks: true,
                modules,
            });

            doc.render(data);

            const buf = doc.getZip().generate({
                type: 'nodebuffer',
                compression: 'DEFLATE',
            });

            const outputPath = path.join(config.tempDir, outputFilename);
            fs.writeFileSync(outputPath, buf);

            return outputPath;
        } catch (error: any) {
            console.error('[DocumentEngine] Error filling template:', error?.message || error);
            if (error?.properties?.errors) {
                console.error('[DocumentEngine] Template errors:', JSON.stringify(error.properties.errors));
            }
            throw new Error(`Gagal mengisi template dokumen: ${error?.message || 'Template mungkin rusak atau tidak valid.'}`);
        }
    }

    /**
     * Converts a DOCX file to PDF using LibreOffice.
     */
    public async convertToPdf(docxPath: string, outputFilename: string): Promise<string> {
        try {
            const fileBuf = fs.readFileSync(docxPath);
            const pdfBuf = await libreConvert(fileBuf, '.pdf', undefined);

            const outputPath = path.join(config.tempDir, outputFilename);
            fs.writeFileSync(outputPath, pdfBuf);

            return outputPath;
        } catch (error) {
            console.error('[DocumentEngine] Error converting to PDF:', error);
            throw new Error('Gagal mengkonversi dokumen ke PDF. Pastikan LibreOffice terinstal.');
        }
    }

    /**
     * Creates a new DOCX document from scratch based on structured JSON data.
     */
    public async createDocumentFromScratch(
        data: any,
        outputFilename: string
    ): Promise<string> {
        const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } = require('docx');
        
        const children: any[] = [];

        if (data.title) {
            children.push(
                new Paragraph({
                    text: data.title,
                    heading: HeadingLevel.TITLE,
                    alignment: 'center'
                })
            );
        }

        if (data.content && Array.isArray(data.content)) {
            for (const item of data.content) {
                if (item.type === 'heading') {
                    let level = HeadingLevel.HEADING_1;
                    if (item.level === 2) level = HeadingLevel.HEADING_2;
                    else if (item.level === 3) level = HeadingLevel.HEADING_3;
                    else if (item.level === 4) level = HeadingLevel.HEADING_4;
                    else if (item.level === 5) level = HeadingLevel.HEADING_5;
                    else if (item.level === 6) level = HeadingLevel.HEADING_6;

                    children.push(
                        new Paragraph({
                            text: item.text,
                            heading: level,
                        })
                    );
                } else if (item.type === 'paragraph') {
                    children.push(
                        new Paragraph({
                            children: [new TextRun(item.text)],
                            spacing: { after: 200 }
                        })
                    );
                } else if (item.type === 'list' && Array.isArray(item.items)) {
                    for (const listItem of item.items) {
                        children.push(
                            new Paragraph({
                                text: listItem,
                                bullet: { level: 0 }
                            })
                        );
                    }
                } else if (item.type === 'table' && Array.isArray(item.rows)) {
                    const rows: any[] = [];
                    
                    if (item.headers && Array.isArray(item.headers)) {
                        rows.push(
                            new TableRow({
                                children: item.headers.map((h: string) => 
                                    new TableCell({
                                        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
                                        shading: { fill: 'E0E0E0' }
                                    })
                                )
                            })
                        );
                    }

                    for (const row of item.rows) {
                        rows.push(
                            new TableRow({
                                children: row.map((cellText: string) => 
                                    new TableCell({
                                        children: [new Paragraph(cellText)]
                                    })
                                )
                            })
                        );
                    }

                    children.push(
                        new Table({
                            rows,
                            width: { size: 100, type: WidthType.PERCENTAGE }
                        })
                    );
                    children.push(new Paragraph({ spacing: { after: 200 } })); // Spacer after table
                }
            }
        }

        const doc = new Document({
            sections: [
                {
                    properties: {},
                    children,
                },
            ],
        });

        const buffer = await Packer.toBuffer(doc);
        const outputPath = path.join(config.tempDir, outputFilename);
        fs.writeFileSync(outputPath, buffer);
        
        return outputPath;
    }
}
