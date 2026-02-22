import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function run() {
  try {
    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContentStream('Tell me a short story about a brave knight.');
    for await (const chunk of result.stream) {
      if (chunk.usageMetadata) {
        console.log('usageMetadata:', chunk.usageMetadata);
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

run();
