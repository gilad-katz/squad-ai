import type { Message } from '../types';

export const fixtures: Message[] = [
    {
        id: 'm1',
        role: 'user',
        content: 'Hi, can you help me build a React button component?',
        displayContent: 'Hi, can you help me build a React button component?',
        transparency: null,
        status: 'complete',
        timestamp: Date.now() - 60000 * 5
    },
    {
        id: 'm2',
        role: 'assistant',
        content: 'TRANSPARENCY_START\nREASONING: The user needs a reusable React button component. I will create a functional component with TypeScript interfaces, supporting common button props like onClick, disabled, and variants (primary/secondary).\nTASKS: [{"id":1,"description":"Define ButtonProps interface","status":"done"},{"id":2,"description":"Create Button component structure","status":"done"},{"id":3,"description":"Add Tailwind styling based on variants","status":"done"}]\nASSUMPTIONS: - The project uses Tailwind CSS for styling\n- The user wants standard HTML button props to be passed through\nTRANSPARENCY_END\nI can certainly help you build a React button component. Here is a reusable `Button` component using TypeScript and Tailwind CSS for styling:\n\n```tsx\nimport React, { ButtonHTMLAttributes } from \'react\';\n\nexport interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {\n  variant?: \'primary\' | \'secondary\';\n  size?: \'sm\' | \'md\' | \'lg\';\n}\n\nexport const Button: React.FC<ButtonProps> = ({ \n  children, \n  variant = \'primary\', \n  size = \'md\', \n  className = \'\',\n  ...props \n}) => {\n  const baseStyles = \'inline-flex items-center justify-center font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors\';\n  \n  const variants = {\n    primary: \'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500\',\n    secondary: \'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500\',\n  };\n  \n  const sizes = {\n    sm: \'px-3 py-1.5 text-sm\',\n    md: \'px-4 py-2 text-base\',\n    lg: \'px-6 py-3 text-lg\',\n  };\n  \n  return (\n    <button \n      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className} disabled:opacity-50 disabled:cursor-not-allowed`}\n      {...props}\n    >\n      {children}\n    </button>\n  );\n};\n```\n\nThis button supports standard HTML attributes, loading states (via disabled), and comes with a few size and color variants.',
        displayContent: 'I can certainly help you build a React button component. Here is a reusable `Button` component using TypeScript and Tailwind CSS for styling:\n\n```tsx\nimport React, { ButtonHTMLAttributes } from \'react\';\n\nexport interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {\n  variant?: \'primary\' | \'secondary\';\n  size?: \'sm\' | \'md\' | \'lg\';\n}\n\nexport const Button: React.FC<ButtonProps> = ({ \n  children, \n  variant = \'primary\', \n  size = \'md\', \n  className = \'\',\n  ...props \n}) => {\n  const baseStyles = \'inline-flex items-center justify-center font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors\';\n  \n  const variants = {\n    primary: \'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500\',\n    secondary: \'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500\',\n  };\n  \n  const sizes = {\n    sm: \'px-3 py-1.5 text-sm\',\n    md: \'px-4 py-2 text-base\',\n    lg: \'px-6 py-3 text-lg\',\n  };\n  \n  return (\n    <button \n      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className} disabled:opacity-50 disabled:cursor-not-allowed`}\n      {...props}\n    >\n      {children}\n    </button>\n  );\n};\n```\n\nThis button supports standard HTML attributes, loading states (via disabled), and comes with a few size and color variants.',
        transparency: {
            reasoning: 'The user needs a reusable React button component. I will create a functional component with TypeScript interfaces, supporting common button props like onClick, disabled, and variants (primary/secondary).',
            tasks: [
                { id: 1, description: 'Define ButtonProps interface', status: 'done' },
                { id: 2, description: 'Create Button component structure', status: 'done' },
                { id: 3, description: 'Add Tailwind styling based on variants', status: 'done' }
            ],
            assumptions: '- The project uses Tailwind CSS for styling\n- The user wants standard HTML button props to be passed through'
        },
        status: 'complete',
        timestamp: Date.now() - 60000 * 4
    },
    {
        id: 'm3',
        role: 'user',
        content: 'Thank you. What if I want to make it an outline button?',
        displayContent: 'Thank you. What if I want to make it an outline button?',
        transparency: null,
        status: 'complete',
        timestamp: Date.now() - 60000 * 3
    },
    {
        id: 'm4',
        role: 'assistant',
        content: 'TRANSPARENCY_START\nREASONING: I need to update the existing Button component to support an "outline" variant. This involves adding to the variant types and the variant classes dictionary.\nTASKS: [{"id":1,"description":"Update ButtonProps with outline variant","status":"done"},{"id":2,"description":"Add outline styles to variants dictionary","status":"done"}]\nASSUMPTIONS: None\nTRANSPARENCY_END\nTo add an outline version, we just need to update two places in the component. First, add it to the `variant` type definition, and then add its specific styles to the `variants` object.\n\n```tsx\n// Update the variant type:\nexport interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {\n  variant?: \'primary\' | \'secondary\' | \'outline\';\n  // ...\n}\n\n// Add the outline styles to the variants object:\nconst variants = {\n  primary: \'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500\',\n  secondary: \'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500\',\n  outline: \'border-2 border-blue-600 text-blue-600 hover:bg-blue-50 focus:ring-blue-500\',\n};\n```',
        displayContent: 'To add an outline version, we just need to update two places in the component. First, add it to the `variant` type definition, and then add its specific styles to the `variants` object.\n\n```tsx\n// Update the variant type:\nexport interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {\n  variant?: \'primary\' | \'secondary\' | \'outline\';\n  // ...\n}\n\n// Add the outline styles to the variants object:\nconst variants = {\n  primary: \'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500\',\n  secondary: \'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500\',\n  outline: \'border-2 border-blue-600 text-blue-600 hover:bg-blue-50 focus:ring-blue-500\',\n};\n```',
        transparency: {
            reasoning: 'I need to update the existing Button component to support an "outline" variant. This involves adding to the variant types and the variant classes dictionary.',
            tasks: [
                { id: 1, description: 'Update ButtonProps with outline variant', status: 'done' },
                { id: 2, description: 'Add outline styles to variants dictionary', status: 'done' }
            ],
            assumptions: 'None'
        },
        status: 'complete',
        timestamp: Date.now() - 60000 * 2
    },
    {
        id: 'm5',
        role: 'user',
        content: 'Awesome, looks good!',
        displayContent: 'Awesome, looks good!',
        transparency: null,
        status: 'complete',
        timestamp: Date.now() - 60000 * 1
    },
    {
        id: 'm6',
        role: 'assistant',
        content: 'You are very welcome! Let me know if you need help building any other components.',
        displayContent: 'You are very welcome! Let me know if you need help building any other components.',
        transparency: null,
        status: 'complete',
        timestamp: Date.now()
    }
];
