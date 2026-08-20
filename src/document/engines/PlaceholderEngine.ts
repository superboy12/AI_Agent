import { BaseEngine, DocumentEngineContext } from './BaseEngine';

export class PlaceholderEngine implements BaseEngine {
    
    public process(context: DocumentEngineContext): void {
        const { zip, analysis } = context;
        
        if (analysis && analysis.fields.length > 0) {
            let docXml = zip.file('word/document.xml')?.asText();
            if (docXml) {
                for (const field of analysis.fields) {
                    if (field.format !== 'placeholder') {
                        docXml = this.injectPlaceholderIntoXml(docXml, field);
                    }
                }
                zip.file('word/document.xml', docXml);
            }
        }
    }

    /**
     * XML Injector: Safely finds non-placeholder labels (like "Nama :") despite XML tags
     * and appends ` {{key}}` so Docxtemplater can process it normally.
     */
    private injectPlaceholderIntoXml(xml: string, field: { label: string, key: string, format: string }): string {
        const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const labelChars = field.label.trim().split('').map(escapeRegex);
        const interTag = '(?:<[^>]+>)*';
        
        let regexStr = labelChars.join(interTag);

        // Add suffix based on format to match the full pattern
        if (field.format === 'colon') {
            regexStr += '\\s*' + interTag + ':' + interTag;
        } else if (field.format === 'equals') {
            regexStr += '\\s*' + interTag + '=' + interTag;
        } else if (field.format === 'underline') {
            regexStr += '\\s*' + interTag + '(?:_' + interTag + '){3,}';
        } else if (field.format === 'dots') {
            regexStr += '\\s*' + interTag + '(?:\\.' + interTag + '){3,}';
        }

        const regex = new RegExp(regexStr, 'g');
        
        return xml.replace(regex, (match) => {
            return match + `<w:r><w:t xml:space="preserve"> {{${field.key}}}</w:t></w:r>`;
        });
    }
}
