const fs = require('fs');

const agentServicePath = 'd:/AiAgent/src/services/agentService.ts';
let content = fs.readFileSync(agentServicePath, 'utf-8');

// 1. Add Imports
if (!content.includes('CacheService')) {
    content = content.replace(
        `import { SmartMappingService } from './ai/SmartMappingService';`,
        `import { SmartMappingService } from './ai/SmartMappingService';\nimport { cacheService } from './ai/CacheService';\nimport { learningService } from './ai/LearningService';`
    );
}

// Helper to inject cache logic
function injectCache(funcName, templateVersionStr, templateNameStr) {
    const startIndex = content.indexOf(\`    public async \${funcName}(\`);
    if (startIndex === -1) return;
    
    // Replace Excel parsing block to generate hash
    const excelBlock = \`
            let parsedExcelData = '';
            if (excelUrls && excelUrls.length > 0) {
                for (let i = 0; i < excelUrls.length; i++) {
                    const excelUrl = excelUrls[i];
                    const excelFilename = \\\`excel_\\\${userId}_\\\${timestamp}_\\\${i + 1}.xlsx\\\`;
                    const excelPath = await this.fileHandler.downloadFile(excelUrl, excelFilename);
                    excelPaths.push(excelPath);
                    console.log(\\\`[AgentService] Excel \\\${i + 1} downloaded: \\\${excelPath}\\\`);
                    
                    const extractedText = await this.excelParser.extractText(excelPath);
                    parsedExcelData += \\\`\\\\n=== Data Excel \\\${i + 1} ===\\\\n\\\${extractedText}\\\\n========================\\\\n\\\`;
                }
            }\`;
            
    const newExcelBlock = \`
            let parsedExcelData = '';
            let excelHashForCache = '';
            if (excelUrls && excelUrls.length > 0) {
                for (let i = 0; i < excelUrls.length; i++) {
                    const excelUrl = excelUrls[i];
                    const excelFilename = \\\`excel_\\\${userId}_\\\${timestamp}_\\\${i + 1}.xlsx\\\`;
                    const excelPath = await this.fileHandler.downloadFile(excelUrl, excelFilename);
                    excelPaths.push(excelPath);
                    console.log(\\\`[AgentService] Excel \\\${i + 1} downloaded: \\\${excelPath}\\\`);
                    
                    const extractedText = await this.excelParser.extractText(excelPath);
                    parsedExcelData += \\\`\\\\n=== Data Excel \\\${i + 1} ===\\\\n\\\${extractedText}\\\\n========================\\\\n\\\`;
                }
                const crypto = require('crypto');
                excelHashForCache = crypto.createHash('md5').update(parsedExcelData).digest('hex');
            }\`;
            
    content = content.replace(excelBlock, newExcelBlock);

    // Replace textData declarations and inject cache check
    const smartMappingBlock = \`
            // 3. Try Smart Mapping First (Features 1-6)
            let textData: Record<string, any> | undefined;
            let smartAnalysis: any;
            try {
                console.log(\\\`[AgentService] Trying Smart Mapping...\\\`);\`;
                
    const newSmartMappingBlock = \`
            // [NEW] SMART CACHE CHECK
            let textData: Record<string, any> | undefined;
            let smartAnalysis: any;
            let imagePlaceholderNames: string[] = [];

            if (excelHashForCache) {
                const cacheHit = await cacheService.checkCache(
                    excelHashForCache, 
                    \${templateVersionStr}, 
                    userInstruction || 'default', 
                    provider, 
                    '\${funcName}'
                );
                
                if (cacheHit) {
                    console.log('[AgentService] SMART CACHE HIT! Bypassing AI Generation.');
                    textData = cacheHit.mappingResult;
                    if (cacheHit.metadata && cacheHit.metadata.smartAnalysis) {
                        smartAnalysis = cacheHit.metadata.smartAnalysis;
                        imagePlaceholderNames = smartAnalysis.fields.filter((f: any) => f.isImage).map((f: any) => f.key);
                    }
                }
            }

            if (!textData) {
            // 3. Try Smart Mapping First (Features 1-6)
            try {
                console.log(\\\`[AgentService] Trying Smart Mapping...\\\`);\`;
                
    // In original code, imagePlaceholderNames is defined at fallback
    const fallbackBlock = \`
            // 4. Fallback to Legacy Gemini mode if smart mapping skipped or failed
            let imagePlaceholderNames: string[] = [];\`;
            
    const newFallbackBlock = \`
            // 4. Fallback to Legacy Gemini mode if smart mapping skipped or failed\`;

    // Extract image placeholder names
    const extractImageBlock = \`
            } else if (smartAnalysis) {
                // In Smart Mapping mode, extract image placeholder names from analysis
                imagePlaceholderNames = smartAnalysis.fields
                    .filter((f: any) => f.isImage)
                    .map((f: any) => f.key);
            }\`;
            
    const newExtractImageBlock = \`
            } else if (smartAnalysis) {
                // In Smart Mapping mode, extract image placeholder names from analysis
                imagePlaceholderNames = smartAnalysis.fields
                    .filter((f: any) => f.isImage)
                    .map((f: any) => f.key);
            }
            } // END OF if (!textData)
            \`;

    // Persist file
    const persistBlock = \`
            // Persist files
            docxPath = this.persistFile(docxPath, outputDocxFilename);
            if (pdfPath) {
                pdfPath = this.persistFile(pdfPath, outputPdfFilename);
            }\`;
            
    const newPersistBlock = \`
            // Persist files
            docxPath = this.persistFile(docxPath, outputDocxFilename);
            if (pdfPath) {
                pdfPath = this.persistFile(pdfPath, outputPdfFilename);
            }

            // [NEW] SAVE CACHE & LEARNING
            if (excelHashForCache && textData) {
                await cacheService.saveCache(
                    excelHashForCache,
                    \${templateNameStr},
                    \${templateVersionStr},
                    userInstruction || 'default',
                    provider,
                    '\${funcName}',
                    textData,
                    {},
                    { smartAnalysis },
                    docxPath,
                    pdfPath
                );
                await learningService.recordUsage(userId, \${templateNameStr}, textData, imageOptions);
            }\`;

    // Now apply these replacements only within the function body
    const funcEndIndex = content.indexOf('return { documentPath: docxPath, pdfPath };', startIndex);
    if (funcEndIndex === -1) return;
    
    let funcBody = content.substring(startIndex, funcEndIndex);
    
    funcBody = funcBody.replace(excelBlock, newExcelBlock);
    funcBody = funcBody.replace(smartMappingBlock, newSmartMappingBlock);
    funcBody = funcBody.replace(fallbackBlock, newFallbackBlock);
    funcBody = funcBody.replace(extractImageBlock, newExtractImageBlock);
    funcBody = funcBody.replace(persistBlock, newPersistBlock);
    
    content = content.substring(0, startIndex) + funcBody + content.substring(funcEndIndex);
}

injectCache('processDocument', "'v1'", "'processDocument_template'");
injectCache('processSavedTemplate', "metadata.version?.toString() || '1'", "metadata.name");

fs.writeFileSync(agentServicePath, content);
console.log('Patch complete.');
