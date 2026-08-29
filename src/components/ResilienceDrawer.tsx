"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, BrainCircuit } from "lucide-react";

export interface ResilienceEntry {
  id: string;
  timestamp: string;
  originalThought: string;
  reframe: string;
  distortions: string[];
  score: number;
}

interface ResilienceDrawerProps {
  open: boolean;
  onClose: () => void;
  entries: ResilienceEntry[];
}

const MOCK_ENTRIES: ResilienceEntry[] = [
  {
    id: "1",
    timestamp: "2 hours ago",
    originalThought:
      "I'm going to fail my exam and my life is over.",
    reframe:
      "I've prepared well, and one exam doesn't define my entire future.",
    distortions: ["Catastrophizing", "All-or-Nothing Thinking"],
    score: 8,
  },
  {
    id: "2",
    timestamp: "Yesterday",
    originalThought:
      "My manager didn't reply to my message — they must think I'm incompetent.",
    reframe:
      "They're likely busy. No reply doesn't equal a negative judgment about me.",
    distortions: ["Mind Reading"],
    score: 9,
  },
  {
    id: "3",
    timestamp: "3 days ago",
    originalThought:
      "I made a bug in production. I'm a terrible developer.",
    reframe:
      "Bugs happen to every developer. Fixing them is part of the job, not a reflection of my worth.",
    distortions: ["Labeling", "All-or-Nothing Thinking"],
    score: 7,
  },
];

export default function ResilienceDrawer({
  open,
  onClose,
  entries,
}: ResilienceDrawerProps) {
  const displayEntries = entries.length > 0 ? entries : MOCK_ENTRIES;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />

          {/* Drawer */}
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 z-50 h-full w-full max-w-md border-l border-[var(--color-border)] bg-[var(--color-void)]/95 backdrop-blur-2xl"
          >
            <div className="flex h-full flex-col">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
                <div className="flex items-center gap-3">
                  <BrainCircuit className="h-5 w-5 text-[var(--color-teal)]" />
                  <h2
                    className="text-lg font-bold text-[var(--color-heading)]"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Resilience Archive
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="rounded-lg p-2 text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-heading)]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Entries */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="space-y-4">
                  {displayEntries.map((entry, i) => (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="glass-card p-4"
                    >
                      {/* Timestamp & Score */}
                      <div className="mb-3 flex items-center justify-between">
                        <span
                          className="text-[10px] uppercase tracking-widest text-[var(--color-muted)]"
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          {entry.timestamp}
                        </span>
                        <span
                          className={`text-xs font-bold ${entry.score >= 7 ? "text-[var(--color-emerald)]" : "text-[var(--color-amber)]"}`}
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          {entry.score}/10
                        </span>
                      </div>

                      {/* Original → Reframe */}
                      <div className="mb-3 space-y-2">
                        <div className="rounded-lg bg-[var(--color-crimson)]/10 border border-[var(--color-crimson)]/20 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-crimson)] mb-1" style={{ fontFamily: "var(--font-mono)" }}>
                            Original
                          </p>
                          <p className="text-sm text-[var(--color-text)] italic">
                            &ldquo;{entry.originalThought}&rdquo;
                          </p>
                        </div>
                        <div className="rounded-lg bg-[var(--color-teal)]/10 border border-[var(--color-teal)]/20 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-teal)] mb-1" style={{ fontFamily: "var(--font-mono)" }}>
                            Reframed
                          </p>
                          <p className="text-sm text-[var(--color-text)] italic">
                            &ldquo;{entry.reframe}&rdquo;
                          </p>
                        </div>
                      </div>

                      {/* Distortion tags */}
                      <div className="flex flex-wrap gap-1.5">
                        {entry.distortions.map((d) => (
                          <span
                            key={d}
                            className="rounded-full bg-[var(--color-crimson)]/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-crimson)]"
                            style={{ fontFamily: "var(--font-mono)" }}
                          >
                            {d}
                          </span>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
