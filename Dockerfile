FROM node:22-slim

# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --production

# Copy source code
COPY . .

# Install PM2 globally to run both API and Worker
RUN npm install -g pm2

# Generate Prisma Client
RUN npx prisma generate

# Build TypeScript code (using tsc or tsx as runner)
# In this case, we rely on ecosystem.config.js which uses npm run start (tsx)

# Start PM2
CMD ["pm2-runtime", "start", "ecosystem.config.js"]
