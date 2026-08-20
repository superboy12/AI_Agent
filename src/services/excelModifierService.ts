import path from 'path';
import fs from 'fs';
import XlsxPopulate from 'xlsx-populate';

export interface ReplacementRule {
    target: string;
    replacement: string;
}

export class ExcelModifierService {
    /**
     * Replaces strings in multiple Excel files based on rules.
     * Uses xlsx-populate to preserve shapes, flowcharts, charts, and macros.
     * 
     * @param filePaths Array of absolute paths to Excel files to modify
     * @param rules Array of replacement rules
     * @returns Array of paths to the modified Excel files
     */
    public async batchReplace(filePaths: string[], rules: ReplacementRule[]): Promise<string[]> {
        if (!filePaths || filePaths.length === 0) {
            throw new Error('No Excel files provided for replacement.');
        }

        if (!rules || rules.length === 0) {
            return filePaths; // No rules, return unmodified
        }

        const modifiedPaths: string[] = [];

        for (const filePath of filePaths) {
            try {
                // Load workbook via xlsx-populate
                const workbook = await XlsxPopulate.fromFileAsync(filePath);

                workbook.sheets().forEach((sheet: any) => {
                    const usedRange = sheet.usedRange();
                    if (!usedRange) return; // Skip empty sheets

                    const cells2D = usedRange.cells();
                    if (!cells2D) return;

                    // cells2D is an array of arrays (rows containing cells)
                    cells2D.forEach((row: any[]) => {
                        if (!Array.isArray(row)) return;
                        row.forEach((cell: any) => {
                            if (!cell || typeof cell.value !== 'function') return;

                            const rawVal = cell.value();
                            let valStr: string | null = null;
                            
                            // Handle RichText objects which have a .text() method
                            if (rawVal && typeof rawVal === 'object' && typeof rawVal.text === 'function') {
                                valStr = rawVal.text();
                            } else if (typeof rawVal === 'string') {
                                valStr = rawVal;
                            }

                            if (valStr !== null) {
                                let newVal = valStr;
                                let modified = false;

                                for (const rule of rules) {
                                    if (!rule.target) continue;
                                    // Escape special regex characters in target string
                                    const escapedTarget = rule.target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                    const regex = new RegExp(escapedTarget, 'gi');
                                    
                                    if (regex.test(newVal)) {
                                        newVal = newVal.replace(regex, rule.replacement);
                                        modified = true;
                                    }
                                }

                                if (modified) {
                                    cell.value(newVal);
                                }
                            }
                        });
                    });
                });

                // Write the modified file back to the same path
                await workbook.toFileAsync(filePath);
                modifiedPaths.push(filePath);
            } catch (error: any) {
                console.error(`[ExcelModifierService] Failed to process ${filePath}:`, error.message);
                // Continue with other files even if one fails
            }
        }

        return modifiedPaths;
    }
}
