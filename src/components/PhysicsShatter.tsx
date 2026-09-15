/**
 * LoopBreak — PhysicsShatter v3
 *
 * Word-by-word shatter: each word fractures visibly in sequence.
 * Words are highlighted → crack → explode into jagged shards that drift
 * slowly enough for the eye to follow.  Each word gets its own beat.
 *
 * Then the counter-statement assembles letter by letter with a soft
 * midnight-blue glow matching the neubrutalist palette.
 *
 * Respects prefers-reduced-motion.
 */

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

// ── Timing Constants (slower, more deliberate) ────────
const SHATTER_START_DELAY = 150; // ms before first word starts cracking
const WORD_CRACK_DURATION = 200; // ms of visible "cracking" before explosion
const WORD_SHATTER_DURATION = 900; // ms for shards to drift away (slow & visible)
const WORD_GAP = 550; // ms gap between consecutive words
const ASSEMBLY_LETTER_DELAY = 55; // ms between each letter appearing
const ASSEMBLY_PRE_DELAY = 400; // ms pause before assembly starts

// ── Props ─────────────────────────────────────────────
interface PhysicsShatterProps {
  originalThought: string;
  counterStatement: string;
  score?: number;
  trigger: number;
  onComplete?: () => void;
  skipAnimation?: boolean;
}

// ── Theme colors ──────────────────────────────────────
const PALETTE = {
  bg: "#000000",
  shardText: ["#FFFFFF", "#FFDE4D", "#FFFFFF", "#FFDE4D", "#FFFFFF"],
  shardBg: ["#8B4049", "#000000", "#3B5998", "#8B4049", "#000000"],
  glow: "#2C3E6B",
  glowLight: "#4A6FA5",
  accent: "#D4B040",
};

// ── Shard type ────────────────────────────────────────
interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  rotSpd: number;
  opacity: number;
  color: string;
  bg: string;
  text: string;
  w: number;
  h: number;
  born: number;
  gravity: number;
}

// ── Word visual state ─────────────────────────────────
type WordState = "idle" | "highlighted" | "cracking" | "shattering";

