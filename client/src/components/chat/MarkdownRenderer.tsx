import React from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Check } from 'lucide-react';

interface MarkdownRendererProps {
    content: string;
}

const sanitizeOptions = {
    allowedElements: ['p', 'h1', 'h2', 'h3', 'h4', 'strong', 'em', 'code',
        'pre', 'ul', 'ol', 'li', 'blockquote', 'hr', 'br', 'a'],
    allowedAttributes: { a: ['href'], code: ['className'] },
};

function CodeBlock({ language, children }: { language: string, children: React.ReactNode }) {
    const [copied, setCopied] = React.useState(false);

    const copy = async () => {
        await navigator.clipboard.writeText(String(children).trim());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="relative group my-4 rounded-xl overflow-hidden border border-gray-200 bg-[#FAFAFA]">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
                <span className="text-xs font-mono font-medium text-gray-500 uppercase">{language}</span>
                <button
                    onClick={copy}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    aria-label="Copy code to clipboard"
                >
                    {copied ? (
                        <>
                            <Check className="w-3.5 h-3.5 text-green-600" />
                            <span className="text-green-600">Copied!</span>
                        </>
                    ) : (
                        'Copy'
                    )}
                </button>
            </div>
            <div className="p-4 overflow-x-auto text-sm">
                <SyntaxHighlighter
                    language={language || 'text'}
                    style={oneLight}
                    customStyle={{
                        margin: 0,
                        padding: 0,
                        background: 'transparent',
                        fontSize: '0.875rem',
                        lineHeight: '1.5',
                    }}
                >
                    {String(children).trim()}
                </SyntaxHighlighter>
            </div>
        </div>
    );
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[[rehypeSanitize, sanitizeOptions]]}
            components={{
                code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                        <CodeBlock language={match[1]}>
                            {children}
                        </CodeBlock>
                    ) : (
                        <code className="px-1.5 py-0.5 rounded-md bg-gray-100 text-pink-600 font-mono text-sm" {...props}>
                            {children}
                        </code>
                    );
                },
                p: ({ children }) => <p className="mb-4 text-gray-800 leading-relaxed">{children}</p>,
                ul: ({ children }) => <ul className="list-disc pl-5 mb-4 space-y-1 text-gray-800">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-5 mb-4 space-y-1 text-gray-800">{children}</ol>,
                li: ({ children }) => <li className="leading-relaxed text-gray-800">{children}</li>,
                a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        {children}
                    </a>
                ),
            }}
        >
            {content}
        </ReactMarkdown>
    );
};
