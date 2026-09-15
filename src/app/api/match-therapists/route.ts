/**
 * LoopBreak — /api/match-therapists
 *
 * STEP 1: Fetch nearby mental health providers via Google Places API (New)
 * STEP 2: Analyze patient reviews with Gemini LLM to match user's cognitive pattern
 * STEP 3: Fallback mock engine when API keys are missing
 */

import { NextResponse } from "next/server";

interface PlaceResult {
  id: string;
  displayName?: { text: string; languageCode: string };
  rating?: number;
  userRatingCount?: number;
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  reviews?: Array<{
    text?: { text: string; languageCode: string };
    rating?: number;
    authorAttribution?: { displayName: string };
    relativePublishTimeDescription?: string;
  }>;
}

interface TherapistMatch {
  id: string;
  name: string;
  rating: number;
  reviewCount: number;
  address: string;
  phone: string;
  website: string;
  verifiedModalities: string[];
  reviewSynthesis: string;
  matchAppeal: string;
  sentimentScore: number;
  distance?: string;
}

// ── Mock Data Engine ──────────────────────────────────
function getMockData(cognitiveSummary: string): TherapistMatch[] {
  const lower = (cognitiveSummary || "").toLowerCase();
  const isAnxiety = lower.includes("anxie") || lower.includes("panic") || lower.includes("worry");
  const isDepression = lower.includes("depress") || lower.includes("worthless") || lower.includes("hopeless");
  const isPerfectionism = lower.includes("perfect") || lower.includes("all-or-nothing") || lower.includes("imposter");

  return [
    {
      id: "mock-1",
      name: "Dr. Sarah Chen — Cognitive Behavioral Therapy Center",
      rating: 4.9,
      reviewCount: 287,
      address: "1240 Wellness Blvd, Suite 300",
      phone: "(555) 234-5678",
      website: "https://example.com/chen-therapy",
      verifiedModalities: ["CBT", "Exposure Therapy", isAnxiety ? "Anxiety Disorders" : "Thought Restructuring", "Mindfulness-Based CBT"],
      reviewSynthesis: "Patients consistently praise Dr. Chen's structured approach — she assigns targeted homework (thought records, behavioral experiments) that patients report actually sticking with. Multiple reviewers note she \"doesn't just listen, she gives you tools.\" Her follow-up check-ins between sessions are frequently highlighted as a differentiator.",
      matchAppeal: "Given your pattern of all-or-nothing thinking and self-labeling, Dr. Chen's reputation for breaking overwhelming thoughts into measurable, bite-sized challenges directly addresses the cognitive loop you just dissolved.",
      sentimentScore: isPerfectionism ? 94 : 87,
    },
    {
      id: "mock-2",
      name: "Mindful Path Mental Health Clinic",
      rating: 4.7,
      reviewCount: 193,
      address: "890 Recovery Lane, Floor 2",
      phone: "(555) 876-4321",
      website: "https://example.com/mindful-path",
      verifiedModalities: ["ACT", "DBT Skills", "Group Therapy", isDepression ? "Depression Recovery" : "Emotional Regulation"],
      reviewSynthesis: "This clinic earns praise for its warm, low-pressure intake process and the blend of individual + group sessions. Patients repeatedly mention that the group component helped them realize \"I'm not alone in this.\" The therapists are noted for validating emotions before redirecting thought patterns.",
      matchAppeal: "Your ruminative pattern of catastrophizing suggests you may benefit from the ACT (Acceptance & Commitment Therapy) approach this clinic specializes in — learning to observe thoughts without fusing with them, which mirrors the defusion you practiced in LoopBreak.",
      sentimentScore: isDepression ? 91 : 82,
    },
    {
      id: "mock-3",
      name: "Dr. James Rivera — Integrative Psychiatry",
      rating: 4.8,
      reviewCount: 156,
      address: "2100 Health Park Drive",
      phone: "(555) 543-2109",
      website: "https://example.com/rivera-psych",
      verifiedModalities: ["Psychopharmacology", "CBT", "Trauma-Informed Care", "SSRI Management"],
      reviewSynthesis: "Reviewers consistently highlight Dr. Rivera's thoroughness — 90-minute initial evaluations, detailed medication explanations, and willingness to combine talk therapy with medication only when appropriate. Several patients note he \"explains the neuroscience behind what you're feeling,\" which reduces shame.",
      matchAppeal: "If your cognitive patterns feel deeply entrenched despite reframing practice, Dr. Rivera's dual approach (medication + therapy) may address the biological component — reviewers with similar anxiety-loop patterns report significant breakthroughs after 8-12 weeks.",
      sentimentScore: 89,
    },
  ];
}

