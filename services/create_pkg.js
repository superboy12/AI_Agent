const fs = require('fs');
const path = require('path');

const services = [
    'api-gateway',
    'ai-service',
    'document-service',
    'storage-service',
    'worker-service'
];

services.forEach(service => {
    const pkg = {
        "name": service,
        "version": "1.0.0",
        "description": "",
        "main": "src/index.ts",
        "scripts": {
            "start": "ts-node src/index.ts"
        },
        "dependencies": {
            "express": "^4.18.2",
            "dotenv": "^16.3.1",
            "bullmq": "^4.12.3",
            "ioredis": "^5.3.2",
            "axios": "^1.6.0",
            "form-data": "^4.0.0",
            "ts-node": "^10.9.1",
            "typescript": "^5.2.2",
            "@types/express": "^4.17.18"
        }
    };
    
    fs.writeFileSync(`d:/AiAgent/services/${service}/package.json`, JSON.stringify(pkg, null, 2));
    
    const tsconfig = {
        "compilerOptions": {
            "target": "es2022",
            "module": "commonjs",
            "esModuleInterop": true,
            "forceConsistentCasingInFileNames": true,
            "strict": true,
            "skipLibCheck": true
        },
        "include": ["src/**/*"]
    };
    fs.writeFileSync(`d:/AiAgent/services/${service}/tsconfig.json`, JSON.stringify(tsconfig, null, 2));
});

console.log('package.json and tsconfig.json created for all services.');
