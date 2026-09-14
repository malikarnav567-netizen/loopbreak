/**
 * LoopBreak — Pop-Art Physics Shatter & Reframe
 *
 * 2D vector pop-art explosion: text tears into jagged polygon pieces
 * with sharp clipping paths, bursts into flat starbursts and expanding
 * neon rings, then the counter-statement assembles in bold neubrutalist style.
 *
 * Respects prefers-reduced-motion for accessibility.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

// ── Types ────────────────────────────────────

interface ShardPiece {
  text: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  scale: number;
  opacity: number;
  color: string;
  bgColor: string;
  clipPath: string; // polygon clip path
}

interface Starburst {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  opacity: number;
  points: number;
  rotation: number;
  rotationSpeed: number;
}

interface NeonRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  opacity: number;
  lineWidth: number;
}

interface PhysicsShatterProps {
  originalThought: string;
  counterStatement: string;
  score?: number;
  trigger: number;
  onComplete?: () => void;
  skipAnimation?: boolean;
}

// ── Pop-Art Color Palettes ──────────────────

const POP_COLORS = {
  shardText: ["#FFFFFF", "#FFDE4D", "#FF6B6B", "#00FF66"],
  shardBg: ["#000000", "#FF6B6B", "#FFDE4D", "#14B8A6", "#F59E0B"],
  starburst: ["#FFDE4D", "#FF6B6B", "#00FF66", "#FFFFFF", "#14B8A6"],
  neonRing: ["#FF6B6B", "#FFDE4D", "#00FF66", "#14B8A6"],
};

const COUNTER_COLOR = "#14B8A6";

// ── Screen Shake Hook ──────────────────────

function useScreenShake() {
  const containerRef = useRef<HTMLDivElement>(null);

  const shake = (intensity = 12, duration = 500) => {
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
  };

  return { containerRef, shake };
}

// ── Generate jagged polygon clip path ──────

function generateJaggyClipPath(): string {
  const points: string[] = [];
  const numPoints = 6 + Math.floor(Math.random() * 4);
  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    const r = 40 + Math.random() * 15;
    const x = 50 + Math.cos(angle) * r;
    const y = 50 + Math.sin(angle) * r;
    points.push(`${x}% ${y}%`);
  }
  return `polygon(${points.join(", ")})`;
}

// ── Main Component ─────────────────────────

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
  const [phase, setPhase] = useState<"idle" | "shattering" | "assembling" | "complete">("idle");
  const [counterVisible, setCounterVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const { containerRef, shake } = useScreenShake();

  // Check prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (trigger <= 0) {
      setPhase("idle");
      setCounterVisible(false);
      return;
    }

    const shouldSkip = skipAnimation || reducedMotion;
    if (shouldSkip) {
      setPhase("assembling");
      setCounterVisible(true);
      setTimeout(() => {
        setPhase("complete");
        onComplete?.();
      }, 800);
      return;
    }

    // ── Phase 1: Initialize pop-art explosion ──
    setPhase("shattering");
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Size canvas
    const rect = canvas.parentElement?.getBoundingClientRect();
    const width = rect?.width || 800;
    const height = rect?.height || 400;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Screen shake on impact
    shake(14, 600);

    const centerX = width / 2;
    const centerY = height / 2;

    // ── Create shard pieces from words ──
    const words = originalThought.split(/\s+/).filter(Boolean);
    const shards: ShardPiece[] = [];

    const lineHeight = 36;
    const charWidth = 10;
    let lineX = 40;
    let lineY = height / 3;

    for (let wi = 0; wi < words.length; wi++) {
      const word = words[wi];
      const wordWidth = word.length * charWidth;

      if (lineX + wordWidth > width - 40) {
        lineX = 40;
        lineY += lineHeight;
      }

      const wordCenterX = lineX + wordWidth / 2;
      const wordCenterY = lineY;

      // Direction outward from center
      const dx = wordCenterX - centerX;
      const dy = wordCenterY - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const speed = 4 + Math.random() * 8;

      shards.push({
        text: word,
        x: wordCenterX,
        y: wordCenterY,
        vx: (dx / dist) * speed + (Math.random() - 0.5) * 4,
        vy: (dy / dist) * speed - 3, // slight upward bias
        rotation: 0,
        rotationSpeed: (Math.random() - 0.5) * 0.2,
        scale: 1,
        opacity: 1,
        color: POP_COLORS.shardText[wi % POP_COLORS.shardText.length],
        bgColor: POP_COLORS.shardBg[wi % POP_COLORS.shardBg.length],
        clipPath: generateJaggyClipPath(),
      });

      lineX += wordWidth + 14;
    }

    // ── Create starbursts ──
    const starbursts: Starburst[] = [];
    const numStarbursts = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < numStarbursts; i++) {
      starbursts.push({
        x: centerX + (Math.random() - 0.5) * width * 0.6,
        y: centerY + (Math.random() - 0.5) * height * 0.4,
        radius: 0,
        maxRadius: 30 + Math.random() * 60,
        color: POP_COLORS.starburst[i % POP_COLORS.starburst.length],
        opacity: 1,
        points: 8 + Math.floor(Math.random() * 5),
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.1,
      });
    }

    // ── Create neon rings ──
    const neonRings: NeonRing[] = [];
    for (let i = 0; i < 3; i++) {
      neonRings.push({
        x: centerX + (Math.random() - 0.5) * 40,
        y: centerY + (Math.random() - 0.5) * 30,
        radius: 0,
        maxRadius: 100 + i * 60,
        color: POP_COLORS.neonRing[i % POP_COLORS.neonRing.length],
        opacity: 1,
        lineWidth: 6 - i * 1.5,
      });
    }

    // ── "POW!" text element ──
    const powText = {
      x: centerX,
      y: centerY - 30,
      scale: 0,
      opacity: 0,
      rotation: (Math.random() - 0.5) * 0.3,
    };

    const startTime = performance.now();
    const EXPLOSION_DURATION = 1800; // ms

    // ── Draw starburst shape ──
    const drawStarburst = (sb: Starburst) => {
      ctx.save();
      ctx.translate(sb.x, sb.y);
      ctx.rotate(sb.rotation);
      ctx.globalAlpha = sb.opacity;
      ctx.fillStyle = sb.color;
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 4;

      ctx.beginPath();
      for (let i = 0; i < sb.points * 2; i++) {
        const angle = (i / (sb.points * 2)) * Math.PI * 2;
        const r = i % 2 === 0 ? sb.radius : sb.radius * 0.45;
        ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    // ── Animation loop ──
    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(1, elapsed / EXPLOSION_DURATION);

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // ── Draw expanding neon rings ──
      for (const ring of neonRings) {
        ring.radius = ring.maxRadius * progress;
        ring.opacity = Math.max(0, 1 - progress * 1.3);

        if (ring.opacity <= 0) continue;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
        ctx.strokeStyle = ring.color;
        ctx.lineWidth = ring.lineWidth * (1 - progress);
        ctx.globalAlpha = ring.opacity;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // ── Draw starbursts ──
      for (const sb of starbursts) {
        const burstProgress = Math.min(1, progress * 2.5);
        sb.radius = sb.maxRadius * burstProgress;
        sb.opacity = Math.max(0, 1 - progress * 1.5);
        sb.rotation += sb.rotationSpeed;
        if (sb.opacity > 0) drawStarburst(sb);
      }

      // ── Draw "POW!" text ──
      if (progress < 0.7) {
        const powProgress = Math.min(1, progress * 4);
        const powScale = powProgress < 0.3
          ? powProgress / 0.3
          : 1 - (powProgress - 0.3) / 0.7;
        powText.scale = powScale;
        powText.opacity = Math.max(0, 1 - progress * 1.8);

        ctx.save();
        ctx.translate(powText.x, powText.y);
        ctx.rotate(powText.rotation);
        ctx.scale(powText.scale, powText.scale);
        ctx.globalAlpha = powText.opacity;
        ctx.font = `900 72px "Space Grotesk", system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Black outline
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 8;
        ctx.strokeText("POW!", 0, 0);
        // Yellow fill
        ctx.fillStyle = "#FFDE4D";
        ctx.fillText("POW!", 0, 0);
        // White highlight
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#FFFFFF";
        ctx.strokeText("POW!", -2, -2);

        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // ── Draw shard pieces ──
      for (const shard of shards) {
        const gravity = 0.3;
        shard.x += shard.vx;
        shard.y += shard.vy;
        shard.vy += gravity;
        shard.vx *= 0.99;
        shard.rotation += shard.rotationSpeed;
        shard.opacity = Math.max(0, 1 - progress * 1.1);
        shard.scale = Math.max(0.3, 1 - progress * 0.5);

        if (shard.opacity <= 0) continue;

        ctx.save();
        ctx.translate(shard.x, shard.y);
        ctx.rotate(shard.rotation);
        ctx.scale(shard.scale, shard.scale);
        ctx.globalAlpha = shard.opacity;

        // Background polygon (jagged shape)
        const bgWidth = shard.text.length * charWidth + 16;
        const bgHeight = lineHeight - 4;

        ctx.fillStyle = shard.bgColor;
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 3;

        // Draw jagged rectangle
        const hw = bgWidth / 2;
        const hh = bgHeight / 2;
        const jag = 3;
        ctx.beginPath();
        ctx.moveTo(-hw + Math.random() * jag, -hh + Math.random() * jag);
        ctx.lineTo(hw + Math.random() * jag, -hh - Math.random() * jag);
        ctx.lineTo(hw - Math.random() * jag, hh + Math.random() * jag);
        ctx.lineTo(-hw - Math.random() * jag, hh - Math.random() * jag);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Text on top
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

      // ── Draw debris particles ──
      if (progress < 0.8) {
        const particleCount = Math.floor((1 - progress) * 80);
        for (let i = 0; i < particleCount; i++) {
          const px = centerX + (Math.random() - 0.5) * width * (0.3 + progress * 1.5);
          const py = centerY + (Math.random() - 0.5) * height * (0.3 + progress * 1.5);
          const pSize = 2 + Math.random() * 6;
          const pAlpha = (1 - progress) * 0.8;
          const color = POP_COLORS.starburst[Math.floor(Math.random() * POP_COLORS.starburst.length)];

          // Flat square particles (pop-art style)
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(Math.random() * Math.PI);
          ctx.fillStyle = color;
          ctx.strokeStyle = "#000000";
          ctx.lineWidth = 2;
          ctx.globalAlpha = pAlpha;
          ctx.fillRect(-pSize / 2, -pSize / 2, pSize, pSize);
          ctx.strokeRect(-pSize / 2, -pSize / 2, pSize, pSize);
          ctx.globalAlpha = 1;
          ctx.restore();
        }
      }

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        // ── Transition to assembly phase ──
        setPhase("assembling");
        setTimeout(() => setCounterVisible(true), 200);
        setTimeout(() => {
          setPhase("complete");
          onComplete?.();
        }, 2000);
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [trigger, originalThought, skipAnimation, reducedMotion, shake, onComplete]);

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-black">
      {/* Pop-art explosion canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-10"
        style={{
          opacity: phase === "shattering" ? 1 : 0,
          transition: "opacity 0.5s ease",
          pointerEvents: "none",
        }}
      />

      {/* Counter-statement assembly */}
      <AnimatePresence>
        {counterVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, type: "spring", damping: 15 }}
            className="absolute inset-0 z-20 flex items-center justify-center"
          >
            <div className="text-center max-w-lg px-8">
              <motion.div className="relative">
                {counterStatement.split(/\s+/).filter(Boolean).map((word, i) => (
                  <motion.span
                    key={`${word}-${i}`}
                    initial={{ opacity: 0, y: -20 + Math.random() * 40, x: (Math.random() - 0.5) * 80 }}
                    animate={{ opacity: 1, y: 0, x: 0 }}
                    transition={{
                      delay: 0.1 + i * 0.06,
                      duration: 0.5,
                      type: "spring",
                      damping: 12,
                    }}
                    className="inline-block mr-2 mb-1 font-bold text-white"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "1.25rem",
                      textShadow: "3px 3px 0px #000000",
                    }}
                  >
                    {word}
                  </motion.span>
                ))}
              </motion.div>

              {/* Score badge — neubrutalist */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 0.4 }}
                className="mt-6 flex justify-center"
              >
                <div
                  className={`nb-badge-green text-sm ${score < 7 ? "!bg-[var(--color-yellow)]" : ""}`}
                >
                  <CheckCircle2 className="inline h-4 w-4 mr-1.5 -mt-0.5" strokeWidth={2.5} />
                  Score: {score}/10
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reduced motion fallback */}
      {reducedMotion && phase === "assembling" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black">
          <p className="text-lg text-white font-bold" style={{ fontFamily: "var(--font-display)" }}>
            {counterStatement}
          </p>
        </div>
      )}
    </div>
  );
}
