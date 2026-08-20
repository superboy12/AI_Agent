import { BaseEngine, DocumentEngineContext } from './BaseEngine';

export class TOCEngine implements BaseEngine {
    
    public process(context: DocumentEngineContext): void {
        const { zip } = context;
        let settingsXml = zip.file('word/settings.xml')?.asText();

        if (settingsXml) {
            // Force MS Word to update the TOC when the document is opened.
            // This is done by injecting <w:updateFields w:val="true"/> into settings.xml
            if (!settingsXml.includes('w:updateFields')) {
                settingsXml = settingsXml.replace('</w:settings>', '  <w:updateFields w:val="true"/>\n</w:settings>');
                zip.file('word/settings.xml', settingsXml);
            }
        }
    }
}
