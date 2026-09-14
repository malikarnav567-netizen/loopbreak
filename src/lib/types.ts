/**
 * LoopBreak — Core Type Definitions
 *
 * Defines all shared types for the streaming pipeline,
 * cognitive graph, and analysis results.
 */

// ── Streaming Pipeline Types ─────────────────

export type StreamStage =
  | "detecting_distortions"
  | "generating_socratic"
  | "core_fallacy"
  | "generating_graph"
  | "complete"
  | "error";

export interface StreamDistortion {
  type: string;
  confidence: number;
  explanation?: string;
  span?: string;
}

export interface StreamEvent {
  stage: StreamStage;
  data?: any;
  timestamp: number;
  ttft?: number; // time to first token in ms
}

export interface AnalysisResult {
  distortions: string[];
  coreFallacy: string;
  socraticQuestion: string;
}

// ── Cognitive Graph Types ─────────────────────

export type NodeType = "claim" | "distortion" | "emotion" | "evidence" | "counter";
export type EdgeType = "supports" | "leads_to" | "amplifies" | "contradicts";

export interface CognitiveNode {
  id: string;
  type: NodeType;
  label: string;
  fullText?: string;
  confidence?: number;
  position?: { x: number; y: number };
}

export interface CognitiveEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  strength?: number;
}

export interface CognitiveGraph {
  nodes: CognitiveNode[];
  edges: CognitiveEdge[];
  originalThought: string;
}

// ── Extended Analysis Result ──────────────────

export interface FullAnalysisResult {
  distortions: string[];
  coreFallacy: string;
  socraticQuestion: string;
  graph?: CognitiveGraph;
}
