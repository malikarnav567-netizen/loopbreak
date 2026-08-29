import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI } from "@google/generative-ai";
import cors from "cors";

const geminiApiKey = defineSecret("GEMINI_API_KEY");
const corsHandler = cors({ origin: true });

export const analyzeThought = onRequest(
  {
    secrets: [geminiApiKey],
    timeoutSeconds: 60,
    memory: "512MiB",
  },
  (req, res) => {
    corsHandler(req, res, async () => {
      if (req.method !== "POST") {
        res.status(405).json({ error: "Only POST allowed" });
        return;
      }

      const { text, sessionId } = req.body;

      if (!text || typeof text !== "string" || text.trim().length < 8) {
        res.status(400).json({ error: "Please send a valid thought (text)" });
        return;
      }

      try {
        const genAI = new GoogleGenerativeAI(geminiApiKey.value());
        const model = genAI.getGenerativeModel({
          model: "gemini-1.5-flash",
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.3,
          },
        });

        const prompt = `
You are a highly precise clinical CBT specialist.
Analyze the user's anxious/ruminative thought.
Return ONLY valid JSON in this exact format (no extra text):

{
  "distortions": ["one to three labels"],
  "core_fallacy": "one clear sentence",
  "socratic_question": "one short powerful Socratic question"
}

Allowed distortion labels (use only these exact names):
- Mind Reading
- Catastrophizing
- All-or-Nothing Thinking
- Overgeneralization
- Emotional Reasoning
- Should Statements
- Labeling
- Personalization
- Mental Filter
- Jumping to Conclusions

User thought: """${text}"""
`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        const json = JSON.parse(responseText);

        res.status(200).json(json);
      } catch (error: any) {
        console.error("Error:", error);
        res.status(500).json({
          error: "Failed to analyze thought",
          details: error.message,
        });
      }
    });
  }
);