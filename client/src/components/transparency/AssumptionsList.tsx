import React from 'react';
import { AlertTriangle, Palette, Globe, Layers, Zap } from 'lucide-react';

interface AssumptionsListProps {
    assumptions: string;
}

// REQ-3.2: Structured assumptions with parsed bullets and category icons
const CATEGORY_ICONS: Record<string, React.FC<{ className?: string }>> = {
    'style': Palette,
    'color': Palette,
    'design': Palette,
    'theme': Palette,
    'responsive': Globe,
    'mobile': Globe,
    'browser': Globe,
    'framework': Layers,
    'stack': Layers,
    'react': Layers,
    'typescript': Layers,
    'performance': Zap,
    'animation': Zap,
};

function getCategoryIcon(text: string): React.FC<{ className?: string }> {
    const lowerText = text.toLowerCase();
    for (const [keyword, Icon] of Object.entries(CATEGORY_ICONS)) {
        if (lowerText.includes(keyword)) return Icon;
    }
    return AlertTriangle;
}

export const AssumptionsList: React.FC<AssumptionsListProps> = ({ assumptions }) => {
    if (assumptions === undefined || assumptions === null) return null;

    // Ensure we have a string to work with
    const rawAssumptions = typeof assumptions === 'string'
        ? assumptions
        : Array.isArray(assumptions)
            ? (assumptions as any[]).join('\n')
            : JSON.stringify(assumptions);

    const isNone = rawAssumptions.trim().toLowerCase() === 'none' ||
        rawAssumptions.trim().toLowerCase() === 'none.' ||
        rawAssumptions.trim() === '';

    // Parse bullet points from assumptions text
    const bullets = rawAssumptions
        .split(/\n/)
        .map(line => line.replace(/^[\s\-\*•]+/, '').trim())
        .filter(line => line.length > 0 && line.toLowerCase() !== 'none');

    return (
        <div className="mb-2 animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <h4 className="text-[10px] font-bold text-amber-600 uppercase tracking-[0.2em] mb-2.5 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]"></span>
                Assumptions
            </h4>
            {isNone || bullets.length === 0 ? (
                <p className="text-[11px] text-gray-400 font-medium italic pl-3.5 tracking-tight">No explicit assumptions defined for this task.</p>
            ) : (
                <div className="space-y-2 pl-1">
                    {bullets.map((bullet, i) => {
                        const Icon = getCategoryIcon(bullet);
                        return (
                            <div key={i} className="flex items-start gap-2.5 group">
                                <Icon className="w-3.5 h-3.5 text-amber-500/70 mt-0.5 shrink-0 group-hover:text-amber-400 transition-colors" />
                                <span className="text-xs text-gray-500 font-medium leading-relaxed group-hover:text-gray-400 transition-colors">
                                    {bullet}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
