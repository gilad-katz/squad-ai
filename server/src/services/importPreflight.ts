import fs from 'fs';
import path from 'path';

const RESOLVABLE_EXTENSIONS = [
    '.ts', '.tsx', '.js', '.jsx',
    '.css', '.scss', '.sass', '.less',
    '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp',
    '.json',
];

const INDEX_RESOLVABLE_EXTENSIONS = [
    '/index.ts', '/index.tsx', '/index.js', '/index.jsx',
    '/index.css', '/index.scss', '/index.sass', '/index.less',
];

const RELATIVE_IMPORT_REGEX = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_REGEX = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

export interface ImportPreflightResult {
    ok: boolean;
    missingPackages: string[];
    missingRelativeImports: string[];
}

function toPosix(p: string): string {
    return p.replace(/\\/g, '/');
}

function extractImportSpecifiers(code: string): string[] {
    const specs = new Set<string>();
    const collect = (regex: RegExp) => {
        let match: RegExpExecArray | null;
        while ((match = regex.exec(code)) !== null) {
            const spec = match[1]?.trim();
            if (spec) specs.add(spec);
        }
        regex.lastIndex = 0;
    };
    collect(RELATIVE_IMPORT_REGEX);
    collect(DYNAMIC_IMPORT_REGEX);
    return Array.from(specs);
}

function packageRoot(specifier: string): string {
    if (specifier.startsWith('@')) {
        const parts = specifier.split('/');
        return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
    }
    return specifier.split('/')[0];
}

function pathExists(
    workspaceDir: string,
    relPath: string,
    plannedPaths: Set<string>
): boolean {
    if (plannedPaths.has(relPath)) return true;
    return fs.existsSync(path.join(workspaceDir, relPath));
}

function resolveRelativeImportCandidates(sourceFile: string, specifier: string): string[] {
    const baseDir = path.dirname(sourceFile);
    const resolvedBase = toPosix(path.normalize(path.join(baseDir, specifier)));
    if (path.extname(specifier)) return [resolvedBase];
    return [
        ...RESOLVABLE_EXTENSIONS.map(ext => `${resolvedBase}${ext}`),
        ...INDEX_RESOLVABLE_EXTENSIONS.map(ext => `${resolvedBase}${ext}`),
    ];
}

export function loadInstalledPackages(workspaceDir: string): Set<string> {
    const pkgPath = path.join(workspaceDir, 'package.json');
    const installed = new Set<string>();
    if (!fs.existsSync(pkgPath)) return installed;

    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const deps = Object.keys(pkg.dependencies || {});
        const devDeps = Object.keys(pkg.devDependencies || {});
        for (const dep of [...deps, ...devDeps]) installed.add(dep);
    } catch {
        // Best effort only.
    }

    return installed;
}

export function validateGeneratedImports(params: {
    workspaceDir: string;
    sourceFilepath: string;
    code: string;
    installedPackages: Set<string>;
    plannedPaths: Set<string>;
}): ImportPreflightResult {
    const { workspaceDir, sourceFilepath, code, installedPackages, plannedPaths } = params;
    const missingPackages = new Set<string>();
    const missingRelativeImports = new Set<string>();

    const specifiers = extractImportSpecifiers(code);
    for (const specifier of specifiers) {
        if (specifier.startsWith('.')) {
            const candidates = resolveRelativeImportCandidates(sourceFilepath, specifier);
            const found = candidates.some(candidate => pathExists(workspaceDir, candidate, plannedPaths));
            if (!found) {
                missingRelativeImports.add(`${specifier} (from ${sourceFilepath})`);
            }
            continue;
        }

        // Ignore absolute web paths and URL imports.
        if (specifier.startsWith('/') || specifier.startsWith('http://') || specifier.startsWith('https://')) {
            continue;
        }

        const root = packageRoot(specifier);
        if (!installedPackages.has(root)) {
            missingPackages.add(root);
        }
    }

    return {
        ok: missingPackages.size === 0 && missingRelativeImports.size === 0,
        missingPackages: Array.from(missingPackages),
        missingRelativeImports: Array.from(missingRelativeImports),
    };
}

export function buildImportPreflightFeedback(result: ImportPreflightResult): string {
    const parts: string[] = [];

    if (result.missingPackages.length > 0) {
        parts.push(`Missing npm packages: ${result.missingPackages.join(', ')}`);
    }
    if (result.missingRelativeImports.length > 0) {
        parts.push(`Missing relative imports: ${result.missingRelativeImports.join('; ')}`);
    }

    return [
        'PRE-WRITE IMPORT VALIDATION FAILED.',
        ...parts,
        'Regenerate this file so every import resolves to either an existing file or a file explicitly in the task manifest.',
        'Do not introduce new npm package imports unless already present in package.json.',
    ].join('\n');
}
