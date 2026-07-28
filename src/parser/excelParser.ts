import ExcelJS from 'exceljs';

export class ExcelParser {
    /**
     * Reads an Excel file and extracts its content as a structured text/CSV format.
     * Useful for feeding data into AI context.
     * 
     * @param filePath Absolute path to the Excel file
     * @param maxRows Maximum number of rows to parse per sheet (to prevent context limits)
     * @returns A string representation of the Excel data
     */
    public async extractText(filePath: string, maxRows: number = 200): Promise<string> {
        try {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(filePath);

            let result = '';

            workbook.eachSheet((worksheet, sheetId) => {
                result += `\n--- Sheet: ${worksheet.name} ---\n`;
                
                let rowCount = 0;
                worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
                    if (rowCount >= maxRows) return; // limit rows
                    
                    const rowValues: string[] = [];
                    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                        let val = cell.text || '';
                        // Basic cleanup
                        val = val.replace(/\r\n|\n|\r/g, ' ').trim();
                        rowValues.push(val);
                    });
                    
                    // Join with pipe for a markdown-like table feel
                    result += `| ${rowValues.join(' | ')} |\n`;
                    rowCount++;
                });

                if (worksheet.rowCount > maxRows) {
                    result += `... (Data dipotong, total ${worksheet.rowCount} baris)\n`;
                }
            });

            return result.trim();
        } catch (error: any) {
            console.error('[ExcelParser] Error parsing excel file:', error);
            throw new Error(`Gagal membaca file Excel: ${error.message}`);
        }
    }
}
