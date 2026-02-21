import type { WorkspaceConfig } from '../types';

const API_BASE = '/api/git';

export async function getWorkspaceConfig(workspaceId: string): Promise<WorkspaceConfig | null> {
    const res = await fetch(`${API_BASE}/${workspaceId}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to fetch workspace config: ${res.statusText}`);
    return res.json();
}

export async function connectRepoApi(workspaceId: string, repoUrl: string, githubToken?: string): Promise<WorkspaceConfig> {
    const res = await fetch(`${API_BASE}/${workspaceId}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl, githubToken }),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || `Failed to connect repo: ${res.statusText}`);
    }
    return res.json();
}

export async function disconnectRepoApi(workspaceId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/${workspaceId}/disconnect`, { method: 'DELETE' });
    if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || `Failed to disconnect repo: ${res.statusText}`);
    }
}
