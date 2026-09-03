"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  MicOff,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import dynamic from "next/dynamic";
import Navbar from "@/components/Navbar";
import ResilienceDrawer from "@/components/ResilienceDrawer";
import type { ResilienceEntry } from "@/components/ResilienceDrawer";
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
    <div className="flex h-full w-full items-center justify-center bg-[var(--color-void)]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-teal)]/30 border-t-[var(--color-teal)]" />
    </div>
  ),
});

// ── App States ─────────────────────────────────
type AppState = "ingestion" | "distortion" | "dissolution";

// ── Preset thoughts ────────────────────────────
const PRESET_THOUGHTS = [
  "Everyone thinks I failed the presentation and I will get fired",
  "If I'm not perfect, I am worthless",
  "I'll never recover from this mistake",
  "My team is secretly disappointed in me",
];

// ── Progress thresholds for crack sounds ───────
const CRACK_MILESTONES = new Set([0.25, 0.5, 0.75]);

// ── Distortion badge colors ────────────────────
const DISTORTION_COLORS: Record<string, string> = {
  Catastrophizing: "#F43F5E",
  "Mind Reading": "#F59E0B",
  "All-or-Nothing Thinking": "#F43F5E",
  Overgeneralization: "#F59E0B",
  "Emotional Reasoning": "#A855F7",
  Labeling: "#F59E0B",
  "Should Statements": "#F43F5E",
  Personalization: "#A855F7",
  "Mental Filter": "#F59E0B",
  "Jumping to Conclusions": "#F43F5E",
};

