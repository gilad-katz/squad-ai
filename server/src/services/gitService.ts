import fs from 'fs';
import path from 'path';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WorkspaceConfig {
    repoUrl: string;
    owner: string;
    repo: string;
    defaultBranch: string;
    connectedAt: string;
    githubToken?: string;
}

interface WorkspaceStore {
    [workspaceId: string]: WorkspaceConfig;
}

// ── Persistence ────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, '../../data');
const STORE_PATH = path.join(DATA_DIR, 'workspaces.json');

function loadWorkspaces(): WorkspaceStore {
    try {
        if (fs.existsSync(STORE_PATH)) {
            return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
        }
    } catch (err) {
        console.warn('Failed to load workspaces.json, starting fresh:', err);
    }
    return {};
}

function saveWorkspaces(store: WorkspaceStore): void {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

// ── GitHub API helpers ─────────────────────────────────────────────────────────

function githubHeaders(explicitToken?: string): Record<string, string> {
    const token = explicitToken || process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

/**
 * Parse owner/repo from a GitHub URL.
 * Supports:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo.git
 *   git@github.com:owner/repo.git
 */
export function parseRepoUrl(repoUrl: string): { owner: string; repo: string } {
    // HTTPS format
    const httpsMatch = repoUrl.match(/(?:^|\/\/)github\.com\/([^/]+)\/([^/.]+)/);
    if (httpsMatch) {
        return { owner: httpsMatch[1], repo: httpsMatch[2] };
    }
    // SSH format
    const sshMatch = repoUrl.match(/(?:^|@)github\.com:([^/]+)\/([^/.]+)/);
    if (sshMatch) {
        return { owner: sshMatch[1], repo: sshMatch[2] };
    }
    throw new Error(`Invalid GitHub URL: ${repoUrl}`);
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Get the workspace config for a given workspace ID, or null if not connected.
 */
export function getWorkspaceConfig(workspaceId: string): WorkspaceConfig | null {
    const store = loadWorkspaces();
    return store[workspaceId] ?? null;
}

/**
 * Connect a GitHub repo to a workspace.
 * Validates the repo exists via the GitHub API before persisting.
 */
export async function connectRepo(workspaceId: string, repoUrl: string, githubToken?: string): Promise<WorkspaceConfig> {
    const { owner, repo } = parseRepoUrl(repoUrl);

    // Validate the repo exists on GitHub
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: githubHeaders(githubToken),
    });

    if (!res.ok) {
        const body = await res.text();
        if (res.status === 404) {
            throw new Error(`Repository not found: ${owner}/${repo}`);
        }
        throw new Error(`GitHub API error (${res.status}): ${body}`);
    }

    const repoData = await res.json();

    const config: WorkspaceConfig = {
        repoUrl,
        owner,
        repo,
        defaultBranch: repoData.default_branch || 'main',
        connectedAt: new Date().toISOString(),
    };

    if (githubToken) {
        config.githubToken = githubToken;
    }

    const store = loadWorkspaces();
    store[workspaceId] = config;
    saveWorkspaces(store);

    return config;
}

/**
 * Disconnect a repo from a workspace.
 */
export function disconnectRepo(workspaceId: string): void {
    const store = loadWorkspaces();
    delete store[workspaceId];
    saveWorkspaces(store);
}

/**
 * List branches for the connected repo.
 */
export async function listBranches(workspaceId: string): Promise<Array<{ name: string }>> {
    const config = getWorkspaceConfig(workspaceId);
    if (!config) throw new Error(`No repo connected to workspace: ${workspaceId}`);

    const res = await fetch(
        `https://api.github.com/repos/${config.owner}/${config.repo}/branches?per_page=100`,
        { headers: githubHeaders(config.githubToken) }
    );

    if (!res.ok) {
        throw new Error(`GitHub API error (${res.status}): ${await res.text()}`);
    }

    const branches = await res.json();
    return branches.map((b: any) => ({ name: b.name }));
}

/**
 * Get detailed repo info for the connected repo.
 */
export async function getRepoInfo(workspaceId: string): Promise<Record<string, any>> {
    const config = getWorkspaceConfig(workspaceId);
    if (!config) throw new Error(`No repo connected to workspace: ${workspaceId}`);

    const res = await fetch(
        `https://api.github.com/repos/${config.owner}/${config.repo}`,
        { headers: githubHeaders(config.githubToken) }
    );

    if (!res.ok) {
        throw new Error(`GitHub API error (${res.status}): ${await res.text()}`);
    }

    const data = await res.json();
    return {
        fullName: data.full_name,
        description: data.description,
        defaultBranch: data.default_branch,
        visibility: data.visibility,
        htmlUrl: data.html_url,
        language: data.language,
        stargazersCount: data.stargazers_count,
        updatedAt: data.updated_at,
    };
}
