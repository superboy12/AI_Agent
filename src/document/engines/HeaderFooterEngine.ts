import { BaseEngine, DocumentEngineContext } from './BaseEngine';

export class HeaderFooterEngine implements BaseEngine {
    
    public process(context: DocumentEngineContext): void {
        const { zip, data } = context;
        
        // Find all header and footer files
        const files = Object.keys(zip.files).filter(k => k.startsWith('word/header') || k.startsWith('word/footer'));

        for (const file of files) {
            let xml = zip.file(file)?.asText();
            if (xml) {
                // Future enhancement: We can inject placeholders into headers/footers here
                // if they are not naturally detected by docxtemplater.
                // For now, this engine ensures they are preserved.
                zip.file(file, xml);
            }
        }
    }
}
