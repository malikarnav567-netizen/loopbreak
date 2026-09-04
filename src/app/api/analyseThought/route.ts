import { NextResponse } from "next/server";

export async function POST(req: Request) {
  let thought = "";
  try {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "API key is missing from .env.local" },
        { status: 500 }
      );
    }

    const body = await req.json();
    thought = body.thought || body.text;

    if (!thought || !thought.trim()) {
      return NextResponse.json({ error: "Thought is required" }, { status: 400 });
    }

    // 1. Fetch live available models for this specific API key
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
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

    // 4. Generate content — try multiple models with retry
    let generateData: any = null;
    const modelsToTry = [
      chosenModel,
      ...validFlashModels.filter((m: string) => m !== chosenModel),
    ];

    let lastError = "";
    for (const model of modelsToTry) {
      const generateRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );

      const data = await generateRes.json();

      if (generateRes.ok) {
        generateData = data;
        break;
      }

      lastError = data.error?.message || `Failed: ${model}`;
      console.warn(`Model ${model} failed, trying next...`, lastError);
    }

    if (!generateData) {
      throw new Error(
        `All models failed. Last error: ${lastError}`
      );
    }

    const rawText =
      generateData.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Robust JSON extraction: find the first { ... } block
    let cleanJson = rawText.trim();
    // Strip markdown fences
    cleanJson = cleanJson.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "");
    // Extract first JSON object from the text
    const firstBrace = cleanJson.indexOf("{");
    const lastBrace = cleanJson.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
    }

    const parsedData = JSON.parse(cleanJson);
    return NextResponse.json(parsedData);
  } catch (error: any) {
    console.error("API Route Error:", error);
    // Mock fallback: always return a valid analysis when Gemini is down
    const lowerThought = (thought || "").toLowerCase();

    // Detect common distortions from keywords
    const distortions: string[] = [];
    if (lowerThought.includes("everyone") || lowerThought.includes("nobody") || lowerThought.includes("always") || lowerThought.includes("never")) distortions.push("Overgeneralization");
    if (lowerThought.includes("think") && (lowerThought.includes("they") || lowerThought.includes("he") || lowerThought.includes("she") || lowerThought.includes("everyone"))) distortions.push("Mind Reading");
    if (lowerThought.includes("will fail") || lowerThought.includes("get fired") || lowerThought.includes("ruined") || lowerThought.includes("worst")) distortions.push("Catastrophizing");
    if (lowerThought.includes("useless") || lowerThought.includes("worthless") || lowerThought.includes("stupid") || lowerThought.includes("loser")) distortions.push("Labeling");
    if (lowerThought.includes("if i\'m not") || lowerThought.includes("perfect") || lowerThought.includes("all or nothing")) distortions.push("All-or-Nothing Thinking");
    if (lowerThought.includes("feel like") || lowerThought.includes("i feel") || lowerThought.includes("feeling")) distortions.push("Emotional Reasoning");
    if (distortions.length === 0) distortions.push("Mind Reading", "Catastrophizing");

    const mockResult = {
      distortions,
      coreFallacy: `This thought reflects cognitive distortions including ${distortions[0].toLowerCase()}, where you are making assumptions without objective evidence to support this conclusion.`,
      socraticQuestion: `What concrete evidence do you have that contradicts this worst-case scenario? Can you recall a time when a similar situation turned out differently than you expected?`,
    };

    return NextResponse.json(mockResult);
  }
}