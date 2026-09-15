"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  MicOff,
  ArrowRight,
  CheckCircle2,
  RotateCcw,
  Volume2,
  VolumeX,
  Network,
  Eye,
  EyeOff,
  Zap,
  Brain,
  Flame,
  AlertTriangle,
} from "lucide-react";
import dynamic from "next/dynamic";
import StreamingProgress from "@/components/StreamingProgress";
import CognitiveGraphView from "@/components/CognitiveGraph";
import PhysicsShatter from "@/components/PhysicsShatter";
import SpecialistFinder from "@/components/SpecialistFinder";
import { useStreamingAnalysis } from "@/lib/useStreamingAnalysis";
import type { CognitiveGraph } from "@/lib/types";
import {
  startTensionHum,
  updateTensionHum,
  stopTensionHum,
  playCrack,
  playDissolutionChime,
  setMuted,
  initAudio,
} from "@/lib/audioEngine";

// Dynamic import for Three.js (no SSR)
const ThoughtScene = dynamic(() => import("@/components/ThoughtScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-black">
      <div className="h-8 w-8 animate-spin border-4 border-[var(--color-yellow)] border-t-transparent" />
    </div>
  ),
});

// ── App States ─────────────────────────────────
type AppState = "ingestion" | "distortion" | "shattering" | "dissolution";

// ── Preset thoughts ────────────────────────────
const PRESET_THOUGHTS = [
  { text: "Everyone thinks I failed the presentation and I will get fired", arrow: "→" },
  { text: "If I'm not perfect, I am worthless", arrow: "→" },
  { text: "I'll never recover from this mistake", arrow: "→" },
  { text: "My team is secretly disappointed in me", arrow: "→" },
];

// ── Progress thresholds for crack sounds ───────
const CRACK_MILESTONES = new Set([0.25, 0.5, 0.75]);

// ── Distortion badge colors ────────────────────
const DISTORTION_COLORS: Record<string, string> = {
  Catastrophizing: "#8B4049",
  "Mind Reading": "#FFDE4D",
  "All-or-Nothing Thinking": "#8B4049",
  Overgeneralization: "#FFDE4D",
  "Emotional Reasoning": "#F59E0B",
  Labeling: "#FFDE4D",
  "Should Statements": "#8B4049",
  Personalization: "#F59E0B",
  "Mental Filter": "#FFDE4D",
  "Jumping to Conclusions": "#8B4049",
};

