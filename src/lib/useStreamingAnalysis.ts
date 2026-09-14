/**
 * LoopBreak — useStreamingAnalysis Hook
 *
 * Consumes the SSE streaming analysis endpoint and returns
 * progressive state updates for distortion detection, Socratic
 * typewriter effect, core fallacy, and cognitive graph.
 *
 * Falls back to the non-streaming API if SSE fails.
 */

"use client";

import { useState, useCallback, useRef } from "react";
import type {
  StreamDistortion,
  CognitiveGraph,
  AnalysisResult,
} from "./types";

export interface StreamingState {
  stage: string;
  stageMessage: string;
  distortions: StreamDistortion[];
  socraticText: string;
  coreFallacy: string;
  graph: CognitiveGraph | null;
  complete: boolean;
  error: string;
  ttft: number | null;
  totalTime: number | null;
}

const INITIAL_STATE: StreamingState = {
  stage: "",
  stageMessage: "",
  distortions: [],
  socraticText: "",
  coreFallacy: "",
  graph: null,
  complete: false,
  error: "",
  ttft: null,
  totalTime: null,
};

export function useStreamingAnalysis() {
  const [state, setState] = useState<StreamingState>(INITIAL_STATE);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const analyze = useCallback(async (thought: string): Promise<AnalysisResult | null> => {
    // Cancel any existing request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState(INITIAL_STATE);
    setLoading(true);

    try {
      const res = await fetch("/api/streamAnalysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thought }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let result: AnalysisResult | null = null;
      let lastEventName = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            lastEventName = line.slice(7).trim();
            continue;
          }

          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6).trim();
            try {
              const payload = JSON.parse(jsonStr);
              handleEvent(lastEventName, payload);
            } catch {
              // Skip malformed
            }
            lastEventName = ""; // Reset after use
          }
        }

        // Check if we got a "complete" event
        setState((prev) => {
          if (prev.complete) {
            result = {
              distortions: prev.distortions.map((d) => d.type),
              coreFallacy: prev.coreFallacy,
              socraticQuestion: prev.socraticText,
            };
          }
          return prev;
        });
        if (result) break;
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        const bufLines = buffer.split("\n");
        for (const line of bufLines) {
          if (line.startsWith("data: ")) {
            try {
              const payload = JSON.parse(line.slice(6).trim());
              handleEvent(lastEventName, payload);
              lastEventName = "";
            } catch {}
          }
        }
      }

      // Build final result from accumulated state
      if (!result) {
        setState((prev) => {
          result = {
            distortions: prev.distortions.map((d) => d.type),
            coreFallacy: prev.coreFallacy,
            socraticQuestion: prev.socraticText,
          };
          return prev;
        });
        await new Promise((r) => setTimeout(r, 10));
      }

      return result || {
        distortions: [],
        coreFallacy: "",
        socraticQuestion: "",
      };
    } catch (err: any) {
      if (err.name === "AbortError") {
        return null;
      }
      setState((prev) => ({ ...prev, error: err.message }));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  function handleEvent(eventName: string, payload: any) {
    // Use the SSE event name (from the event: line) as the primary dispatch key.
    // For complete events, the event name is "complete" and payload has all fields.
    const key = eventName || payload.stage || payload.type || "";

    switch (key) {
      case "stage":
        setState((prev) => ({
          ...prev,
          stage: payload.name || payload.stage || "",
          stageMessage: payload.message || "",
        }));
        break;

      case "detecting_distortions":
      case "generating_socratic":
      case "core_fallacy":
      case "generating_graph":
        setState((prev) => ({
          ...prev,
          stage: key,
          stageMessage: payload.message || "",
        }));
        break;

      case "distortion":
        setState((prev) => ({
          ...prev,
          distortions: [...prev.distortions, {
            type: payload.type || payload.distortion || "Unknown",
            confidence: payload.confidence || 0.7,
            explanation: payload.explanation,
          }],
        }));
        break;

      case "socratic_token":
        setState((prev) => ({
          ...prev,
          socraticText: payload.token || "",
        }));
        break;

      case "fallacy":
        setState((prev) => ({
          ...prev,
          coreFallacy: payload.text || "",
        }));
        break;

      case "graph":
        setState((prev) => ({
          ...prev,
          graph: payload,
        }));
        break;

      case "ttft":
        setState((prev) => ({
          ...prev,
          ttft: payload.ms || null,
        }));
        break;

      case "complete":
        setState((prev) => ({
          ...prev,
          complete: true,
          totalTime: payload.timing?.total || null,
          distortions: payload.distortions
            ? payload.distortions.map((d: any) =>
                typeof d === "string"
                  ? { type: d, confidence: 0.75 }
                  : d
              )
            : prev.distortions,
          coreFallacy: payload.coreFallacy || prev.coreFallacy,
          socraticText: payload.socraticQuestion || prev.socraticText,
          graph: payload.graph || prev.graph,
        }));
        break;

      case "error":
        setState((prev) => ({
          ...prev,
          error: payload.message || "Stream failed",
        }));
        break;

      default:
        // Fallback: try to detect by payload shape
        if (payload.name) {
          setState((prev) => ({
            ...prev,
            stage: payload.name,
            stageMessage: payload.message || "",
          }));
        }
    }
  }

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL_STATE);
    setLoading(false);
  }, []);

  return { state, loading, analyze, cancel, reset };
}
