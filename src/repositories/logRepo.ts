import fs from 'fs/promises';
import path from 'path';

export interface LogEntry {
    date: string;
    time: string;
    type: 'success' | 'warning' | 'error' | 'info';
    message: string;
    status: string;
}

export class LogRepo {
    private logsDir: string;
    private workspaceId?: string;

    constructor(workspaceId?: string) {
        this.workspaceId = workspaceId;
        this.logsDir = workspaceId
            ? path.resolve(process.cwd(), `storage/workspaces/${workspaceId}/logs`)
            : path.resolve(process.cwd(), 'storage/logs');
    }

    public async init() {
        try {
            await fs.mkdir(this.logsDir, { recursive: true });
        } catch (error) {
            console.error('[LogRepo] Error creating logs directory:', error);
        }
    }

    public async log(type: LogEntry['type'], message: string, status: string = 'OK') {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0];
        
        const entry: LogEntry = {
            date: dateStr,
            time: timeStr,
            type,
            message,
            status
        };

        const logLine = `[${entry.date} ${entry.time}] [${entry.type.toUpperCase()}] [${entry.status}] ${entry.message}\n`;
        const logFile = path.join(this.logsDir, `${dateStr}.log`);

        try {
            await fs.appendFile(logFile, logLine, 'utf-8');
            
            // Console output for development
            if (type === 'error') console.error(logLine.trim());
            else if (type === 'warning') console.warn(logLine.trim());
            else console.log(logLine.trim());
        } catch (error) {
            console.error('[LogRepo] Failed to write log:', error);
        }
    }
}
