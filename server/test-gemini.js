const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  const stream = await ai.models.generateContentStream({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: 'Say hi' }] }]
  });
  for await (const chunk of stream) {
    console.log("Chunk text:", chunk.text);
    if (chunk.usageMetadata) console.log("Usage:", chunk.usageMetadata);
  }
}
run().catch(console.error);