// ── Starburst drawer ──────────────────────────────────
function drawStarburst(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  points: number,
  color: string,
  rotation: number,
  alpha: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i / (points * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? radius : radius * 0.4;
    ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ── Main Component ────────────────────────────────────
export default function PhysicsShatter({
  originalThought,
  counterStatement,
  score = 7,
  trigger,
  onComplete,
  skipAnimation = false,
}: PhysicsShatterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const [phase, setPhase] = useState<
    "idle" | "shattering" | "assembling" | "complete"
  >("idle");
  const [counterLetters, setCounterLetters] = useState<
    { char: string; visible: boolean }[]
  >([]);
  const [reducedMotion, setReducedMotion] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const shake = useCallback((intensity = 8, duration = 350) => {
    const el = containerRef.current;
    if (!el) return;
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      if (elapsed > duration) {
        el.style.transform = "";
        return;
      }
      const decay = 1 - elapsed / duration;
      const x = (Math.random() - 0.5) * intensity * decay;
      const y = (Math.random() - 0.5) * intensity * decay;
      el.style.transform = `translate(${x}px, ${y}px)`;
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    if (trigger <= 0) {
      setPhase("idle");
      setCounterLetters([]);
      return;
    }

    if (skipAnimation || reducedMotion) {
      setPhase("assembling");
      setCounterLetters(
        counterStatement.split("").map((c) => ({ char: c, visible: true })),
      );
      setTimeout(() => {
        setPhase("complete");
        onComplete?.();
      }, 600);
      return;
    }

    // ── Phase 1: Word-by-word shatter ──────────────
    setPhase("shattering");
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.parentElement?.getBoundingClientRect();
    const W = rect?.width || 800;
    const H = rect?.height || 380;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.scale(dpr, dpr);

    const centerX = W / 2;
    const centerY = H / 2;

    // ── Parse words and lay out positions (centered) ───
    const words = originalThought.split(/\s+/).filter(Boolean);
    const lineHeight = 42;
    const charW = 10;
    const wordGap = 18;
    const maxLineW = W - 80;

    // Pass 1: lay out words into lines (x temporary, starting at 0)
    const lines: { words: number[]; totalWidth: number }[] = [];
    let curLine: number[] = [];
    let curLineW = 0;
    for (let wi = 0; wi < words.length; wi++) {
      const ww = words[wi].length * charW + 8;
      if (curLine.length > 0 && curLineW + wordGap + ww > maxLineW) {
        lines.push({ words: curLine, totalWidth: curLineW });
        curLine = [];
        curLineW = 0;
      }
      curLine.push(wi);
      curLineW += (curLine.length > 1 ? wordGap : 0) + ww;
    }
    if (curLine.length > 0) lines.push({ words: curLine, totalWidth: curLineW });

    // Pass 2: center each line horizontally and vertically
    const totalH = lines.length * lineHeight;
    const startY = (H - totalH) / 2;
    const wordPositions: { x: number; y: number; width: number }[] = new Array(words.length).fill(null).map(() => ({ x: 0, y: 0, width: 0 }));
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      let lx = (W - line.totalWidth) / 2;
      const ly = startY + li * lineHeight + lineHeight / 2;
      for (const wi of line.words) {
        const ww = words[wi].length * charW + 8;
        wordPositions[wi] = { x: lx, y: ly, width: ww };
        lx += ww + wordGap;
      }
    }

    // ── Word states ────────────────────────────────
    const wordStates: WordState[] = words.map(() => "idle");
    const wordShatterStart: number[] = words.map(
      (_, i) => SHATTER_START_DELAY + i * (WORD_CRACK_DURATION + WORD_GAP),
    );

    const allShards: Shard[] = [];
    const bursts: {
      x: number;
      y: number;
      radius: number;
      maxRadius: number;
      color: string;
      alpha: number;
      points: number;
      rot: number;
      rotSpd: number;
      born: number;
    }[] = [];

    // ── Spawn shards for a word ────────────────────
    function spawnWordShards(wi: number, now: number) {
      const pos = wordPositions[wi];
      if (!pos) return;
      const word = words[wi];

      // Split word into 2-4 fragments
      const fragmentCount = Math.min(4, Math.max(2, Math.ceil(word.length / 4)));
      const fragLen = Math.ceil(word.length / fragmentCount);

      for (let f = 0; f < fragmentCount; f++) {
        const fragText = word.slice(f * fragLen, (f + 1) * fragLen);
        const fragWidth = fragText.length * charW + 4;
        const xOffset = (f - (fragmentCount - 1) / 2) * fragWidth * 0.6;

        const angle = (Math.random() - 0.5) * Math.PI * 0.8;
        const speed = 1.5 + Math.random() * 3;

        allShards.push({
          x: pos.x + pos.width / 2 + xOffset,
          y: pos.y,
          vx: Math.cos(angle) * speed * (xOffset >= 0 ? 1 : -1),
          vy: -1.5 + Math.random() * -2.5,
          rot: (Math.random() - 0.5) * 0.3,
          rotSpd: (Math.random() - 0.5) * 0.06,
          opacity: 1,
          color: PALETTE.shardText[wi % PALETTE.shardText.length],
          bg: PALETTE.shardBg[wi % PALETTE.shardBg.length],
          text: fragText,
          w: fragWidth + 8,
          h: lineHeight - 10,
          born: now,
          gravity: 0.18,
        });
      }

      // One starburst per word
      bursts.push({
        x: pos.x + pos.width / 2,
        y: pos.y,
        radius: 0,
        maxRadius: 35 + Math.random() * 25,
        color: PALETTE.shardBg[wi % PALETTE.shardBg.length],
        alpha: 1,
        points: 8,
        rot: Math.random() * Math.PI * 2,
        rotSpd: (Math.random() - 0.5) * 0.06,
        born: now,
      });

      shake(6 + Math.random() * 3, 250);
    }

    // ── Animation loop ─────────────────────────────
    const startTime = performance.now();
    const totalShatterTime =
      SHATTER_START_DELAY +
      words.length * (WORD_CRACK_DURATION + WORD_GAP) +
      WORD_SHATTER_DURATION +
      200;

    const animate = () => {
      const now = performance.now();
      const elapsed = now - startTime;
      ctx.clearRect(0, 0, W, H);

      // ── Update word states ──────────────────────
      for (let wi = 0; wi < words.length; wi++) {
        const start = wordShatterStart[wi];
        if (elapsed >= start && wordStates[wi] === "idle") {
          wordStates[wi] = "highlighted";
        }
        if (
          elapsed >= start + WORD_CRACK_DURATION * 0.3 &&
          wordStates[wi] === "highlighted"
        ) {
          wordStates[wi] = "cracking";
        }
        if (
          elapsed >= start + WORD_CRACK_DURATION &&
          wordStates[wi] !== "shattering"
        ) {
          wordStates[wi] = "shattering";
          spawnWordShards(wi, now);
        }
      }

      // ── Draw words that haven't shattered yet ───
      for (let wi = 0; wi < words.length; wi++) {
        const state = wordStates[wi];
        if (state === "shattering") continue;

        const pos = wordPositions[wi];
        if (!pos) continue;

        ctx.save();

        if (state === "highlighted" || state === "cracking") {
          // Highlight background — pulsing yellow
          const crackProgress =
            state === "cracking"
              ? (elapsed -
                  (wordShatterStart[wi] + WORD_CRACK_DURATION * 0.3)) /
                (WORD_CRACK_DURATION * 0.7)
              : 0;
          const pulse = Math.sin(elapsed * 0.012) * 0.15;

          ctx.globalAlpha = 0.2 + pulse + crackProgress * 0.3;
          ctx.fillStyle = PALETTE.accent;
          ctx.fillRect(
            pos.x - 6,
            pos.y - lineHeight / 2 + 2,
            pos.width + 12,
            lineHeight - 4,
          );

          // Crack lines during cracking phase
          if (state === "cracking" && crackProgress > 0.2) {
            ctx.globalAlpha = crackProgress * 0.7;
            ctx.strokeStyle = PALETTE.shardBg[wi % PALETTE.shardBg.length];
            ctx.lineWidth = 2;
            const cx = pos.x + pos.width / 2;
            const cy = pos.y;

            for (let c = 0; c < Math.ceil(crackProgress * 5); c++) {
              const angle = (c / 5) * Math.PI * 2 + wi;
              const len = 12 + crackProgress * 15;
              ctx.beginPath();
              ctx.moveTo(cx, cy);
              ctx.lineTo(
                cx + Math.cos(angle) * len + (Math.random() - 0.5) * 8,
                cy + Math.sin(angle) * len + (Math.random() - 0.5) * 8,
              );
              ctx.stroke();
            }
          }

          ctx.globalAlpha = 1;
        }

        // Draw word text
        const shakeX =
          state === "cracking"
            ? (Math.random() - 0.5) * 3
            : 0;
        const shakeY =
          state === "cracking"
            ? (Math.random() - 0.5) * 2
            : 0;

        ctx.font = `700 17px "Space Grotesk", system-ui, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#FFFFFF";
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 3;
        ctx.strokeText(
          words[wi],
          pos.x + shakeX,
          pos.y + shakeY,
        );
        ctx.fillText(words[wi], pos.x + shakeX, pos.y + shakeY);
        ctx.restore();
      }

      // ── Draw starbursts ─────────────────────────
      for (const sb of bursts) {
        const age = now - sb.born;
        const life = 600;
        if (age > life) continue;
        const progress = age / life;
        sb.radius = sb.maxRadius * Math.min(1, progress * 2.5);
        sb.alpha = Math.max(0, 1 - progress * 1.3);
        sb.rot += sb.rotSpd;
        if (sb.alpha > 0) {
          drawStarburst(
            ctx,
            sb.x,
            sb.y,
            sb.radius,
            sb.points,
            sb.color,
            sb.rot,
            sb.alpha,
          );
        }
      }

      // ── Draw shards ─────────────────────────────
      for (const shard of allShards) {
        const age = now - shard.born;
        if (age < 0) continue;
        const life = WORD_SHATTER_DURATION + 500;
        if (age > life) continue;
        const progress = age / life;

        shard.x += shard.vx;
        shard.y += shard.vy;
        shard.vy += shard.gravity;
        shard.vx *= 0.995;
        shard.rot += shard.rotSpd;
        shard.opacity = Math.max(0, 1 - progress * 1.05);

        if (shard.opacity <= 0) continue;

        ctx.save();
        ctx.translate(shard.x, shard.y);
        ctx.rotate(shard.rot);
        ctx.globalAlpha = shard.opacity;

        const hw = shard.w / 2;
        const hh = shard.h / 2;
        const jag = 5;

        ctx.fillStyle = shard.bg;
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-hw + jag * Math.sin(shard.born), -hh + jag * Math.cos(shard.born));
        ctx.lineTo(hw + jag * Math.cos(shard.born + 1), -hh - jag * Math.sin(shard.born + 1));
        ctx.lineTo(hw - jag * Math.sin(shard.born + 2), hh + jag * Math.cos(shard.born + 2));
        ctx.lineTo(-hw - jag * Math.cos(shard.born + 3), hh - jag * Math.sin(shard.born + 3));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.font = `700 16px "Space Grotesk", system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = shard.color;
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 2;
        ctx.strokeText(shard.text, 0, 0);
        ctx.fillText(shard.text, 0, 0);

        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // ── Fade-to-black vignette as shatter ends ──
      const fadeStart = totalShatterTime - 600;
      if (elapsed > fadeStart) {
        const fadeProgress = Math.min(
          1,
          (elapsed - fadeStart) / 600,
        );
        ctx.fillStyle = PALETTE.bg;
        ctx.globalAlpha = fadeProgress * 0.85;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }

      // ── Check if shatter phase is done ──────────
      if (elapsed >= totalShatterTime) {
        setPhase("assembling");
        const letters = counterStatement
          .split("")
          .map((c) => ({ char: c, visible: false }));
        setCounterLetters(letters);

        // Reveal letters one by one with staggered glow
        for (let li = 0; li < letters.length; li++) {
          setTimeout(() => {
            setCounterLetters((prev) => {
              const next = [...prev];
              if (next[li]) next[li] = { ...next[li], visible: true };
              return next;
            });
          }, ASSEMBLY_PRE_DELAY + li * ASSEMBLY_LETTER_DELAY);
        }

        // Complete
        setTimeout(
          () => {
            setPhase("complete");
            onComplete?.();
          },
          ASSEMBLY_PRE_DELAY +
            letters.length * ASSEMBLY_LETTER_DELAY +
            1000,
        );

        return;
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [
    trigger,
    originalThought,
    counterStatement,
    skipAnimation,
    reducedMotion,
    onComplete,
    shake,
  ]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-black"
    >
      {/* ── Shatter Canvas ──────────────────────── */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-10"
        style={{
          opacity: phase === "shattering" ? 1 : 0,
          transition: "opacity 0.8s ease",
          pointerEvents: "none",
        }}
      />

      {/* ── Counter-statement assembly ────────────── */}
      <AnimatePresence>
        {(phase === "assembling" || phase === "complete") && (
          <motion.div
            key="counter-assembly"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="absolute inset-0 z-20 flex items-center justify-center"
          >
            <div className="text-center max-w-2xl px-6">
              {/* Glowing letter-by-letter text */}
              <div className="relative mb-6">
                <p
                  className="text-xl md:text-3xl font-bold leading-relaxed tracking-wide"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {(() => {
                    // Group letters into words so line-breaking never splits a word
                    const wordGroups: { chars: { char: string; visible: boolean }[]; startIndex: number }[] = [];
                    let currentWord: { char: string; visible: boolean }[] = [];
                    let wordStart = 0;
                    for (let i = 0; i < counterLetters.length; i++) {
                      const l = counterLetters[i];
                      if (l.char === " " || l.char === "\n") {
                        if (currentWord.length > 0) {
                          wordGroups.push({ chars: currentWord, startIndex: wordStart });
                          currentWord = [];
                        }
                        // Space itself is its own group so it can wrap
                        wordGroups.push({ chars: [l], startIndex: i });
                      } else {
                        if (currentWord.length === 0) wordStart = i;
                        currentWord.push(l);
                      }
                    }
                    if (currentWord.length > 0) {
                      wordGroups.push({ chars: currentWord, startIndex: wordStart });
                    }

                    return wordGroups.map((group, gi) => (
                      <span
                        key={`word-${gi}`}
                        className="inline-block"
                        style={{ whiteSpace: group.chars.length === 1 && group.chars[0].char === " " ? "pre" : "nowrap" }}
                      >
                        {group.chars.map((l, li) => {
                          const globalIdx = group.startIndex + li;
                          return (
                            <span
                              key={`${globalIdx}-${l.char}`}
                              className="inline-block"
                              style={{
                                opacity: l.visible ? 1 : 0,
                                transform: l.visible
                                  ? "translateY(0) scale(1)"
                                  : "translateY(6px) scale(0.85)",
                                transition: `all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)`,
                                color: PALETTE.glow,
                                textShadow: l.visible
                                  ? `0 0 10px ${PALETTE.glowLight}, 0 0 25px ${PALETTE.glow}50, 0 0 50px ${PALETTE.glow}20, 3px 3px 0px #000000`
                                  : "none",
                              }}
                            >
                              {l.char}
                            </span>
                          );
                        })}
                      </span>
                    ));
                  })()}
                </p>

                {/* Glow underline after complete */}
                {phase === "complete" && (
                  <motion.div
                    initial={{ scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="mt-5 h-[2px] mx-auto origin-left"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${PALETTE.glowLight}, ${PALETTE.glow}, ${PALETTE.glowLight}, transparent)`,
                      boxShadow: `0 0 16px ${PALETTE.glowLight}80, 0 0 40px ${PALETTE.glow}30`,
                      maxWidth: "70%",
                    }}
                  />
                )}
              </div>

              {/* Score badge */}
              {phase === "complete" && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.5 }}
                  className="flex justify-center"
                >
                  <div
                    className="nb-badge-green text-sm"
                    style={{
                      background: score < 7 ? PALETTE.accent : PALETTE.glow,
                      color: "#FFFFFF",
                    }}
                  >
                    <CheckCircle2
                      className="inline h-4 w-4 mr-1.5 -mt-0.5"
                      strokeWidth={2.5}
                    />
                    Score: {score}/10
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reduced motion fallback */}
      {reducedMotion && phase === "assembling" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black">
          <p
            className="text-lg text-white font-bold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {counterStatement}
          </p>
        </div>
      )}
    </div>
  );
}
