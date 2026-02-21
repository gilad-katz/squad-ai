import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

export const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || 'dummy_key'
});

export const systemPrompt = fs.readFileSync(
    path.join(__dirname, '../../prompts/fe-senior-01.txt'),
    'utf8'
);
