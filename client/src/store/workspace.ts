import { create } from 'zustand';
import type { WorkspaceConfig } from '../types';
import { getWorkspaceConfig, connectRepoApi, disconnectRepoApi } from '../services/gitApi';

/**
 * Default workspace ID — use a stable identifier so the config
 * persists across browser sessions / refreshes.
 */
const DEFAULT_WORKSPACE_ID = 'default';

interface WorkspaceStore {
    workspaceId: string;
    config: WorkspaceConfig | null;
    loading: boolean;
    error: string | null;
    settingsOpen: boolean;

    fetchConfig: () => Promise<void>;
    connectRepo: (repoUrl: string, githubToken?: string) => Promise<void>;
    disconnectRepo: () => Promise<void>;
    toggleSettings: () => void;
    setSettingsOpen: (open: boolean) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
    workspaceId: DEFAULT_WORKSPACE_ID,
    config: null,
    loading: false,
    error: null,
    settingsOpen: false,

    fetchConfig: async () => {
        set({ loading: true, error: null });
        try {
            const config = await getWorkspaceConfig(get().workspaceId);
            set({ config, loading: false });
        } catch (err: any) {
            set({ error: err.message, loading: false });
        }
    },

    connectRepo: async (repoUrl: string, githubToken?: string) => {
        set({ loading: true, error: null });
        try {
            const config = await connectRepoApi(get().workspaceId, repoUrl, githubToken);
            set({ config, loading: false });
        } catch (err: any) {
            set({ error: err.message, loading: false });
        }
    },

    disconnectRepo: async () => {
        set({ loading: true, error: null });
        try {
            await disconnectRepoApi(get().workspaceId);
            set({ config: null, loading: false });
        } catch (err: any) {
            set({ error: err.message, loading: false });
        }
    },

    toggleSettings: () => set(s => ({ settingsOpen: !s.settingsOpen })),
    setSettingsOpen: (open: boolean) => set({ settingsOpen: open }),
}));
