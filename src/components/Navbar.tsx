"use client";

import { BrainCircuit, BookMarked, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";

interface NavbarProps {
  sessionCount: number;
  onNewSession: () => void;
  onOpenArchive: () => void;
}

export default function Navbar({
  sessionCount,
  onNewSession,
  onOpenArchive,
}: NavbarProps) {
  return (
    <motion.nav
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-void)]/80 backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        {/* Left: Brand */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <BrainCircuit className="h-6 w-6 text-[var(--color-teal)]" />
            <div className="absolute inset-0 animate-pulse rounded-full bg-[var(--color-teal)] blur-md opacity-30" />
          </div>
          <span
            className="text-lg font-bold tracking-tight text-[var(--color-heading)]"
            style={{ fontFamily: "var(--font-display)" }}
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

        {/* Center: Status */}
        <div className="hidden items-center gap-2 md:flex">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-emerald)] opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--color-emerald)]" />
          </span>
          <span
            className="text-xs font-semibold uppercase tracking-widest text-[var(--color-emerald)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Calibrated
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenArchive}
            className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] transition-all hover:border-[var(--color-border-glow)] hover:text-[var(--color-teal)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <BookMarked className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              Resilience Archive ({sessionCount})
            </span>
          </button>
          <button
            onClick={onNewSession}
            className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] transition-all hover:border-[var(--color-border-glow)] hover:text-[var(--color-teal)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New Session</span>
          </button>
        </div>
      </div>
    </motion.nav>
  );
}
