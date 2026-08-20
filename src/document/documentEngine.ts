import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
// @ts-ignore - no type definitions available for this module
import ImageModule from 'docxtemplater-image-module-free';
import libre from 'libreoffice-convert';
import { promisify } from 'util';
import sharp from 'sharp';
import ExcelJS from 'exceljs';
import { config } from '../config/env';
import { ImagePlacementOptions } from '../image/types';
import { TemplateAnalysis } from '../repositories/TemplateMetadataRepository';

import { DocumentEngineContext } from './engines/BaseEngine';
import { PlaceholderEngine } from './engines/PlaceholderEngine';
import { LayoutEngine } from './engines/LayoutEngine';
import { StyleEngine } from './engines/StyleEngine';
import { TableEngine } from './engines/TableEngine';
import { HeaderFooterEngine } from './engines/HeaderFooterEngine';
import { SmartImageEngine } from './engines/SmartImageEngine';
import { TOCEngine } from './engines/TOCEngine';
import { ValidationEngine } from './engines/ValidationEngine';
import { ExportEngine } from './engines/ExportEngine';

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
        imagePlaceholders?: ImagePlaceholderMap,
        imageOptions?: ImagePlacementOptions,
        analysis?: TemplateAnalysis
    ): Promise<string> {
        try {
            const content = fs.readFileSync(templatePath, 'binary');
            const zip = new PizZip(content);
            const modules: any[] = [];

            // 1. Build Context
            const context: DocumentEngineContext = {
                zip,
                data,
                analysis,
                modules,
                imagePlaceholders,
                imageOptions
            };

            // 2. Run Pipeline
            const placeholderEngine = new PlaceholderEngine();
            const layoutEngine = new LayoutEngine();
            const styleEngine = new StyleEngine();
            const tableEngine = new TableEngine();
            const headerFooterEngine = new HeaderFooterEngine();
            const smartImageEngine = new SmartImageEngine();
            const tocEngine = new TOCEngine();
            const validationEngine = new ValidationEngine();

            // Execute engines in order
            await placeholderEngine.process(context);
            await layoutEngine.process(context);
            await styleEngine.process(context);
            await tableEngine.process(context);
            await headerFooterEngine.process(context);
            await smartImageEngine.process(context);
            await tocEngine.process(context);
            await validationEngine.process(context);

            // 3. Render with Docxtemplater
            const doc = new Docxtemplater(context.zip, {
                paragraphLoop: true,
                linebreaks: true,
                modules: context.modules,
            });

            doc.render(context.data);

            const buf = doc.getZip().generate({
                type: 'nodebuffer',
                compression: 'DEFLATE',
            });

            const outputPath = path.isAbsolute(outputFilename) ? outputFilename : path.join(config.tempDir, outputFilename);
            fs.writeFileSync(outputPath, buf);

            return outputPath;
        } catch (error: any) {
            console.error('[DocumentEngine] Error filling template:', error?.message || error);
            let detail = '';
            if (error?.properties?.errors) {
                const msgs = error.properties.errors.map((e: any) => e.properties?.explanation || e.message).join(', ');
                detail = `\nDetail Kesalahan Format: ${msgs}`;
                console.error('[DocumentEngine] Template errors:', JSON.stringify(error.properties.errors));
            }
            throw new Error(`Gagal mengisi template dokumen: ${error?.message || 'Template rusak.'}${detail}`);
        }
    }

    /**
     * Converts a DOCX file to PDF using LibreOffice.
     */
    public async convertToPdf(docxPath: string, outputFilename: string): Promise<string> {
        const engine = new ExportEngine();
        return engine.convertToPdf(docxPath, outputFilename);
    }

    /**
     * Converts a PDF file to DOCX using LibreOffice.
     */
    public async convertToDocx(pdfPath: string, outputFilename: string): Promise<string> {
        const engine = new ExportEngine();
        return engine.convertToDocx(pdfPath, outputFilename);
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

    /**
     * Creates a new XLSX document from scratch based on structured JSON data.
     */
    public async createExcelFromScratch(
        data: any,
        outputFilename: string
    ): Promise<string> {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'AI Agent';
        workbook.created = new Date();

        if (data.sheets && Array.isArray(data.sheets)) {
            for (const sheetData of data.sheets) {
                const sheetName = sheetData.name || 'Sheet1';
                const sheet = workbook.addWorksheet(sheetName);

                if (sheetData.rows && Array.isArray(sheetData.rows)) {
                    sheetData.rows.forEach((row: any[]) => {
                        sheet.addRow(row);
                    });
                }
                
                // Bold the first row (assuming it's header)
                sheet.getRow(1).font = { bold: true };
                
                // Auto-fit columns roughly
                sheet.columns.forEach(column => {
                    let maxLength = 0;
                    column.eachCell!({ includeEmpty: true }, cell => {
                        const columnLength = cell.value ? cell.value.toString().length : 10;
                        if (columnLength > maxLength) maxLength = columnLength;
                    });
                    column.width = maxLength < 10 ? 10 : maxLength + 2;
                });
            }
        } else {
            // Fallback if structure is wrong
            const sheet = workbook.addWorksheet('Sheet1');
            sheet.addRow(['No Data Provided']);
        }

        const outputPath = path.join(config.tempDir, outputFilename);
        await workbook.xlsx.writeFile(outputPath);
        
        return outputPath;
    }

}
