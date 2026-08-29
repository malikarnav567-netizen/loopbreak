import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "API key is missing from .env.local" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { originalThought, reframe, socraticQuestion } = body;

    if (!reframe || !reframe.trim()) {
      return NextResponse.json(
        { error: "Reframe is required" },
        { status: 400 }
      );
    }

    // 1. Fetch available models
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    const listData = await listRes.json();

    if (!listRes.ok) {
      throw new Error(
        listData.error?.message || "Failed to fetch models list."
      );
    }

    // 2. Filter for active Flash models
    const validFlashModels = (listData.models || [])
      .filter((m: any) =>
        m.supportedGenerationMethods?.includes("generateContent")
      )
      .map((m: any) => m.name.replace(/^models\//, ""))
      .filter((name: string) => !name.includes("pro"));

    if (validFlashModels.length === 0) {
      throw new Error("No active Flash models found for this API key.");
    }

    const chosenModel =
      validFlashModels.find((m: string) => m.includes("3.5-flash")) ||
      validFlashModels.find((m: string) => m.includes("3.1-flash")) ||
      validFlashModels.find((m: string) => m.includes("2.5-flash")) ||
      validFlashModels.find((m: string) => m.includes("flash")) ||
      validFlashModels[0];

    // 3. Evaluate the reframe
    const prompt = `
You are a cognitive behavioral therapy (CBT) assistant evaluating a user's attempt to reframe a negative thought.

Original thought: "${originalThought}"
Socratic question asked: "${socraticQuestion}"
User's reframe: "${reframe}"

Evaluate the reframe and return a valid JSON object strictly in this format without markdown code blocks:
{
  "score": <number 1-10>,
  "feedback": "<one to two sentences of constructive feedback on the reframe>",
  "improvedReframe": "<if score < 7, provide a stronger reframe example; if score >= 7, repeat the user's reframe as-is>",
  "readyToMoveOn": <boolean - true if score >= 7, false otherwise>
}

Score guidelines:
- 1-3: The reframe still contains major distortions or is just restating the negative thought
- 4-6: The reframe shows effort but still has some cognitive distortion remaining
- 7-8: Good reframe that challenges the original distortion
- 9-10: Excellent reframe that fully replaces the distortion with a balanced, evidence-based thought
`;

    const generateRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${chosenModel}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    const generateData = await generateRes.json();

    if (!generateRes.ok) {
      throw new Error(
        generateData.error?.message ||
          `Failed to generate content from ${chosenModel}`
      );
    }

    const rawText =
      generateData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleanJson = rawText
      .replace(/^```json\n?/, "")
      .replace(/\n?```$/, "")
      .trim();

    const parsedData = JSON.parse(cleanJson);
    return NextResponse.json(parsedData);
  } catch (error: any) {
    console.error("Reframe API Route Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to evaluate reframe" },
      { status: 500 }
    );
  }
}
