const { NodeSSH } = require('node-ssh');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.deploy' });

const ssh = new NodeSSH();

async function checkLogs() {
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

        const logRes = await ssh.execCommand(`${pwd} docker compose logs --tail=100 ai-app`, { cwd: projectDir });
        console.log('--- DOCKER LOGS ---');
        console.log(logRes.stdout);
        if (logRes.stderr) console.error(logRes.stderr);
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkLogs();
