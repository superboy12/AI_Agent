import os from 'os';

export class SystemMonitorService {
    public async getSystemStatus() {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        
        return [
            { name: 'Operating System', value: `${os.type()} ${os.release()}`, status: 'Online' },
            { name: 'NodeJS Version', value: process.version, status: 'Online' },
            { name: 'CPU Usage', value: `${(os.loadavg()[0] * 100 / os.cpus().length).toFixed(1)}%`, status: 'Online' },
            { name: 'RAM Usage', value: `${(usedMem / 1024 / 1024 / 1024).toFixed(2)} GB / ${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB`, status: (usedMem / totalMem) > 0.8 ? 'Warning' : 'Online' },
            { name: 'LibreOffice Status', value: 'Ready', status: 'Online' }, // Simplified mock for now
            { name: 'Telegram Bot Status', value: 'Active', status: 'Online' },
            { name: 'Gemini API Status', value: 'Connected', status: 'Online' },
            { name: 'Discord Bot Status', value: 'Active', status: 'Online' },
        ];
    }
}