export default function Home() {
  // ── State ────────────────────────────────────
  const [appState, setAppState] = useState<AppState>("ingestion");
  const [thought, setThought] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [result, setResult] = useState<any>(null);

  // Streaming state
  const streaming = useStreamingAnalysis();

  const [reframe, setReframe] = useState("");
  const [reframeLoading, setReframeLoading] = useState(false);
  const [reframeResult, setReframeResult] = useState<any>(null);
  const [reframeError, setReframeError] = useState("");
  const [reframeHistory, setReframeHistory] = useState<
    { reframe: string; evaluation: any }[]
  >([]);

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archive, setArchive] = useState<any[]>([]);
  const [shatterTrigger, setShatterTrigger] = useState(0);
  const [micActive, setMicActive] = useState(false);
  const recognitionRef = useRef<any>(null);

  // ── Speech Recognition ──────────────────────────────
  const toggleSpeechRecognition = useCallback(() => {
    if (micActive) {
      // Stop listening
      recognitionRef.current?.stop();
      setMicActive(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setAnalysisError("Speech recognition is not supported in this browser. Try Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let finalTranscript = thought; // preserve existing text

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += (finalTranscript ? " " : "") + transcript;
        } else {
          interim = transcript;
        }
      }
      setThought(finalTranscript + (interim ? " " + interim : ""));
    };

    recognition.onerror = (event: any) => {
      console.warn("Speech recognition error:", event.error);
      setMicActive(false);
      if (event.error === "not-allowed") {
        setAnalysisError("Microphone permission denied. Please allow microphone access and try again.");
      }
    };

    recognition.onend = () => {
      setMicActive(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setMicActive(true);
    setAnalysisError("");
  }, [micActive, thought]);
  const [muted, setMutedState] = useState(false);
  const [tension, setTension] = useState(0);
  const [showCanvasText, setShowCanvasText] = useState(true);

  // Feature additions
  const [cognitiveGraph, setCognitiveGraph] = useState<CognitiveGraph | null>(null);
  const [showGraph, setShowGraph] = useState(true);
  const [graphCollapsed, setGraphCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  const prevMilestones = useRef<Set<number>>(new Set());

  // ── Mount detection for animation safety ────
  useEffect(() => { setMounted(true); }, []);

  // Whether the 3D canvas should be visible
  const canvasVisible = appState === "distortion" || appState === "dissolution" || appState === "shattering";

  // ── Audio progress tracking ──────────────────
  const updateAudioProgress = useCallback((progress: number) => {
    updateTensionHum(progress);
    CRACK_MILESTONES.forEach((m) => {
      if (progress >= m && !prevMilestones.current.has(m)) {
        prevMilestones.current.add(m);
        playCrack();
      }
    });
  }, []);

  // ── Streaming analysis ───────────────────────
  const handleAnalyze = async () => {
    if (!thought.trim()) return;
    initAudio();
    setAnalyzing(true);
    setAnalysisError("");
    setResult(null);
    setReframeResult(null);
    setReframe("");
    setReframeHistory([]);
    setCognitiveGraph(null);
    prevMilestones.current.clear();

    try {
      const analysisResult = await streaming.analyze(thought);
      if (!analysisResult) {
        setAnalysisError("Analysis was cancelled or failed.");
        return;
      }
      setResult(analysisResult);
      setAppState("distortion");
      setShowCanvasText(true);
      startTensionHum();
      setTimeout(() => {
        setCognitiveGraph(streaming.state.graph);
      }, 500);
    } catch (err: any) {
      setAnalysisError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Track reframe input progress ─────────────
  const handleReframeChange = useCallback(
    (value: string) => {
      setReframe(value);
      if (!value.trim()) {
        setTension(0);
        updateAudioProgress(0);
        return;
      }
      const progress = Math.min(1, value.length / 60);
      setTension(progress);
      updateAudioProgress(progress);
    },
    [updateAudioProgress]
  );

  // ── Submit reframe with physics shatter ──────
  const handleReframe = async () => {
    if (!reframe.trim() || reframeLoading) return;
    setReframeLoading(true);
    setReframeError("");
    setReframeResult(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch("/api/reframeThought", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalThought: thought,
          reframe,
          socraticQuestion: result.socraticQuestion || result.socratic_question,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Evaluation failed");
      setReframeResult(data);
      setReframeHistory((prev) => [...prev, { reframe, evaluation: data }]);

      if (data.readyToMoveOn) {
        stopTensionHum();
        playDissolutionChime();
        setShowCanvasText(false);
        setShatterTrigger((n) => n + 1);
        setAppState("shattering");
      }
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === "AbortError") {
        setReframeError("API timed out — Gemini is under high load. Please try again.");
      } else {
        setReframeError(err.message);
      }
    } finally {
      setReframeLoading(false);
    }
  };

  // ── Physics shatter complete callback ────────
  const handleShatterComplete = useCallback(() => {
    setTimeout(() => {
      setAppState("dissolution");
    }, 2000);
  }, []);

  // ── Save to archive ──────────────────────────
  const saveToArchive = () => {
    const entry: any = {
      id: Date.now().toString(),
      timestamp: "Just now",
      originalThought: thought,
      reframe: reframeResult?.improvedReframe || reframe,
      distortions: result?.distortions || [],
      score: reframeResult?.score || 0,
    };
    setArchive((prev) => [entry, ...prev]);
  };

  // ── Reset ────────────────────────────────────
  const handleReset = () => {
    streaming.reset();
    stopTensionHum();
    setAppState("ingestion");
    setThought("");
    setResult(null);
    setAnalysisError("");
    setReframe("");
    setReframeResult(null);
    setReframeError("");
    setReframeHistory([]);
    setShatterTrigger(0);
    setTension(0);
    setShowCanvasText(true);
    setCognitiveGraph(null);
    prevMilestones.current.clear();
  };

  // ── Mute toggle ──────────────────────────────
  const toggleMute = () => {
    const newMuted = !muted;
    setMutedState(newMuted);
    setMuted(newMuted);
  };

  // ── Graph node deletion ──────────────────────
  const handleGraphNodeDelete = useCallback((nodeId: string) => {
    setCognitiveGraph((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        nodes: prev.nodes.filter((n) => n.id !== nodeId),
        edges: prev.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      };
    });
  }, []);

  // ── Cleanup on unmount ───────────────────────
  useEffect(() => {
    return () => stopTensionHum();
  }, []);

  // ── Render ───────────────────────────────────
  return (
    <div className="min-h-screen bg-[var(--color-bg)]">

      {/* ═══════ HEADER ═══════ */}
      <nav className="sticky top-0 z-50 bg-[var(--color-bg)] border-b-4 border-black">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Brain className="h-6 w-6 text-black" strokeWidth={3} />
              <span
                className="text-xl font-bold tracking-tight text-black uppercase"
                style={{ fontFamily: "var(--font-display)" }}
              >
                LoopBreak
              </span>
              <span
                className="text-[10px] font-semibold tracking-wider text-[var(--color-text-muted)]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                v2.0
              </span>
            </div>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <span className="nb-badge-green text-[10px]">
              Dissolved: {archive.length}
            </span>
            <span className="nb-badge-coral text-[10px]">
              Counter: {archive.reduce((a, e) => a + e.distortions.length, 0)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleMute}
              className="nb-card-sm p-2 hover:bg-[var(--color-yellow)] transition-colors"
              title={muted ? "Unmute" : "Mute"}
            >
              {muted ? (
                <VolumeX className="h-4 w-4 text-black" />
              ) : (
                <Volume2 className="h-4 w-4 text-black" />
              )}
            </button>
            <button
              onClick={() => setArchiveOpen(true)}
              className="btn-ghost text-xs"
            >
              Archive ({archive.length})
            </button>
            <button
              onClick={handleReset}
              className="nb-card-sm p-2 hover:bg-[var(--color-yellow)] transition-colors"
            >
              <RotateCcw className="h-4 w-4 text-black" />
            </button>
          </div>
        </div>
      </nav>

      <main className="relative mx-auto max-w-6xl">
        {/* ═══════ STATE 1: THE VENT ═══════ */}
        <AnimatePresence mode="wait">
          {appState === "ingestion" && (
            <motion.div
              key="ingestion"
              initial={mounted ? { opacity: 0, y: 30 } : false}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.4 }}
              className="px-6 py-12"
            >
              <div className="mx-auto max-w-2xl">
                {/* Title */}
                <div className="mb-10">
                  <motion.h1
                    initial={mounted ? { opacity: 0, y: 20 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="mb-2 text-4xl font-bold tracking-tight text-black uppercase md:text-5xl"
                    style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}
                  >
                    What&apos;s on your mind?
                  </motion.h1>
                  <motion.p
                    initial={mounted ? { opacity: 0 } : false}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="text-[var(--color-text-muted)] text-sm"
                  >
                    Externalize the thought. Watch it dissolve.
                  </motion.p>
                </div>

                {/* Mic Ribbon — full-width thought input bar */}
                <div className="mb-8">
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      initAudio();
                      toggleSpeechRecognition();
                    }}
                    className={`w-full flex items-center gap-4 border-4 border-black px-6 py-5 text-left transition-all duration-150 ${
                      micActive
                        ? "bg-[var(--color-coral)] text-white shadow-[0px_0px_0px_0px_#000] translate-y-[4px]"
                        : "bg-[var(--color-yellow)] text-black shadow-[6px_6px_0px_0px_#000] hover:shadow-[4px_4px_0px_0px_#000] hover:translate-y-[2px]"
                    }`}
                  >
                    {micActive ? (
                      <MicOff className="h-6 w-6 flex-shrink-0" strokeWidth={2.5} />
                    ) : (
                      <Mic className="h-6 w-6 flex-shrink-0" strokeWidth={2.5} />
                    )}
                    <span
                      className="text-sm font-bold uppercase tracking-wider"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {micActive ? "Listening — speak your thought..." : "Tap to speak your thought aloud"}
                    </span>
                    <ArrowRight className="h-4 w-4 flex-shrink-0 ml-auto opacity-50" strokeWidth={3} />
                  </motion.button>
                </div>

                {/* Divider */}
                <div className="mb-6 flex items-center gap-4">
                  <div className="h-1 flex-1 bg-black" />
                  <span
                    className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] font-bold"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    or type your raw thought
                  </span>
                  <div className="h-1 flex-1 bg-black" />
                </div>

                {/* Preset Badges — asymmetric tiles with block arrows */}
                <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {PRESET_THOUGHTS.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => setThought(p.text)}
                      className="nb-preset flex items-start gap-3 text-left"
                    >
                      <span className="text-lg font-bold mt-0.5 flex-shrink-0">→</span>
                      <span className="leading-snug">
                        {p.text.length > 55 ? p.text.slice(0, 52) + "..." : p.text}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Industrial Manifest Card — Thought Input */}
                <div className="mb-6">
                  <textarea
                    value={thought}
                    onChange={(e) => setThought(e.target.value)}
                    placeholder="I completely ruined the demo presentation, my team thinks I'm useless, and we're going to fail."
                    rows={4}
                    className="nb-input"
                  />
                </div>

                {/* Action Button — Chunky Yellow Arcade Button */}
                <div className="flex justify-center">
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={handleAnalyze}
                    disabled={analyzing || !thought.trim()}
                    className="btn-primary flex items-center gap-3 text-base"
                  >
                    {analyzing ? (
                      <>
                        <div className="h-5 w-5 border-3 border-black border-t-transparent animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Flame className="h-5 w-5" strokeWidth={2.5} />
                        Analyze Cognitive Loops
                        <ArrowRight className="h-4 w-4" strokeWidth={3} />
                      </>
                    )}
                  </motion.button>
                </div>

                {/* Streaming progress */}
                <div className="mt-4">
                  <StreamingProgress
                    stage={streaming.state.stage}
                    message={streaming.state.stageMessage}
                    ttft={streaming.state.ttft}
                    complete={streaming.state.complete}
                    error={streaming.state.error}
                  />
                </div>

                {analysisError && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 border-4 border-black bg-[var(--color-coral)] p-4 text-center text-sm text-white font-bold"
                  >
                    ⚠ {analysisError}
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══════ 3D CANVAS — PERSISTENT across distortion + dissolution ═══════ */}
        {canvasVisible && (
          <div
            className="relative mx-auto max-w-6xl border-x-4 border-b-4 border-black bg-black"
            style={{ height: "55vh", minHeight: "380px" }}
          >
            {/* Physics shatter overlay */}
            {appState === "shattering" && shatterTrigger > 0 && (
              <PhysicsShatter
                originalThought={thought}
                counterStatement={reframeResult?.improvedReframe || reframe}
                score={reframeResult?.score}
                trigger={shatterTrigger}
                onComplete={handleShatterComplete}
              />
            )}

            {/* 3D Thought Scene */}
            {(appState === "distortion" || appState === "dissolution") && (
              <ThoughtScene
                thought={thought}
                tension={tension}
                shatterTrigger={0}
                showText={showCanvasText}
              />
            )}

            {/* ═══════ STATE 2: THE CHALLENGE — Distortion Overlays ═══════ */}
            {appState === "distortion" && result && (
              <>
                {/* Distortion badges */}
                <div className="absolute top-4 left-0 right-0 z-20 flex flex-wrap items-center justify-center gap-2 px-6">
                  {(streaming.state.distortions.length > 0
                    ? streaming.state.distortions.map((d) => d.type)
                    : result?.distortions || []
                  ).map((d: string, i: number) => {
                    const c = DISTORTION_COLORS[d] || "#8B4049";
                    return (
                      <motion.span
                        key={`${d}-${i}`}
                        initial={{ opacity: 0, scale: 0.8, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ delay: 0.1 + i * 0.15, type: "spring", damping: 12 }}
                        className="nb-distortion-badge"
                        style={{
                          backgroundColor: c,
                          color: "#000000",
                          borderColor: "#000000",
                        }}
                      >
                        {d}
                      </motion.span>
                    );
                  })}
                </div>

                {/* Socratic question — on the 3D canvas */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 w-[90%] max-w-xl nb-card p-5"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <AlertTriangle className="h-4 w-4 text-[var(--color-coral)]" strokeWidth={2.5} />
                    <p
                      className="text-[10px] uppercase tracking-widest text-[var(--color-coral)] font-bold"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      Core Fallacy
                    </p>
                  </div>
                  <p
                    className="text-sm text-black font-medium leading-relaxed"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {streaming.state.coreFallacy || result?.coreFallacy || result?.core_fallacy}
                  </p>
                </motion.div>
              </>
            )}

            {/* ═══════ STATE 5: THE RELEASE — Dissolution Overlay ═══════ */}
            <AnimatePresence>
              {appState === "dissolution" && (
                <motion.div
                  key="dissolution-overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 1.5 }}
                  className="absolute inset-0 z-10 flex items-center justify-center pointer-events-auto bg-black/80"
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3, type: "spring", damping: 12 }}
                    className="text-center max-w-lg"
                  >
                    {/* Big green checkmark */}
                    <div className="mb-6 flex justify-center">
                      <div className="nb-card bg-[var(--color-green)] p-6">
                        <CheckCircle2 className="h-16 w-16 text-black" strokeWidth={3} />
                      </div>
                    </div>

                    <h2
                      className="mb-3 text-3xl font-bold tracking-tight text-white uppercase"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      Loop Broken
                    </h2>
                    <p className="mb-2 text-lg text-[var(--color-green)] font-bold">
                      Thought Dissolved
                    </p>
                    <p className="text-sm text-white/70 max-w-md mx-auto">
                      You&apos;ve successfully externalized, confronted, and dissolved an intrusive thought pattern.
                    </p>

                    <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                      <motion.button
                        whileTap={{ scale: 0.96 }}
                        onClick={saveToArchive}
                        className="btn-teal flex items-center gap-2"
                      >
                        <CheckCircle2 className="h-4 w-4" strokeWidth={2.5} />
                        Add to Resilience Journal
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.96 }}
                        onClick={handleReset}
                        className="btn-ghost flex items-center gap-2 bg-white"
                      >
                        <RotateCcw className="h-4 w-4" strokeWidth={2.5} />
                        New Session
                      </motion.button>
                    </div>

                    {/* Reframe display */}
                    <div className="mt-6 nb-card bg-white p-5 mx-auto max-w-md">
                      <p
                        className="text-[10px] uppercase tracking-widest text-[var(--color-teal)] mb-2 font-bold"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        Your Reframe
                      </p>
                      <p className="text-lg italic text-black font-semibold">
                        &ldquo;{reframeResult?.improvedReframe || reframe}&rdquo;
                      </p>
                      <div className="mt-3 flex justify-center">
                        <span className="nb-badge-green text-xs">
                          Score: {reframeResult?.score}/10
                        </span>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Specialist Finder — visible after dissolution */}
            {appState === "dissolution" && (
              <div className="relative z-20 bg-[var(--color-bg)] border-t-4 border-black">
                <SpecialistFinder
                  cognitiveSummary={`Original thought: ${thought}. Distortions: ${(result?.distortions || []).join(", ")}. Core fallacy: ${result?.coreFallacy || result?.core_fallacy || ""}. Reframe: ${reframeResult?.improvedReframe || reframe}`}
                />
              </div>
            )}
          </div>
        )}

        {/* ═══════ COGNITIVE GRAPH (distortion state) ═══════ */}
        {appState === "distortion" && (cognitiveGraph || streaming.state.graph) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="relative z-20 mx-auto max-w-6xl px-6 pt-8 pb-4"
          >
            <button
              onClick={() => setGraphCollapsed(!graphCollapsed)}
              className="mb-4 btn-ghost flex items-center gap-2 text-xs"
            >
              {graphCollapsed ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              <Network className="h-3.5 w-3.5" />
              Cognitive Map
              <span className="text-[9px] text-[var(--color-text-muted)]" style={{ fontFamily: "var(--font-mono)" }}>
                — click nodes to inspect, drag to rearrange
              </span>
            </button>

            <AnimatePresence>
              {!graphCollapsed && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <CognitiveGraphView
                    graph={cognitiveGraph || streaming.state.graph}
                    onNodeDelete={handleGraphNodeDelete}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ═══════ STATE 3: THE REFRAME — Reframe Cockpit ═══════ */}
        {appState === "distortion" && result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="relative z-20 border-t-4 border-black bg-[var(--color-bg)]"
          >
            <div className="mx-auto max-w-2xl px-6 py-8">
              {/* Core Fallacy — shown below the graph in the reframe section */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mb-4 nb-card p-4"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <AlertTriangle className="h-4 w-4 text-[var(--color-teal)]" strokeWidth={2.5} />
                  <p
                    className="text-[10px] uppercase tracking-widest text-[var(--color-teal)] font-bold"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    ⚡ Socratic Challenge
                  </p>
                </div>
                <p
                  className="text-sm text-black font-semibold"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {streaming.state.socraticText || result?.socraticQuestion || result?.socratic_question}
                  {!streaming.state.complete && streaming.state.socraticText && (
                    <span className="inline-block w-0.5 h-4 bg-black ml-0.5 animate-pulse align-middle" />
                  )}
                </p>
              </motion.div>

              {/* Reframe input */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] font-bold"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    Your Balanced Counter-Statement
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="nb-progress-track w-24">
                      <div
                        className="nb-progress-fill"
                        style={{ width: `${tension * 100}%` }}
                      />
                    </div>
                    <span
                      className="text-[10px] font-bold text-black"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {Math.round(tension * 100)}%
                    </span>
                  </div>
                </div>
                <textarea
                  value={reframe}
                  onChange={(e) => handleReframeChange(e.target.value)}
                  placeholder="I made one mistake on slide 4, but we nailed the live demo and have 3 working features."
                  rows={3}
                  className="nb-input text-sm"
                />
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-3 mt-4">
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={handleReframe}
                  disabled={reframeLoading || !reframe.trim()}
                  className="btn-primary flex items-center gap-2 text-sm"
                >
                  {reframeLoading ? (
                    <>
                      <div className="h-4 w-4 border-3 border-black border-t-transparent animate-spin" />
                      Evaluating...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" strokeWidth={2.5} />
                      Shatter & Reframe
                    </>
                  )}
                </motion.button>
                <button onClick={handleReset} className="btn-ghost text-xs">
                  Reset
                </button>
              </div>

              {reframeError && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-3 border-4 border-black bg-[var(--color-coral)] p-3 text-center text-sm text-white font-bold"
                >
                  ⚠ {reframeError}
                </motion.div>
              )}

              {/* Reframe Evaluation */}
              <AnimatePresence>
                {reframeResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-4 nb-card p-4 space-y-3"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] font-bold"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        Score
                      </span>
                      <span
                        className={`text-2xl font-bold ${
                          reframeResult.score >= 7
                            ? "text-[var(--color-green-dark)]"
                            : reframeResult.score >= 4
                            ? "text-[var(--color-amber)]"
                            : "text-[var(--color-coral)]"
                        }`}
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {reframeResult.score}/10
                      </span>
                    </div>
                    <p className="text-sm text-black font-medium">
                      {reframeResult.feedback}
                    </p>
                    {reframeResult.score < 7 && reframeResult.improvedReframe && (
                      <div className="border-l-4 border-[var(--color-teal)] bg-[var(--color-teal)]/10 p-3">
                        <p
                          className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-teal)]"
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          Try this reframe:
                        </p>
                        <p className="text-sm text-black italic font-medium">
                          &ldquo;{reframeResult.improvedReframe}&rdquo;
                        </p>
                      </div>
                    )}
                    {reframeResult.readyToMoveOn && (
                      <div className="border-4 border-[var(--color-green-dark)] bg-[var(--color-green)] p-3 text-center">
                        <p className="font-bold text-black flex items-center justify-center gap-2">
                          <CheckCircle2 className="h-5 w-5" strokeWidth={2.5} />
                          Loop Broken — Click Shatter & Reframe
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Reframe history */}
              {reframeHistory.length > 1 && (
                <div className="mt-4">
                  <p
                    className="mb-2 text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] font-bold"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    Previous Attempts
                  </p>
                  <div className="space-y-1">
                    {reframeHistory.slice(0, -1).map((entry, i) => (
                      <div
                        key={i}
                        className="nb-card-sm p-2 opacity-60"
                      >
                        <p className="text-xs italic text-black font-medium">
                          &ldquo;{entry.reframe}&rdquo;
                        </p>
                        <p
                          className="text-[10px] text-[var(--color-text-muted)]"
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          Score: {entry.evaluation.score}/10
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </main>

      {/* ═══════ RESILIENCE DRAWER ═══════ */}
      <AnimatePresence>
        {archiveOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setArchiveOpen(false)}
              className="fixed inset-0 z-50 bg-black/50"
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 z-50 h-full w-full max-w-md border-l-4 border-black bg-[var(--color-bg)]"
            >
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b-4 border-black px-6 py-4 bg-[var(--color-yellow)]">
                  <div className="flex items-center gap-3">
                    <Brain className="h-5 w-5 text-black" strokeWidth={2.5} />
                    <h2
                      className="text-lg font-bold text-black uppercase"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      Resilience Archive
                    </h2>
                  </div>
                  <button
                    onClick={() => setArchiveOpen(false)}
                    className="nb-card-sm p-1.5 bg-white hover:bg-[var(--color-coral)] hover:text-white transition-colors"
                  >
                    <span className="text-lg font-bold">×</span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4">
                  {archive.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-[var(--color-text-muted)] text-sm font-medium">
                        No entries yet. Dissolve your first thought to begin building resilience.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {archive.map((entry: any, i: number) => (
                        <motion.div
                          key={entry.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="nb-card p-4"
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <span
                              className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] font-bold"
                              style={{ fontFamily: "var(--font-mono)" }}
                            >
                              {entry.timestamp}
                            </span>
                            <span className={`nb-badge-green text-[9px] ${entry.score < 7 ? "!bg-[var(--color-yellow)]" : ""}`}>
                              {entry.score}/10
                            </span>
                          </div>
                          <div className="mb-2 space-y-1">
                            <div className="bg-[var(--color-coral)]/10 border-l-4 border-[var(--color-coral)] p-2">
                              <p className="text-[10px] font-bold uppercase text-[var(--color-coral)]" style={{ fontFamily: "var(--font-mono)" }}>
                                Original
                              </p>
                              <p className="text-xs text-black italic">
                                &ldquo;{entry.originalThought}&rdquo;
                              </p>
                            </div>
                            <div className="bg-[var(--color-green)]/10 border-l-4 border-[var(--color-green-dark)] p-2">
                              <p className="text-[10px] font-bold uppercase text-[var(--color-green-dark)]" style={{ fontFamily: "var(--font-mono)" }}>
                                Reframed
                              </p>
                              <p className="text-xs text-black italic">
                                &ldquo;{entry.reframe}&rdquo;
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {entry.distortions.map((d: string) => (
                              <span
                                key={d}
                                className="bg-black text-[var(--color-yellow)] px-2 py-0.5 text-[9px] font-bold uppercase"
                                style={{ fontFamily: "var(--font-mono)" }}
                              >
                                {d}
                              </span>
                            ))}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
