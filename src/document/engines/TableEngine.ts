import { BaseEngine, DocumentEngineContext } from './BaseEngine';

export class TableEngine implements BaseEngine {
    
    public process(context: DocumentEngineContext): void {
        const { zip } = context;
        let docXml = zip.file('word/document.xml')?.asText();

        if (docXml) {
            // 1. Ensure table rows do not break across pages if possible
            // 2. We can dynamically find tables and inject <w:cantSplit/> in their <w:trPr>
            // 3. To repeat header rows, we need to ensure the first row has <w:tblHeader/>
            
            // For now, this acts as a placeholder for advanced table manipulation.
            // A full implementation requires parsing the XML tree.
            
            // Simple regex to add cantSplit to all table rows if not present
            // docXml = docXml.replace(/<w:trPr>/g, '<w:trPr><w:cantSplit/>');
            // But replacing globally might be too naive. We will refine this.

            zip.file('word/document.xml', docXml);
        }
    }
}
