import { BaseEngine, DocumentEngineContext } from './BaseEngine';

export interface ValidationReport {
    isValid: boolean;
    errors: string[];
}

export class ValidationEngine implements BaseEngine {
    
    public process(context: DocumentEngineContext): void {
        const report = this.validate(context);
        if (!report.isValid) {
            console.warn('[ValidationEngine] Document validation warnings:\n' + report.errors.join('\n'));
            // Depending on strictness, we could throw an error here, but for now we just log it.
        }
    }

    public validate(context: DocumentEngineContext): ValidationReport {
        const errors: string[] = [];
        const { zip, data, analysis } = context;

        // 1. Cek Placeholder Kosong
        if (analysis) {
            for (const field of analysis.fields) {
                const val = data[field.key];
                if (val === undefined || val === null || val === '') {
                    errors.push(`Data tidak ditemukan untuk field: ${field.label || field.key}`);
                }
            }
        }

        // 2. Cek integritas struktur ZIP/XML
        const docXml = zip.file('word/document.xml')?.asText();
        if (!docXml) {
            errors.push('File document.xml tidak ditemukan (Template korup).');
        }

        // 3. Cek Header Footer hilang
        const hasHeader = Object.keys(zip.files).some(k => k.startsWith('word/header'));
        const hasFooter = Object.keys(zip.files).some(k => k.startsWith('word/footer'));
        
        // This is just a check, not necessarily an error if the user didn't want headers
        if (!hasHeader && !hasFooter) {
            // console.log('[ValidationEngine] No headers or footers found in the document.');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}
