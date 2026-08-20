const fs = require('fs');
const path = require('path');

const projectRoot = 'd:/AiAgent';
const servicesDir = path.join(projectRoot, 'services');

const services = [
    'api-gateway',
    'ai-service',
    'document-service',
    'storage-service',
    'worker-service'
];

if (!fs.existsSync(servicesDir)) {
    fs.mkdirSync(servicesDir, { recursive: true });
}

services.forEach(service => {
    const servicePath = path.join(servicesDir, service);
    const srcPath = path.join(servicePath, 'src');
    
    if (!fs.existsSync(srcPath)) {
        fs.mkdirSync(srcPath, { recursive: true });
    }

    // Basic package.json
    const packageJson = {
        name: service,
        version: "1.0.0",
        main: "src/index.ts",
        scripts: {
            "start": "tsx src/index.ts",
            "dev": "tsx watch src/index.ts",
            "build": "tsc"
        },
        dependencies: {
            "express": "^4.21.0",
            "dotenv": "^16.4.5"
        },
        devDependencies: {
            "typescript": "^5.6.2",
            "tsx": "^4.19.1",
            "@types/express": "^4.17.21",
            "@types/node": "^22.5.5"
        }
    };
    
    // Add specific dependencies based on service
    if (service === 'worker-service' || service === 'api-gateway' || service === 'document-service') {
        packageJson.dependencies["bullmq"] = "^5.12.0";
        packageJson.dependencies["ioredis"] = "^5.4.1";
    }
    
    if (service === 'ai-service') {
        packageJson.dependencies["@google/genai"] = "^0.1.2";
    }
    
    if (service === 'document-service') {
        packageJson.dependencies["docxtemplater"] = "^3.53.0";
        packageJson.dependencies["docxtemplater-image-module-free"] = "^1.1.1";
        packageJson.dependencies["pizzip"] = "^3.1.7";
        packageJson.dependencies["pdf-lib"] = "^1.17.1";
    }
    
    fs.writeFileSync(path.join(servicePath, 'package.json'), JSON.stringify(packageJson, null, 2));

    // Basic tsconfig.json
    const tsconfig = {
        "compilerOptions": {
            "target": "ES2022",
            "module": "CommonJS",
            "outDir": "./dist",
            "rootDir": "./src",
            "strict": true,
            "esModuleInterop": true,
            "skipLibCheck": true,
            "forceConsistentCasingInFileNames": true,
            "resolveJsonModule": true
        },
        "include": ["src/**/*"]
    };
    fs.writeFileSync(path.join(servicePath, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));
    
    // Basic index.ts
    const indexContent = `import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
    res.json({ service: '${service}', status: 'OK' });
});

app.listen(PORT, () => {
    console.log(\`${service} running on port \${PORT}\`);
});
`;
    fs.writeFileSync(path.join(srcPath, 'index.ts'), indexContent);
});

console.log('Monorepo structure initialized successfully.');
