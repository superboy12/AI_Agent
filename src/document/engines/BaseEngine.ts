import PizZip from 'pizzip';
import { TemplateAnalysis } from '../../repositories/TemplateMetadataRepository';
import { ImagePlacementOptions } from '../../image/types';

export interface DocumentEngineContext {
    /** The zipped DOCX file */
    zip: PizZip;
    /** The data to fill the template */
    data: Record<string, any>;
    /** Analysis of the template fields */
    analysis?: TemplateAnalysis;
    /** Docxtemplater modules */
    modules: any[];
    /** Map of image placeholder keys to absolute file paths */
    imagePlaceholders?: Record<string, string>;
    /** Options for image insertion */
    imageOptions?: ImagePlacementOptions;
    /** Global options/flags for the current rendering job */
    options?: Record<string, any>;
}

export interface BaseEngine {
    /**
     * Executes the engine's processing logic.
     * Modifies the context in-place.
     */
    process(context: DocumentEngineContext): Promise<void> | void;
}
