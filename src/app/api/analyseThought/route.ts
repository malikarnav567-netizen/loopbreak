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
    const thought = body.thought || body.text;

    if (!thought || !thought.trim()) {
      return NextResponse.json({ error: "Thought is required" }, { status: 400 });
    }

    // 1. Fetch live available models for this specific API key
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    const listData = await listRes.json();

    if (!listRes.ok) {
      throw new Error(
        listData.error?.message || "Failed to authenticate or fetch models list."
      );
    }

    // 2. Filter out Pro models (paid only) and select active free-tier Flash models
    const validFlashModels = (listData.models || [])
      .filter((m: any) =>
        m.supportedGenerationMethods?.includes("generateContent")
      )
      .map((m: any) => m.name.replace(/^models\//, ""))
      .filter((name: string) => !name.includes("pro"));

    if (validFlashModels.length === 0) {
      throw new Error("No active Flash models found for this API key.");
    }

    // 3. Select the best current generation Flash model
    const chosenModel =
      validFlashModels.find((m: string) => m.includes("3.5-flash")) ||
      validFlashModels.find((m: string) => m.includes("3.1-flash")) ||
      validFlashModels.find((m: string) => m.includes("2.5-flash")) ||
      validFlashModels.find((m: string) => m.includes("flash")) ||
      validFlashModels[0];

    const prompt = `
You are a cognitive behavioral therapy (CBT) assistant. Analyze the following negative or looping thought:
"${thought}"

Return a valid JSON object strictly in this format without markdown code blocks:
{
  "distortions": ["list", "of", "cognitive distortions"],
  "coreFallacy": "One sentence explaining the core thinking fallacy.",
  "socraticQuestion": "A clarifying, constructive Socratic question to challenge this thought."
}
`;

    // 4. Generate content from the verified active Flash model
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
        generateData.error?.message || `Failed to generate content from ${chosenModel}`
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
    console.error("API Route Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to analyze thought" },
      { status: 500 }
    );
  }
}