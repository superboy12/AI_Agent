import { BaseEngine, DocumentEngineContext } from './BaseEngine';

export class LayoutEngine implements BaseEngine {
    
    public process(context: DocumentEngineContext): void {
        const { zip } = context;
        let docXml = zip.file('word/document.xml')?.asText();

        if (docXml) {
            // Document orientation, margins, page breaks are defined in <w:sectPr> (Section Properties)
            // By NOT touching <w:sectPr>, docxtemplater already preserves the layout.
            // Future enhancement: Dynamic changing of layout (e.g. force landscape via data flag).
            // For now, this acts as a Layout Preservation module.
            zip.file('word/document.xml', docXml);
        }
    }
}
