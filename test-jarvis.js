require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY") {
    console.error("❌ GEMINI_API_KEY .env file ma set nathi! Pehla e add karo.");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

async function testConnection() {
    try {
        console.log("🔄 Gemini AI ne connect kari rahya chhu...");
        const response = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: 'You are JARVIS, a discipline coach AI. Say hello in one punchy sentence.'
        });
        console.log("✅ SUCCESS! Gemini nu reply:");
        console.log(response.text);
    } catch (err) {
        console.error("❌ FAILED:", err.message);
    }
}

testConnection();