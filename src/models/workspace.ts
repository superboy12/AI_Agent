export interface Workspace {
    id: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    isFavorite: boolean;
    createdAt: number;
    lastOpenedAt: number;
    stats?: {
        documentCount: number;
        templateCount: number;
        chatCount: number;
    };
}
