import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';

export class ExcelMergeService {
    /**
     * Merges multiple Excel files into a single Excel file (stacking rows).
     * Assumes the first file dictates the headers. If files have the same structure, 
     * subsequent files' headers (row 1) can optionally be ignored.
     * 
     * @param filePaths Array of absolute paths to Excel files to merge
     * @param outputFileName The desired output file name
     * @param ignoreSubsequentHeaders If true, skips row 1 of the 2nd..nth files.
     * @returns The path to the merged Excel file
     */
    public async mergeExcelFiles(filePaths: string[], outputFileName: string = 'merged_result.xlsx', ignoreSubsequentHeaders: boolean = true): Promise<string> {
        if (!filePaths || filePaths.length === 0) {
            throw new Error('No Excel files provided for merging.');
        }

        const outWorkbook = new ExcelJS.Workbook();
        const outSheet = outWorkbook.addWorksheet('Merged Data');

        let isFirstFile = true;

        for (const filePath of filePaths) {
            try {
                const inWorkbook = new ExcelJS.Workbook();
                await inWorkbook.xlsx.readFile(filePath);

                // Iterate through all sheets in the input file
                inWorkbook.eachSheet((inSheet) => {
                    inSheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
                        // Skip header row for subsequent files if requested
                        if (!isFirstFile && ignoreSubsequentHeaders && rowNumber === 1) {
                            return;
                        }

                        // Add row to output sheet
                        const newRow = outSheet.addRow(row.values);
                        
                        // Optionally copy styles from the first file's first sheet (basic alignment/fonts)
                        if (isFirstFile) {
                            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                                const newCell = newRow.getCell(colNumber);
                                newCell.style = cell.style;
                            });
                        }
                    });
                });

                isFirstFile = false;
            } catch (error: any) {
                console.error(`[ExcelMergeService] Failed to read ${filePath}:`, error.message);
                // Continue merging other files even if one fails? Yes, but ideally we warn.
            }
        }

        const outputPath = path.join(process.cwd(), 'temp', outputFileName);
        
        // Ensure temp dir exists
        const tempDir = path.dirname(outputPath);
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        await outWorkbook.xlsx.writeFile(outputPath);
        return outputPath;
    }
}