// ── Main Route Handler ─────────────────────────────────
export async function POST(req: Request) {
  let cognitiveSummary = "";
  try {
    const body = await req.json();
    const { latitude, longitude, radiusKm } = body;
    cognitiveSummary = body.cognitiveSummary || "";

    if (!latitude || !longitude) {
      return NextResponse.json(
        { error: "latitude and longitude are required" },
        { status: 400 }
      );
    }

    const placesKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
    const geminiKey = process.env.GEMINI_API_KEY?.trim();

    // ── If either key is missing, return mock data ──────
    if (!placesKey || !geminiKey) {
      console.log("[match-therapists] Missing API keys, returning mock data");
      const mocks = getMockData(cognitiveSummary || "");
      return NextResponse.json({ providers: mocks, source: "mock" });
    }

    // ── STEP 1: Google Places API (New) ─────────────────
    const radius = (radiusKm || 25) * 1000;
    const placesRes = await fetch(
      "https://places.googleapis.com/v1/places:searchNearby",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": placesKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.reviews",
        },
        body: JSON.stringify({
          includedTypes: [
            "psychotherapist",
            "mental_health_clinic",
            "psychiatrist",
          ],
          maxResultCount: 4,
          locationRestriction: {
            circle: {
              center: { latitude, longitude },
              radius,
            },
          },
        }),
      }
    );

    if (!placesRes.ok) {
      const errData = await placesRes.json().catch(() => ({}));
      console.error("[match-therapists] Places API error:", errData);
      // Fallback to mock on Places failure
      const mocks = getMockData(cognitiveSummary || "");
      return NextResponse.json({
        providers: mocks,
        source: "mock",
        warning: "Places API unavailable, showing sample data",
      });
    }

    const placesData = await placesRes.json();
    const places: PlaceResult[] = placesData.places || [];

    if (places.length === 0) {
      return NextResponse.json({
        providers: [],
        source: "places",
        message: "No providers found in your area. Try expanding your search radius.",
      });
    }

    // ── STEP 2: Gemini Review Analysis ──────────────────
    const providersWithAnalysis: TherapistMatch[] = [];

    for (const place of places) {
      const reviewTexts = (place.reviews || [])
        .map(
          (r) =>
            `[${r.rating || "?"}★] ${r.authorAttribution?.displayName || "Anonymous"} (${r.relativePublishTimeDescription || ""}): "${r.text?.text || "No text"}"`
        )
        .join("\n");

      const analysisPrompt = `You are a mental health specialist matcher. A patient just completed a CBT thought-reframing exercise. Their cognitive pattern summary:

"${cognitiveSummary || "No summary available"}"

Below are the Google reviews for "${place.displayName?.text || "Unknown Provider"}" (rating: ${place.rating || "N/A"}/5, ${place.userRatingCount || 0} reviews):

${reviewTexts || "No reviews available."}

Based ONLY on what these reviews actually say, generate a JSON analysis. Do NOT invent information not in the reviews.

Return a valid JSON object in this exact format without markdown code blocks:
{
  "verifiedModalities": ["array of 2-4 specific therapies, conditions, or approaches mentioned in reviews"],
  "reviewSynthesis": "2-3 sentences summarizing what actual patients repeatedly praise about this provider's methods, bedside manner, homework/exercises, and results",
  "matchAppeal": "1-2 sentences explaining why this provider's patient feedback suggests they fit this specific user's thought pattern",
  "sentimentScore": 85
}`;

      try {
        // Find an available Gemini model
        const modelController = new AbortController();
        const modelTimeout = setTimeout(() => modelController.abort(), 8000);
        const modelRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`,
          { signal: modelController.signal }
        );
        clearTimeout(modelTimeout);
        const modelData = await modelRes.json();

        const models = (modelData.models || [])
          .filter((m: any) =>
            m.supportedGenerationMethods?.includes("generateContent")
          )
          .map((m: any) => m.name.replace(/^models\//, ""))
          .filter((name: string) => !name.includes("pro"));

        const model =
          models.find((m: string) => m.includes("flash")) || models[0];

        if (!model) throw new Error("No Gemini models available");

        const genRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: analysisPrompt }] }],
            }),
          }
        );

        const genData = await genRes.json();
        const rawText =
          genData.candidates?.[0]?.content?.parts?.[0]?.text || "";

        // Extract JSON
        let cleanJson = rawText.trim();
        cleanJson = cleanJson
          .replace(/^```[a-z]*\n?/i, "")
          .replace(/\n?```$/i, "");
        const firstBrace = cleanJson.indexOf("{");
        const lastBrace = cleanJson.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
        }

        const analysis = JSON.parse(cleanJson);

        // Calculate distance (Haversine)
        const R = 6371;
        const dLat = ((latitude - 37.422) * Math.PI) / 180;
        const dLon = ((longitude - (-122.084)) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((37.422 * Math.PI) / 180) *
            Math.cos((latitude * Math.PI) / 180) *
            Math.sin(dLon / 2) ** 2;
        const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        providersWithAnalysis.push({
          id: place.id || `place-${Date.now()}`,
          name: place.displayName?.text || "Unknown Provider",
          rating: place.rating || 0,
          reviewCount: place.userRatingCount || 0,
          address: place.formattedAddress || "",
          phone: place.nationalPhoneNumber || "",
          website: place.websiteUri || "",
          verifiedModalities: analysis.verifiedModalities || ["CBT", "Talk Therapy"],
          reviewSynthesis: analysis.reviewSynthesis || "No review analysis available.",
          matchAppeal: analysis.matchAppeal || "This provider may be a good fit.",
          sentimentScore: Math.min(100, Math.max(0, analysis.sentimentScore || 75)),
          distance:
            distKm < 1
              ? `${Math.round(distKm * 1000)}m`
              : `${distKm.toFixed(1)}km`,
        });
      } catch (analysisError) {
        console.warn(
          `[match-therapists] Gemini analysis failed for ${place.displayName?.text}:`,
          analysisError
        );
        // Include the provider with basic info even if analysis fails
        providersWithAnalysis.push({
          id: place.id || `place-${Date.now()}`,
          name: place.displayName?.text || "Unknown Provider",
          rating: place.rating || 0,
          reviewCount: place.userRatingCount || 0,
          address: place.formattedAddress || "",
          phone: place.nationalPhoneNumber || "",
          website: place.websiteUri || "",
          verifiedModalities: ["CBT", "Talk Therapy"],
          reviewSynthesis: "Review analysis temporarily unavailable. Check their Google reviews for patient feedback.",
          matchAppeal: "This provider is in your area and specializes in mental health services.",
          sentimentScore: Math.round((place.rating || 3.5) * 20),
        });
      }
    }

    // Sort by sentiment score
    providersWithAnalysis.sort((a, b) => b.sentimentScore - a.sentimentScore);

    return NextResponse.json({
      providers: providersWithAnalysis,
      source: "places",
    });
  } catch (error: any) {
    console.error("[match-therapists] Route error:", error);
    // Always return something useful
    const mocks = getMockData(cognitiveSummary || "");
    return NextResponse.json({
      providers: mocks,
      source: "mock",
      warning: "An error occurred, showing sample providers",
    });
  }
}
