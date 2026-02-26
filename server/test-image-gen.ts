import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';
import fs from 'fs';

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || 'dummy_key'
});

async function testImageGen() {
    try {
        console.log('Generating image...');
        const prompt = 'A simple red cube on a white background, studio lighting.';
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: prompt
        });

        const candidate = (response as any).candidates?.[0];
        let imageBuffer: Buffer | null = null;
        if (candidate?.content?.parts) {
            for (const part of candidate.content.parts) {
                if (part.inlineData?.data) {
                    imageBuffer = Buffer.from(part.inlineData.data, 'base64');
                    break;
                }
            }
        }

        if (imageBuffer) {
            console.log('Image data found!');
            fs.writeFileSync('test-image.png', imageBuffer);
            console.log('Saved to test-image.png');
        } else {
            console.log('No image data found in response.');
            console.log('Full response:', JSON.stringify(response, null, 2));
        }
    } catch (err: any) {
        console.error('Error during image generation:', err.message);
        if (err.stack) console.error(err.stack);
    }
}

testImageGen();
