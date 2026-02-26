import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || 'dummy_key'
});

async function listModels() {
    try {
        console.log('Listing models...');
        // The @google/genai package might have a different way to list models
        // Let's see if ai.models.list() exists or similar
        const models = await ai.models.list();
        console.log(JSON.stringify(models, null, 2));
    } catch (err) {
        console.error('Error listing models:', err);
    }
}

listModels();
