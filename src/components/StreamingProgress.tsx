/**
 * LoopBreak — Streaming Progress Indicator (Neubrutalist)
 *
 * Shows live stage updates during the streaming analysis pipeline.
 * Bold uppercase labels, hard black borders, chunky indicator chips.
 */

"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Scan,
  MessageCircleQuestion,
  AlertTriangle,
  Network,
  CheckCircle2,
  Clock,
} from "lucide-react";

interface StreamingProgressProps {
  stage: string;
  message: string;
  ttft: number | null;
  complete: boolean;
  error: string;
}

const STAGE_CONFIG: Record<string, { icon: typeof Scan; color: string; bg: string; label: string }> = {
  detecting_distortions: { icon: Scan, color: "#FFFFFF", bg: "#FF6B6B", label: "Detecting Distortions" },
  generating_socratic: { icon: MessageCircleQuestion, color: "#000000", bg: "#14B8A6", label: "Crafting Challenge" },
  core_fallacy: { icon: AlertTriangle, color: "#000000", bg: "#FFDE4D", label: "Identifying Fallacy" },
  generating_graph: { icon: Network, color: "#000000", bg: "#00FF66", label: "Building Cognitive Map" },
  complete: { icon: CheckCircle2, color: "#000000", bg: "#00FF66", label: "Analysis Complete" },
  error: { icon: AlertTriangle, color: "#FFFFFF", bg: "#FF6B6B", label: "Error" },
};

export default function StreamingProgress({
  stage,
  message,
  ttft,
  complete,
  error,
}: StreamingProgressProps) {
  const [elapsed, setElapsed] = useState(0);
  const [startTime] = useState(() => Date.now());

  useEffect(() => {
    if (complete) return;
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 100);
    return () => clearInterval(interval);
  }, [startTime, complete]);

  const config = STAGE_CONFIG[stage] || STAGE_CONFIG.detecting_distortions;
  const Icon = config.icon;

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="border-4 border-black bg-[var(--color-coral)] p-3 text-center"
      >
        <span className="text-xs text-white font-bold">⚠ {error}</span>
      </motion.div>
    );
  }

  if (!stage && !complete) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="nb-card-sm p-3 bg-white"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {/* Stage chip */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 border-2 border-black"
            style={{ background: complete ? config.bg : config.bg, boxShadow: "2px 2px 0px 0px #000000" }}
          >
            <Icon className="h-3.5 w-3.5" style={{ color: config.color }} strokeWidth={2.5} />
            <span
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{ fontFamily: "var(--font-mono)", color: config.color }}
            >
              {config.label}
            </span>
            {!complete && (
              <div className="flex gap-0.5 ml-1">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="h-1 w-1"
                    style={{ background: config.color }}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
              </div>
            )}
          </div>

          {message && (
            <p className="text-[10px] text-[var(--color-text-muted)] font-medium">{message}</p>
          )}
        </div>

        {/* Timing */}
        <div className="flex items-center gap-3">
          {ttft && (
            <span
              className="text-[9px] text-[var(--color-text-muted)] font-bold"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              TTFT: {ttft}ms
            </span>
          )}
          <span
            className="text-[9px] text-[var(--color-text-muted)] font-bold flex items-center gap-1"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            <Clock className="h-2.5 w-2.5" />
            {(elapsed / 1000).toFixed(1)}s
          </span>
        </div>
      </div>
    </motion.div>
  );
}
