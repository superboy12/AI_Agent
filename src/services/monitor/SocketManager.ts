import { Server, Socket } from 'socket.io';
import http from 'http';
import { SystemMonitorService } from './SystemMonitorService';
import { AnalyticsService } from './AnalyticsService';

export class SocketManager {
    private static instance: SocketManager;
    private io: Server | null = null;
    private monitorInterval: NodeJS.Timeout | null = null;
    private systemMonitor = new SystemMonitorService();
    private analyticsService = new AnalyticsService();

    private constructor() {}

    public static getInstance(): SocketManager {
        if (!SocketManager.instance) {
            SocketManager.instance = new SocketManager();
        }
        return SocketManager.instance;
    }

    public init(server: http.Server) {
        this.io = new Server(server, {
            cors: {
                origin: '*',
                methods: ['GET', 'POST']
            }
        });

        this.io.on('connection', (socket: Socket) => {
            console.log(`[Socket] Client connected: ${socket.id}`);

            socket.on('get_dashboard_stats', async () => {
                const stats = await this.analyticsService.getDashboardStats();
                socket.emit('dashboard_stats', stats);
            });

            socket.on('get_system_monitor', async () => {
                const data = await this.systemMonitor.getSystemStatus();
                socket.emit('system_monitor', data);
            });

            socket.on('get_jobs', async () => {
                const jobs = await this.analyticsService.getActiveJobs();
                socket.emit('job_update', jobs);
            });

            socket.on('get_storage', async () => {
                const storage = await this.analyticsService.getStorageStats();
                socket.emit('storage_update', storage);
            });

            socket.on('get_activities', async () => {
                const activities = await this.analyticsService.getRecentActivities();
                socket.emit('activity_log', activities);
            });

            socket.on('get_analytics', async () => {
                const data = await this.analyticsService.getAnalyticsData();
                socket.emit('analytics_data', data);
            });

            socket.on('disconnect', () => {
                console.log(`[Socket] Client disconnected: ${socket.id}`);
            });
        });

        // Start broadcasting interval (every 3 seconds)
        this.startBroadcasting();
        console.log('[Socket] Socket.io Server initialized.');
    }

    private startBroadcasting() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
        }

        this.monitorInterval = setInterval(async () => {
            if (this.io) {
                // Broadcast system status
                const sysData = await this.systemMonitor.getSystemStatus();
                this.io.emit('system_monitor', sysData);
                
                // Broadcast active jobs
                const jobs = await this.analyticsService.getActiveJobs();
                this.io.emit('job_update', jobs);
            }
        }, 3000);
    }

    // Call these from jobManager / agentService
    public emitJobUpdate(jobId: string, status: string, progress: number) {
        if (this.io) {
            // We just trigger a re-fetch of active jobs for simplicity
            this.analyticsService.getActiveJobs().then(jobs => {
                this.io!.emit('job_update', jobs);
            });
        }
    }

    public emitActivity(activity: any) {
        if (this.io) {
            this.io.emit('activity_log', activity);
        }
    }
}
