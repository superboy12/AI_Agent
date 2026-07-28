import PizZip from 'pizzip';
import { DOMParser } from 'xmldom';
import { ContainerBounds, PAGE_CONTENT_WIDTH } from './types';

export class ImagePlaceholderService {
    /**
     * Parses a DOCX file to find the bounding box (table cell dimensions) 
     * for a given set of image placeholder names (e.g. ['foto1', 'logo']).
     * 
     * Assumes placeholders are inside a table cell (<w:tc>).
     * If not in a table, returns null for that placeholder.
     */
    public static extractBounds(
        docxBuffer: Buffer,
        placeholderNames: string[]
    ): Record<string, ContainerBounds> {
        const boundsMap: Record<string, ContainerBounds> = {};
        
        try {
            const zip = new PizZip(docxBuffer);
            const xmlContent = zip.file('word/document.xml')?.asText();
            if (!xmlContent) return boundsMap;

            const doc = new DOMParser().parseFromString(xmlContent, 'text/xml');
            
            // Get all table cells
            const cells = doc.getElementsByTagName('w:tc');
            
            for (const name of placeholderNames) {
                // The placeholder we are looking for. Docxtemplater uses {%name}
                // The user requested {{name}} as well, so we check both.
                const searchStrings = [`{%${name}}`, `{{${name}}}`];
                
                let foundCell: Element | null = null;
                
                for (let i = 0; i < cells.length; i++) {
                    const cell = cells[i];
                    // textContent gets all text inside the cell, bypassing split <w:t> nodes
                    const text = cell.textContent || '';
                    if (searchStrings.some(s => text.includes(s))) {
                        foundCell = cell;
                        break;
                    }
                }

                if (foundCell) {
                    const bounds = this.getCellDimensions(foundCell);
                    if (bounds) {
                        boundsMap[name] = bounds;
                        console.log(`[ImagePlaceholderService] {%${name}} bounds: ${bounds.widthPx}x${bounds.heightPx}`);
                    }
                }
            }
        } catch (err) {
            console.error('[ImagePlaceholderService] Failed to parse document.xml for bounds:', err);
        }

        return boundsMap;
    }

    private static getCellDimensions(tcNode: Element): ContainerBounds | null {
        let widthPx = PAGE_CONTENT_WIDTH;
        let heightPx = 9999;
        let foundDxa = 0;

        // 1. Try to get width from cell directly (<w:tcPr><w:tcW w:w="3000"/></w:tcPr>)
        const tcPrs = tcNode.getElementsByTagName('w:tcPr');
        if (tcPrs.length > 0) {
            const tcWs = tcPrs[0].getElementsByTagName('w:tcW');
            if (tcWs.length > 0) {
                const type = tcWs[0].getAttribute('w:type');
                const w = tcWs[0].getAttribute('w:w');
                // Only trust dxa. If it's auto or pct, w might be 0 or percentage (e.g. 5000 = 100%)
                if (w && type === 'dxa') {
                    foundDxa = parseInt(w, 10);
                }
            }
        }

        // 2. If not found in cell, try to find the column width from the table grid (<w:tblGrid>)
        if (!foundDxa || foundDxa === 0) {
            let trNode: Node | null = tcNode.parentNode;
            while (trNode && trNode.nodeName !== 'w:tr') { trNode = trNode.parentNode; }
            if (trNode) {
                // Determine our cell index (accounting for gridSpans in previous cells)
                let cellIndex = 0;
                let colSpanBefore = 0;
                for (let i = 0; i < trNode.childNodes.length; i++) {
                    const child = trNode.childNodes[i] as Element;
                    if (child.nodeName === 'w:tc') {
                        if (child === tcNode) {
                            cellIndex = colSpanBefore;
                            break;
                        }
                        let span = 1;
                        const prs = child.getElementsByTagName('w:tcPr');
                        if (prs.length > 0) {
                            const gridSpans = prs[0].getElementsByTagName('w:gridSpan');
                            if (gridSpans.length > 0) {
                                const val = gridSpans[0].getAttribute('w:val');
                                if (val) span = parseInt(val, 10) || 1;
                            }
                        }
                        colSpanBefore += span;
                    }
                }

                // Go up to the table node to find tblGrid
                let tblNode = trNode.parentNode;
                while (tblNode && tblNode.nodeName !== 'w:tbl') { tblNode = tblNode.parentNode; }
                if (tblNode) {
                    const tblGrids = (tblNode as Element).getElementsByTagName('w:tblGrid');
                    if (tblGrids.length > 0) {
                        const gridCols = tblGrids[0].getElementsByTagName('w:gridCol');
                        
                        // Check if our cell has a gridSpan
                        let span = 1;
                        if (tcPrs.length > 0) {
                            const gridSpans = tcPrs[0].getElementsByTagName('w:gridSpan');
                            if (gridSpans.length > 0) {
                                const val = gridSpans[0].getAttribute('w:val');
                                if (val) span = parseInt(val, 10) || 1;
                            }
                        }

                        // Sum the widths of the grid columns this cell spans
                        let totalDxa = 0;
                        for (let k = 0; k < span; k++) {
                            const col = gridCols[cellIndex + k];
                            if (col) {
                                const w = col.getAttribute('w:w');
                                if (w) totalDxa += parseInt(w, 10);
                            }
                        }
                        if (totalDxa > 0) foundDxa = totalDxa;
                    }
                }
            }
        }

        if (foundDxa > 0) {
            // Subtract cell margins (approx 230 dxa for both sides combined)
            const dxa = Math.max(100, foundDxa - 230);
            widthPx = Math.round(dxa / 15);
        } else {
            widthPx = PAGE_CONTENT_WIDTH;
        }

        // 3. Find Height
        let trNode: Node | null = tcNode.parentNode;
        while (trNode && trNode.nodeName !== 'w:tr') {
            trNode = trNode.parentNode;
        }
        
        if (trNode) {
            const trPrs = (trNode as Element).getElementsByTagName('w:trPr');
            if (trPrs.length > 0) {
                const trHeights = trPrs[0].getElementsByTagName('w:trHeight');
                if (trHeights.length > 0) {
                    const hRule = trHeights[0].getAttribute('w:hRule');
                    const h = trHeights[0].getAttribute('w:val');
                    if (h && hRule === 'exact') {
                        let dxa = parseInt(h, 10);
                        dxa = Math.max(100, dxa - 115);
                        heightPx = Math.round(dxa / 15);
                    }
                }
            }
        }

        return { widthPx, heightPx };
    }
}
