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
    const dockerfileContent = `FROM node:18-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
CMD ["npm", "start"]`;
    fs.writeFileSync(`d:/AiAgent/services/${service}/Dockerfile`, dockerfileContent);
});

console.log('Dockerfiles created for all services.');
