/**
 * LoopBreak — Streaming Analysis API Route
 *
 * Streams cognitive analysis results via Server-Sent Events (SSE).
 * Uses Gemini's streaming endpoint to progressively detect distortions,
 * generate Socratic challenges, and build the cognitive graph.
 *
 * Falls back to mock data if Gemini is unavailable.
 */

import { NextRequest } from "next/server";

// ── Helper: Create SSE stream ────────────────

function sseWriter(controller: ReadableStreamDefaultController) {
  const encoder = new TextEncoder();

  return {
    send(event: string, data: any) {
      const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      try {
        controller.enqueue(encoder.encode(payload));
      } catch {
        // Stream closed
      }
    },
    close() {
      try {
        controller.close();
      } catch {
        // Already closed
      }
    },
  };
}

// ── Helper: Fetch available Gemini models ────

async function getBestModel(apiKey: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    const listData = await listRes.json();

    if (!listRes.ok) throw new Error("Failed to fetch models");

    const validFlashModels = (listData.models || [])
      .filter((m: any) =>
        m.supportedGenerationMethods?.includes("generateContent")
      )
      .map((m: any) => m.name.replace(/^models\//, ""))
      .filter((name: string) => !name.includes("pro"));

    if (validFlashModels.length === 0) throw new Error("No models found");

    return (
      validFlashModels.find((m: string) => m.includes("3.5-flash")) ||
      validFlashModels.find((m: string) => m.includes("flash")) ||
      validFlashModels[0]
    );
  } catch {
    clearTimeout(timeout);
    return "gemini-2.0-flash"; // fallback
  }
}

// ── Helper: Call Gemini streaming ────────────

async function streamGemini(
  apiKey: string,
  model: string,
  prompt: string,
  onChunk: (text: string) => void
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            topP: 0.95,
          },
        }),
      }
    );

    if (!res.ok || !res.body) return false;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const text =
              parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
            if (text) onChunk(text);
          } catch {
            // Skip malformed chunks
          }
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

// ── Mock fallback data ───────────────────────

function getMockAnalysis(thought: string) {
  const lower = thought.toLowerCase();
  const distortions: string[] = [];

  if (lower.includes("everyone") || lower.includes("nobody") || lower.includes("always") || lower.includes("never"))
    distortions.push("Overgeneralization");
  if (lower.includes("think") && (lower.includes("they") || lower.includes("he") || lower.includes("she") || lower.includes("everyone")))
    distortions.push("Mind Reading");
  if (lower.includes("fail") || lower.includes("fired") || lower.includes("ruined") || lower.includes("worst"))
    distortions.push("Catastrophizing");
  if (lower.includes("useless") || lower.includes("worthless") || lower.includes("stupid"))
    distortions.push("Labeling");
  if (lower.includes("perfect") || lower.includes("all or nothing"))
    distortions.push("All-or-Nothing Thinking");
  if (lower.includes("feel like") || lower.includes("i feel"))
    distortions.push("Emotional Reasoning");

  if (distortions.length === 0) distortions.push("Mind Reading", "Catastrophizing");

  return {
    distortions,
    coreFallacy: `This thought reflects ${distortions[0].toLowerCase()}, where you make assumptions without objective evidence.`,
    socraticQuestion: `What concrete evidence do you have that contradicts this worst-case scenario? Can you recall a time when a similar situation turned out differently?`,
    graph: {
      nodes: [
        { id: "claim-1", type: "claim", label: thought.slice(0, 60), fullText: thought, confidence: 0.9 },
        ...distortions.map((d, i) => ({
          id: `dist-${i}`,
          type: "distortion",
          label: d,
          confidence: 0.7 + Math.random() * 0.3,
        })),
        { id: "emotion-1", type: "emotion", label: "Anxiety", confidence: 0.85 },
        { id: "counter-1", type: "counter", label: "Balanced perspective needed", confidence: 0.5 },
      ],
      edges: [
        ...distortions.map((_, i) => ({
          id: `e-d-${i}`,
          source: "claim-1",
          target: `dist-${i}`,
          type: "leads_to" as const,
          strength: 0.8,
        })),
        { id: "e-em", source: "claim-1", target: "emotion-1", type: "amplifies" as const, strength: 0.9 },
        { id: "e-ct", source: "claim-1", target: "counter-1", type: "contradicts" as const, strength: 0.6 },
      ],
      originalThought: thought,
    },
  };
}

