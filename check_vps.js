const { NodeSSH } = require('node-ssh');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: '.env.deploy' });

const ssh = new NodeSSH();

async function checkVPS() {
    try {
        await ssh.connect({
            host: process.env.VPS_HOST,
            port: parseInt(process.env.VPS_PORT || '22', 10),
            username: process.env.VPS_USERNAME || 'root',
            password: process.env.VPS_PASSWORD,
            tryKeyboard: true,
        });

        const pwd = process.env.VPS_USERNAME !== 'root' ? `echo "${process.env.VPS_PASSWORD}" | sudo -S ` : '';
        const projectDir = `/home/${process.env.VPS_USERNAME}/AiAgent`;

        const logs = await ssh.execCommand(`${pwd} docker logs --tail 50 aiagent-cloudflared-1`, { cwd: projectDir });
        console.log('--- CLOUDFLARE URL ---');
        console.log(logs.stderr);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkVPS();
