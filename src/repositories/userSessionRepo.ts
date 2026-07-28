import { JsonDB } from '../utils/jsonDB';

export interface UserSession {
    userId: string;
    activeWorkspaceId: string | null; // null means global workspace
}

export class UserSessionRepo {
    private db: JsonDB<{ sessions: UserSession[] }>;

    constructor() {
        this.db = new JsonDB('storage/database/user_sessions.json');
    }

    public async init() {
        await this.db.init({ sessions: [] });
    }

    public async getActiveWorkspace(userId: string): Promise<string | null> {
        const data = await this.db.read();
        const session = data?.sessions.find(s => s.userId === userId);
        return session?.activeWorkspaceId || null;
    }

    public async setActiveWorkspace(userId: string, workspaceId: string | null): Promise<boolean> {
        const data = await this.db.read();
        if (!data) return false;

        const sessionIndex = data.sessions.findIndex(s => s.userId === userId);
        if (sessionIndex >= 0) {
            data.sessions[sessionIndex].activeWorkspaceId = workspaceId;
        } else {
            data.sessions.push({ userId, activeWorkspaceId: workspaceId });
        }

        return await this.db.write(data);
    }
}
