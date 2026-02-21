import React, { useState, useEffect, useCallback } from 'react';
import { useWorkspaceStore } from '../../store/workspace';
import './GitSettings.css';

// ── Icons (inline SVG) ────────────────────────────────────────────────────────

const GitHubIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
);

const CheckIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5" />
    </svg>
);

const BranchIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
);

const CalendarIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
);

const CloseIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);

// ── Git Header Button ─────────────────────────────────────────────────────────

export const GitHeaderButton: React.FC = () => {
    const config = useWorkspaceStore(s => s.config);
    const toggleSettings = useWorkspaceStore(s => s.toggleSettings);

    const connected = !!config;

    return (
        <button
            id="git-settings-btn"
            className={`git-header-btn ${connected ? 'git-header-btn--connected' : ''}`}
            onClick={toggleSettings}
            title={connected ? `Connected to ${config.owner}/${config.repo}` : 'Connect GitHub repo'}
        >
            <GitHubIcon />
            {connected ? (
                <>
                    <span>{config.owner}/{config.repo}</span>
                    <span className="git-header-dot" />
                </>
            ) : (
                <span>Connect Repo</span>
            )}
        </button>
    );
};

// ── Git Settings Panel ────────────────────────────────────────────────────────

export const GitSettingsPanel: React.FC = () => {
    const {
        config, loading, error,
        settingsOpen, setSettingsOpen,
        connectRepo, disconnectRepo
    } = useWorkspaceStore();

    const [repoUrl, setRepoUrl] = useState('');
    const [githubToken, setGithubToken] = useState('');

    // Close on Escape
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') setSettingsOpen(false);
    }, [setSettingsOpen]);

    useEffect(() => {
        if (settingsOpen) {
            document.addEventListener('keydown', handleKeyDown);
            return () => document.removeEventListener('keydown', handleKeyDown);
        }
    }, [settingsOpen, handleKeyDown]);

    if (!settingsOpen) return null;

    const handleConnect = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!repoUrl.trim()) return;
        await connectRepo(repoUrl.trim(), githubToken.trim() || undefined);
        setRepoUrl('');
        setGithubToken('');
    };

    const handleDisconnect = async () => {
        if (window.confirm('Disconnect this repository from the workspace?')) {
            await disconnectRepo();
        }
    };

    const connectedDate = config?.connectedAt
        ? new Date(config.connectedAt).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        })
        : null;

    return (
        <>
            {/* Overlay */}
            <div
                className="git-settings-overlay"
                onClick={() => setSettingsOpen(false)}
            />

            {/* Panel */}
            <div className="git-settings-panel" role="dialog" aria-label="Git Settings">
                {/* Header */}
                <div className="git-settings-header">
                    <h2>
                        <GitHubIcon />
                        Git Settings
                    </h2>
                    <button
                        className="git-settings-close"
                        onClick={() => setSettingsOpen(false)}
                        aria-label="Close"
                    >
                        <CloseIcon />
                    </button>
                </div>

                {/* Body */}
                <div className="git-settings-body">
                    {error && <div className="git-error">{error}</div>}

                    {config ? (
                        /* ── Connected ─────────────────────────────────── */
                        <div className="git-connected-card">
                            <div className="git-connected-badge">
                                <CheckIcon />
                                <span className="git-connected-repo">
                                    <a
                                        href={config.repoUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        {config.owner}/{config.repo}
                                    </a>
                                </span>
                            </div>

                            <div className="git-connected-meta">
                                <div className="git-meta-row">
                                    <BranchIcon />
                                    <span>Default branch:</span>
                                    <span className="git-branch-badge">{config.defaultBranch}</span>
                                </div>
                                {connectedDate && (
                                    <div className="git-meta-row">
                                        <CalendarIcon />
                                        <span>Connected {connectedDate}</span>
                                    </div>
                                )}
                            </div>

                            <button
                                className="git-disconnect-btn"
                                onClick={handleDisconnect}
                                disabled={loading}
                            >
                                {loading ? <span className="git-spinner git-spinner--dark" /> : 'Disconnect Repository'}
                            </button>
                        </div>
                    ) : (
                        /* ── Connect Form ──────────────────────────────── */
                        <form className="git-connect-form" onSubmit={handleConnect}>
                            <div className="git-form-group">
                                <label htmlFor="repo-url-input">Repository URL</label>
                                <input
                                    id="repo-url-input"
                                    className="git-connect-input"
                                    type="text"
                                    value={repoUrl}
                                    onChange={e => setRepoUrl(e.target.value)}
                                    placeholder="https://github.com/owner/repo"
                                    autoFocus
                                    disabled={loading}
                                />
                                <p className="git-input-hint">
                                    Supports HTTPS and SSH formats.
                                </p>
                            </div>

                            <div className="git-form-group">
                                <label htmlFor="repo-token-input">GitHub Token <span className="git-optional">(Optional)</span></label>
                                <input
                                    id="repo-token-input"
                                    className="git-connect-input"
                                    type="password"
                                    value={githubToken}
                                    onChange={e => setGithubToken(e.target.value)}
                                    placeholder="ghp_..."
                                    disabled={loading}
                                />
                                <p className="git-input-hint">
                                    Required for private repositories. The token needs 'repo' scope.
                                </p>
                            </div>

                            <button
                                className="git-connect-btn"
                                type="submit"
                                disabled={loading || !repoUrl.trim()}
                            >
                                {loading ? <span className="git-spinner" /> : 'Connect'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </>
    );
};
