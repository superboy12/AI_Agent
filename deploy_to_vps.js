const { NodeSSH } = require('node-ssh');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load deployment config
dotenv.config({ path: '.env.deploy' });

const ssh = new NodeSSH();

async function deploy() {
    const host = process.env.VPS_HOST;
    const port = parseInt(process.env.VPS_PORT || '22', 10);
    const username = process.env.VPS_USERNAME || 'root';
    const password = process.env.VPS_PASSWORD;

    if (!host || !password) {
        console.error('ERROR: VPS_HOST and VPS_PASSWORD must be set in .env.deploy');
        process.exit(1);
    }

    try {
        console.log(`[1/5] 🔌 Connecting to VPS: ${username}@${host}:${port}...`);
        await ssh.connect({
            host,
            port,
            username,
            password,
            tryKeyboard: true,
        });
        console.log('✅ Connected successfully!');

        const pwd = username !== 'root' ? `echo "${password}" | sudo -S ` : '';
        const projectDir = `/home/${username}/AiAgent`;

        console.log('[2/5] 🐳 Checking and installing Docker...');
        let res = await ssh.execCommand('docker --version');
        if (res.stdout.includes('Docker version')) {
            console.log('✅ Docker is already installed.');
        } else {
            console.log('⏳ Installing Docker... (this might take a minute)');
            await ssh.execCommand(`${pwd} curl -fsSL https://get.docker.com -o get-docker.sh`);
            await ssh.execCommand(`${pwd} sh get-docker.sh`);
            console.log('✅ Docker installed.');
        }

        console.log(`[3/5] 📁 Preparing directory on VPS: ${projectDir}...`);
        await ssh.execCommand(`mkdir -p ${projectDir}`);

        console.log('[4/5] 🚀 Uploading project files to VPS...');
        const failed = [];
        const successful = [];
        
        await ssh.putDirectory(__dirname, projectDir, {
            recursive: true,
            concurrency: 10,
            validate: (itemPath) => {
                const baseName = path.basename(itemPath);
                // Only ignore the root 'storage' folder, not 'src/services/storage'
                const isRootStorage = baseName === 'storage' && !itemPath.replace(/\\/g, '/').includes('/src/services/');
                return !['node_modules', '.git', 'temp_deploy'].includes(baseName) 
                    && !isRootStorage
                    && !itemPath.includes('node_modules')
                    && !itemPath.includes('.git');
            },
            tick: (localPath, remotePath, error) => {
                if (error) {
                    failed.push(localPath);
                } else {
                    successful.push(localPath);
                }
            }
        });
        console.log(`✅ Upload completed! (${successful.length} files uploaded, ${failed.length} failed)`);

        console.log('[5/5] 🏗️ Starting Docker Compose on VPS...');
        // Copy .env if not exists on remote (assuming local .env has the right configs)
        await ssh.putFile(path.join(__dirname, '.env'), `${projectDir}/.env`);
        
        const composeRes = await ssh.execCommand(`${pwd} docker compose up -d --build`, { cwd: projectDir });
        console.log('Docker Compose Output:\n', composeRes.stdout);
        if (composeRes.stderr) console.error('Docker Compose Errors:\n', composeRes.stderr);

        console.log('🎉 DEPLOYMENT COMPLETE! Your Cloud Platform is live!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Deployment Failed:', err);
        process.exit(1);
    }
}

deploy();
