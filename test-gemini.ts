import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: "dummy_key" });
ai.models.generateContent({
  model: "gemini-flash-latest",
  contents: "hello"
}).then(res => console.log(res.text)).catch(err => console.error(err));
