import { BaseEngine, DocumentEngineContext } from './BaseEngine';

export class StyleEngine implements BaseEngine {
    
    public process(context: DocumentEngineContext): void {
        const { zip } = context;
        // The styles are preserved in word/styles.xml
        // We ensure that docxtemplater does not strip them by validating the xml structure if needed.
        let stylesXml = zip.file('word/styles.xml')?.asText();

        if (stylesXml) {
            // Style engine acts as a preservation module.
            // Could be extended to inject custom styles if required by the user in the future.
            zip.file('word/styles.xml', stylesXml);
        }
    }
}