// ── POST handler ─────────────────────────────

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  let firstTokenTime = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const sse = sseWriter(controller);

      try {
        const body = await req.json();
        const thought = body.thought || body.text;

        if (!thought?.trim()) {
          sse.send("error", { message: "Thought is required" });
          sse.close();
          return;
        }

        const apiKey = process.env.GEMINI_API_KEY?.trim();

        // If no API key, go straight to mock
        if (!apiKey) {
          sse.send("stage", { name: "detecting_distortions", message: "Analyzing thought patterns..." });
          await delay(600);

          const mock = getMockAnalysis(thought);

          // Emit distortions one by one
          for (const d of mock.distortions) {
            sse.send("distortion", { type: d, confidence: 0.7 + Math.random() * 0.3 });
            await delay(300);
          }

          sse.send("stage", { name: "generating_socratic", message: "Crafting Socratic challenge..." });
          await delay(400);

          // Typewriter the socratic question
          const socratic = mock.socraticQuestion;
          for (let i = 0; i < socratic.length; i += 3) {
            sse.send("socratic_token", { token: socratic.slice(0, i + 3) });
            await delay(15);
          }

          sse.send("stage", { name: "core_fallacy", message: "Identifying core fallacy..." });
          await delay(300);
          sse.send("fallacy", { text: mock.coreFallacy });

          sse.send("stage", { name: "generating_graph", message: "Building cognitive map..." });
          await delay(500);
          sse.send("graph", mock.graph);

          sse.send("complete", {
            distortions: mock.distortions,
            coreFallacy: mock.coreFallacy,
            socraticQuestion: mock.socraticQuestion,
            graph: mock.graph,
            timing: { total: Date.now() - startTime },
          });
          sse.close();
          return;
        }

        // ── Gemini streaming path ──

        const model = await getBestModel(apiKey);

        // Stage 1: Detect distortions
        sse.send("stage", { name: "detecting_distortions", message: "Extracting cognitive distortions..." });

        const analysisPrompt = `You are a CBT assistant. Analyze this thought: "${thought}"

Return a JSON object ONLY (no markdown, no code blocks):
{
  "distortions": [{"type": "Distortion Name", "confidence": 0.85, "explanation": "brief explanation"}],
  "coreFallacy": "One sentence explaining the core thinking error.",
  "socraticQuestion": "A constructive Socratic question to challenge this thought."
}`;

        let analysisText = "";
        const streamOk = await streamGemini(apiKey, model, analysisPrompt, (chunk) => {
          if (!firstTokenTime) {
            firstTokenTime = Date.now() - startTime;
            sse.send("ttft", { ms: firstTokenTime });
          }
          analysisText += chunk;
        });

        if (!streamOk || !analysisText.trim()) {
          // Fallback to mock
          const mock = getMockAnalysis(thought);
          for (const d of mock.distortions) {
            sse.send("distortion", { type: d, confidence: 0.7 + Math.random() * 0.3 });
            await delay(200);
          }
          sse.send("socratic_token", { token: mock.socraticQuestion });
          sse.send("fallacy", { text: mock.coreFallacy });
          sse.send("graph", mock.graph);
          sse.send("complete", {
            distortions: mock.distortions,
            coreFallacy: mock.coreFallacy,
            socraticQuestion: mock.socraticQuestion,
            graph: mock.graph,
            timing: { total: Date.now() - startTime },
          });
          sse.close();
          return;
        }

        // Parse the streamed result
        let cleanJson = analysisText.replace(/```[a-z]*\n?/gi, "").replace(/\n?```$/gi, "");
        const firstBrace = cleanJson.indexOf("{");
        const lastBrace = cleanJson.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
        }

        let analysis: any;
        try {
          analysis = JSON.parse(cleanJson);
        } catch {
          // If JSON parse fails, emit what we can from the raw text
          sse.send("distortion", { type: "Unknown", confidence: 0.5 });
          sse.send("socratic_token", { token: "What evidence contradicts this thought?" });
          sse.send("fallacy", { text: "Unable to parse structured analysis." });
          sse.send("complete", {
            distortions: ["Unknown"],
            coreFallacy: "Analysis could not be fully structured.",
            socraticQuestion: "What evidence contradicts this thought?",
            timing: { total: Date.now() - startTime },
          });
          sse.close();
          return;
        }

        // Emit distortions one by one for progressive rendering
        const distortions = analysis.distortions || [];
        for (const d of distortions) {
          const distObj = typeof d === "string"
            ? { type: d, confidence: 0.75 }
            : d;
          sse.send("distortion", distObj);
          await delay(150);
        }

        // Stage 2: Socratic challenge (typewriter)
        sse.send("stage", { name: "generating_socratic", message: "Crafting Socratic challenge..." });
        await delay(200);

        const socratic = analysis.socraticQuestion || "";
        for (let i = 0; i < socratic.length; i += 3) {
          sse.send("socratic_token", { token: socratic.slice(0, i + 3) });
          await delay(12);
        }

        // Stage 3: Core fallacy
        sse.send("stage", { name: "core_fallacy", message: "Identifying core fallacy..." });
        await delay(200);
        sse.send("fallacy", { text: analysis.coreFallacy || "" });

        // Stage 4: Generate cognitive graph
        sse.send("stage", { name: "generating_graph", message: "Building cognitive map..." });

        const graphPrompt = `Given this analyzed thought and its distortions, create a cognitive graph.

Original thought: "${thought}"
Distortions: ${JSON.stringify(distortions.map((d: any) => d.type || d))}
Core fallacy: "${analysis.coreFallacy}"

Return a JSON object ONLY (no markdown):
{
  "nodes": [
    {"id": "claim-1", "type": "claim", "label": "short label", "fullText": "full text"},
    {"id": "dist-1", "type": "distortion", "label": "distortion name", "confidence": 0.8},
    {"id": "emotion-1", "type": "emotion", "label": "emotion name", "confidence": 0.7},
    {"id": "evidence-1", "type": "evidence", "label": "evidence text"},
    {"id": "counter-1", "type": "counter", "label": "counter thought"}
  ],
  "edges": [
    {"id": "e1", "source": "claim-1", "target": "dist-1", "type": "leads_to", "strength": 0.8}
  ]
}

Edge types: supports, leads_to, amplifies, contradicts.
Include 8-15 nodes and enough edges to show rumination loops.`;

        let graphText = "";
        const graphOk = await streamGemini(apiKey, model, graphPrompt, (chunk) => {
          graphText += chunk;
        });

        let graph = null;
        if (graphOk) {
          let graphJson = graphText.replace(/```[a-z]*\n?/gi, "").replace(/\n?```$/gi, "");
          const gFirst = graphJson.indexOf("{");
          const gLast = graphJson.lastIndexOf("}");
          if (gFirst !== -1 && gLast > gFirst) {
            graphJson = graphJson.substring(gFirst, gLast + 1);
          }
          try {
            graph = JSON.parse(graphJson);
          } catch {
            // Graph generation failed, use mock graph
            graph = getMockAnalysis(thought).graph;
          }
        } else {
          graph = getMockAnalysis(thought).graph;
        }

        sse.send("graph", graph);

        // Complete
        const distortionTypes = distortions.map((d: any) =>
          typeof d === "string" ? d : d.type
        );

        sse.send("complete", {
          distortions: distortionTypes,
          coreFallacy: analysis.coreFallacy || "",
          socraticQuestion: analysis.socraticQuestion || "",
          graph,
          timing: {
            ttft: firstTokenTime,
            total: Date.now() - startTime,
          },
        });

        sse.close();
      } catch (err: any) {
        sse.send("error", { message: err.message || "Stream failed" });
        sse.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