export default function Home() {
  // ── State ────────────────────────────────────
  const [appState, setAppState] = useState<AppState>("ingestion");
  const [thought, setThought] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [result, setResult] = useState<any>(null);

  const [reframe, setReframe] = useState("");
  const [reframeLoading, setReframeLoading] = useState(false);
  const [reframeResult, setReframeResult] = useState<any>(null);
  const [reframeError, setReframeError] = useState("");
  const [reframeHistory, setReframeHistory] = useState<
    { reframe: string; evaluation: any }[]
  >([]);

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archive, setArchive] = useState<ResilienceEntry[]>([]);
  const [shatterTrigger, setShatterTrigger] = useState(0);
  const [micActive, setMicActive] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [tension, setTension] = useState(0);
  const [showCanvasText, setShowCanvasText] = useState(true);

  const prevMilestones = useRef<Set<number>>(new Set());

  // Whether the 3D canvas should be visible
  const canvasVisible = appState === "distortion" || appState === "dissolution";

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

  // ── Analyze thought ──────────────────────────
  const handleAnalyze = async () => {
    if (!thought.trim()) return;

    initAudio();
    setAnalyzing(true);
    setAnalysisError("");
    setResult(null);
    setReframeResult(null);
    setReframe("");
    setReframeHistory([]);
    prevMilestones.current.clear();

    try {
      const response = await fetch("/api/analyseThought", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: thought, sessionId: "kinetic-session" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Analysis failed");
      setResult(data);
      setAppState("distortion");
      setShowCanvasText(true);
      startTensionHum();
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

  // ── Submit reframe ───────────────────────────
  const handleReframe = async () => {
    if (!reframe.trim() || reframeLoading) return;
    setReframeLoading(true);
    setReframeError("");
    setReframeResult(null);

    // 30-second timeout for Gemini API
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch("/api/reframeThought", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalThought: thought,
          reframe,
          socraticQuestion:
            result.socraticQuestion || result.socratic_question,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Evaluation failed");
      setReframeResult(data);
      setReframeHistory((prev) => [...prev, { reframe, evaluation: data }]);

      if (data.readyToMoveOn) {
        // SHATTER MOMENT — word-by-word sequential fracture
        stopTensionHum();
        setShatterTrigger((n) => n + 1);
        // Letters fly apart: 0.6s stagger × word count + 3s per word duration + buffer
        const wordCount = thought.split(/\s+/).filter(Boolean).length;
        const fractureDuration = Math.min(wordCount * 600 + 3000, 12000);
        setTimeout(() => setShowCanvasText(false), fractureDuration);
        playDissolutionChime();
        setTimeout(() => setAppState("dissolution"), fractureDuration + 1000);
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

  // ── Save to archive ──────────────────────────
  const saveToArchive = () => {
    const entry: ResilienceEntry = {
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
    prevMilestones.current.clear();
  };

  // ── Mute toggle ──────────────────────────────
  const toggleMute = () => {
    const newMuted = !muted;
    setMutedState(newMuted);
    setMuted(newMuted);
  };

  // ── Cleanup on unmount ───────────────────────
  useEffect(() => {
    return () => stopTensionHum();
  }, []);

  // ── Render ───────────────────────────────────
  return (
    <div className="min-h-screen bg-[var(--color-void)]">
      {/* Background ambient glow */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute left-1/2 top-0 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-[var(--color-teal)]/[0.03] blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[600px] rounded-full bg-[var(--color-amber)]/[0.02] blur-[100px]" />
      </div>

      <div className="relative z-10">
        {/* ── Navbar ──────────────────────────── */}
        <motion.nav
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-void)]/80 backdrop-blur-xl"
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Sparkles className="h-5 w-5 text-[var(--color-teal)]" />
                <div className="absolute inset-0 animate-pulse rounded-full bg-[var(--color-teal)] blur-md opacity-30" />
              </div>
              <span
                className="text-lg font-bold tracking-tight text-[var(--color-heading)]"
                style={{
                  fontFamily: "var(--font-display)",
                  letterSpacing: "-0.03em",
                }}
              >
                LoopBreak
              </span>
              <span
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted)]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                v1.0 CBT Engine
              </span>
            </div>

            <div className="hidden items-center gap-4 md:flex">
              <span
                className="rounded-full bg-[var(--color-surface)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-teal)]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Dissolved: {archive.length}
              </span>
              <span
                className="rounded-full bg-[var(--color-surface)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-amber)]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Counter:{" "}
                {archive.reduce((a, e) => a + e.distortions.length, 0)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleMute}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[var(--color-muted)] transition-all hover:border-[var(--color-border-glow)] hover:text-[var(--color-teal)]"
                title={muted ? "Unmute" : "Mute"}
              >
                {muted ? (
                  <VolumeX className="h-3.5 w-3.5" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                onClick={() => setArchiveOpen(true)}
                className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] transition-all hover:border-[var(--color-border-glow)] hover:text-[var(--color-teal)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Archive ({archive.length})
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] transition-all hover:border-[var(--color-border-glow)] hover:text-[var(--color-teal)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </motion.nav>

        <main className="relative mx-auto max-w-6xl">
          {/* ═══════ STATE 1: INGESTION ═══════ */}
          <AnimatePresence mode="wait">
            {appState === "ingestion" && (
              <motion.div
                key="ingestion"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -30 }}
                transition={{ duration: 0.5 }}
                className="px-6 py-12"
              >
                <div className="mx-auto max-w-2xl">
                  <div className="mb-10 text-center">
                    <motion.h1
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="mb-3 text-4xl font-extrabold tracking-tight text-[var(--color-heading)] md:text-5xl"
                      style={{
                        fontFamily: "var(--font-display)",
                        letterSpacing: "-0.03em",
                      }}
                    >
                      What&apos;s on your mind?
                    </motion.h1>
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.4 }}
                      className="text-[var(--color-muted)]"
                    >
                      Externalize the thought. Watch it dissolve.
                    </motion.p>
                  </div>

                  <div className="mb-8 flex justify-center">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        initAudio();
                        setMicActive(!micActive);
                      }}
                      className={`relative flex h-20 w-20 items-center justify-center rounded-full transition-all duration-300 ${
                        micActive
                          ? "bg-[var(--color-crimson)] shadow-[0_0_40px_var(--color-crimson-glow)]"
                          : "bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-amber)] hover:shadow-[0_0_30px_var(--color-amber-glow)]"
                      }`}
                      style={
                        micActive
                          ? { animation: "mic-pulse 1.5s infinite" }
                          : undefined
                      }
                    >
                      {micActive ? (
                        <MicOff className="h-8 w-8 text-white" />
                      ) : (
                        <Mic className="h-8 w-8 text-[var(--color-amber)]" />
                      )}
                    </motion.button>
                  </div>

                  {micActive && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 40 }}
                      className="mx-auto mb-8 flex max-w-xs items-end justify-center gap-1"
                    >
                      {Array.from({ length: 24 }).map((_, i) => (
                        <div
                          key={i}
                          className="w-1 rounded-full bg-[var(--color-amber)]"
                          style={{
                            height: 8,
                            animation: `waveform-bar ${
                              0.4 + Math.random() * 0.6
                            }s ease-in-out ${i * 0.04}s infinite`,
                          }}
                        />
                      ))}
                    </motion.div>
                  )}

                  <div className="mb-6 flex items-center gap-4">
                    <div className="h-px flex-1 bg-[var(--color-border)]" />
                    <span
                      className="text-[10px] uppercase tracking-widest text-[var(--color-muted)]"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      or type your raw thought
                    </span>
                    <div className="h-px flex-1 bg-[var(--color-border)]" />
                  </div>

                  <div className="mb-4 flex flex-wrap gap-2 justify-center">
                    {PRESET_THOUGHTS.map((p) => (
                      <button
                        key={p}
                        onClick={() => setThought(p)}
                        className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/50 px-3 py-1 text-xs text-[var(--color-muted)] transition-all hover:border-[var(--color-amber)]/30 hover:text-[var(--color-amber)]"
                        style={{ fontFamily: "var(--font-body)" }}
                      >
                        {p.length > 40 ? p.slice(0, 37) + "..." : p}
                      </button>
                    ))}
                  </div>

                  <div className="glass-card p-1">
                    <textarea
                      value={thought}
                      onChange={(e) => setThought(e.target.value)}
                      placeholder="I completely ruined the demo presentation, my team thinks I'm useless, and we're going to fail."
                      rows={4}
                      className="w-full resize-none rounded-[12px] bg-transparent p-5 text-[var(--color-heading)] placeholder:text-[var(--color-muted)]/60 focus:outline-none"
                      style={{ fontFamily: "var(--font-body)" }}
                    />
                  </div>

                  <div className="mt-6 flex justify-center">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleAnalyze}
                      disabled={analyzing || !thought.trim()}
                      className="btn-amber flex items-center gap-3 px-8 py-4 text-base disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {analyzing ? (
                        <>
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          Extracting Distortions...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-5 w-5" />
                          Analyze Cognitive Loops
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </motion.button>
                  </div>

                  {analysisError && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-6 rounded-xl border border-[var(--color-crimson)]/30 bg-[var(--color-crimson)]/10 p-4 text-center text-sm text-[var(--color-crimson)]"
                    >
                      {analysisError}
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ═══════ 3D CANVAS — PERSISTENT across distortion + dissolution ═══════ */}
          {canvasVisible && (
            <div
              className="relative mx-auto max-w-6xl"
              style={{ height: "55vh", minHeight: "380px" }}
            >
              <ThoughtScene
                thought={thought}
                tension={tension}
                shatterTrigger={shatterTrigger}
                showText={showCanvasText}
              />

              {/* ── DISTORTION OVERLAYS (only in distortion state) ── */}
              {appState === "distortion" && result && (
                <>
                  {/* Distortion badges */}
                  <div className="absolute top-4 left-0 right-0 z-20 flex flex-wrap items-center justify-center gap-2 px-6">
                    <span
                      className="text-[10px] uppercase tracking-widest text-[var(--color-muted)] mr-1"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      Detected:
                    </span>
                    {(result.distortions || []).map(
                      (d: string, i: number) => {
                        const c = DISTORTION_COLORS[d] || "#F43F5E";
                        return (
                          <motion.span
                            key={d}
                            initial={{ opacity: 0, scale: 0.8, y: -10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            transition={{
                              delay: 0.3 + i * 0.1,
                              type: "spring",
                              damping: 15,
                            }}
                            className="distortion-badge"
                            style={{
                              backgroundColor: `${c}20`,
                              color: c,
                              border: `1px solid ${c}40`,
                            }}
                          >
                            {d}
                          </motion.span>
                        );
                      }
                    )}
                  </div>

                  {/* Socratic question */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                    className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 w-[90%] max-w-xl rounded-2xl border border-[var(--color-teal)]/20 bg-[var(--color-void)]/80 backdrop-blur-xl p-5 text-center"
                  >
                    <p
                      className="text-[10px] uppercase tracking-widest text-[var(--color-teal)] mb-1.5"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      Socratic Challenge
                    </p>
                    <p
                      className="text-sm text-[var(--color-teal)] font-semibold leading-relaxed"
                      style={{ fontFamily: "var(--font-body)" }}
                    >
                      {result.socraticQuestion || result.socratic_question}
                    </p>
                  </motion.div>
                </>
              )}

              {/* ── DISSOLUTION OVERLAY ── */}
              <AnimatePresence>
                {appState === "dissolution" && (
                  <motion.div
                    key="dissolution-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 1.2 }}
                    className="absolute inset-0 z-30 flex items-center justify-center"
                  >
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        delay: 0.5,
                        type: "spring",
                        damping: 15,
                      }}
                      className="text-center"
                    >
                      <div className="mb-6 flex justify-center">
                        <div className="relative">
                          <CheckCircle2 className="h-20 w-20 text-[var(--color-emerald)]" />
                          <div className="absolute inset-0 animate-pulse rounded-full bg-[var(--color-emerald)] blur-2xl opacity-20" />
                        </div>
                      </div>

                      <h2
                        className="mb-3 text-3xl font-extrabold tracking-tight text-[var(--color-heading)]"
                        style={{
                          fontFamily: "var(--font-display)",
                          letterSpacing: "-0.03em",
                        }}
                      >
                        Cognitive Loop Broken
                      </h2>
                      <p className="mb-2 text-lg text-[var(--color-teal)]">
                        Distortion Reframed
                      </p>
                      <p className="text-sm text-[var(--color-muted)] max-w-md mx-auto">
                        You&apos;ve successfully externalized, confronted,
                        and dissolved an intrusive thought pattern.
                      </p>

                      <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={saveToArchive}
                          className="btn-teal flex items-center gap-2 px-6 py-3 text-sm"
                          style={{ fontFamily: "var(--font-display)" }}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Add to Resilience Journal
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={handleReset}
                          className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3 text-sm font-medium text-[var(--color-text)] transition-all hover:border-[var(--color-border-glow)]"
                          style={{ fontFamily: "var(--font-display)" }}
                        >
                          <RotateCcw className="h-4 w-4" />
                          New Session
                        </motion.button>
                      </div>

                      <div className="mt-8 glass-card mx-auto max-w-md p-6">
                        <p
                          className="text-[10px] uppercase tracking-widest text-[var(--color-teal)] mb-2"
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          Your Reframe
                        </p>
                        <p className="text-lg italic text-[var(--color-heading)]">
                          &ldquo;
                          {reframeResult?.improvedReframe || reframe}
                          &rdquo;
                        </p>
                        <div className="mt-3 flex justify-center">
                          <span
                            className="rounded-full bg-[var(--color-emerald)]/15 px-3 py-1 text-xs font-bold text-[var(--color-emerald)]"
                            style={{ fontFamily: "var(--font-mono)" }}
                          >
                            Score: {reframeResult?.score}/10
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* ═══════ REFRAME COCKPIT (only in distortion state) ═══════ */}
          {appState === "distortion" && result && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="relative z-20 border-t border-[var(--color-border)] bg-[var(--color-void)]/90 backdrop-blur-xl"
            >
              <div className="mx-auto max-w-2xl px-6 py-8">
                {/* Core Fallacy */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="mb-4 glass-card p-4"
                >
                  <p
                    className="text-[10px] uppercase tracking-widest text-[var(--color-crimson)] mb-1"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    Core Fallacy
                  </p>
                  <p className="text-sm text-[var(--color-text)]">
                    {result.coreFallacy || result.core_fallacy}
                  </p>
                </motion.div>

                {/* Reframe input */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="text-[10px] uppercase tracking-widest text-[var(--color-muted)]"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      Your Balanced Counter-Statement
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 rounded-full bg-[var(--color-surface)] overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{
                            background: `linear-gradient(90deg, var(--color-amber), var(--color-crimson))`,
                            width: `${tension * 100}%`,
                          }}
                          animate={{ width: `${tension * 100}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                      <span
                        className="text-[10px] text-[var(--color-muted)]"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {Math.round(tension * 100)}%
                      </span>
                    </div>
                  </div>
                  <div className="glass-card p-1">
                    <textarea
                      value={reframe}
                      onChange={(e) => handleReframeChange(e.target.value)}
                      placeholder="I made one mistake on slide 4, but we nailed the live demo and have 3 working features."
                      rows={3}
                      className="w-full resize-none rounded-[12px] bg-transparent p-4 text-[var(--color-heading)] placeholder:text-[var(--color-muted)]/60 focus:outline-none text-sm"
                      style={{ fontFamily: "var(--font-body)" }}
                    />
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleReframe}
                    disabled={reframeLoading || !reframe.trim()}
                    className="btn-teal flex items-center gap-2 px-6 py-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {reframeLoading ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Evaluating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Shatter & Reframe
                      </>
                    )}
                  </motion.button>

                  <button
                    onClick={handleReset}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-xs font-medium text-[var(--color-muted)] transition-all hover:text-[var(--color-text)]"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Reset
                  </button>
                </div>

                {reframeError && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-3 rounded-xl border border-[var(--color-crimson)]/30 bg-[var(--color-crimson)]/10 p-3 text-center text-sm text-[var(--color-crimson)]"
                  >
                    {reframeError}
                  </motion.div>
                )}

                {/* Reframe Evaluation */}
                <AnimatePresence>
                  {reframeResult && (
                    <motion.div
                      initial={{ opacity: 0, y: 15, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="mt-4 glass-card p-4 space-y-3"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="text-[10px] uppercase tracking-widest text-[var(--color-muted)]"
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          Score
                        </span>
                        <span
                          className={`text-2xl font-extrabold ${
                            reframeResult.score >= 7
                              ? "text-[var(--color-emerald)]"
                              : reframeResult.score >= 4
                              ? "text-[var(--color-amber)]"
                              : "text-[var(--color-crimson)]"
                          }`}
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          {reframeResult.score}/10
                        </span>
                      </div>
                      <p className="text-sm text-[var(--color-text)]">
                        {reframeResult.feedback}
                      </p>
                      {reframeResult.score < 7 &&
                        reframeResult.improvedReframe && (
                          <div className="rounded-xl border border-[var(--color-teal)]/20 bg-[var(--color-teal)]/5 p-3">
                            <p
                              className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-teal)]"
                              style={{ fontFamily: "var(--font-mono)" }}
                            >
                              Try this reframe:
                            </p>
                            <p className="text-sm text-[var(--color-teal)] italic">
                              &ldquo;{reframeResult.improvedReframe}&rdquo;
                            </p>
                          </div>
                        )}
                      {reframeResult.readyToMoveOn && (
                        <div className="rounded-xl border border-[var(--color-emerald)]/30 bg-[var(--color-emerald)]/10 p-3 text-center">
                          <p className="font-semibold text-[var(--color-emerald)]">
                            <CheckCircle2 className="mr-2 inline h-4 w-4" />
                            Loop Broken
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
                      className="mb-2 text-[10px] uppercase tracking-widest text-[var(--color-muted)]"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      Previous Attempts
                    </p>
                    <div className="space-y-1">
                      {reframeHistory.slice(0, -1).map((entry, i) => (
                        <div
                          key={i}
                          className="glass-card p-2 opacity-50 text-xs"
                        >
                          <p className="italic text-[var(--color-text)]">
                            &ldquo;{entry.reframe}&rdquo;
                          </p>
                          <p
                            className="text-[var(--color-muted)]"
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
      </div>

      <ResilienceDrawer
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        entries={archive}
      />
    </div>
  );
}
