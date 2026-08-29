"use client";

import { useEffect, useRef, useCallback } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  decay: number;
}

const COLORS = ["#14B8A6", "#10B981", "#38BDF8", "#14B8A680", "#38BDF880"];

interface ParticleCanvasProps {
  trigger: boolean;
  originX?: number;
  originY?: number;
}

export default function ParticleCanvas({
  trigger,
  originX = 0.5,
  originY = 0.5,
}: ParticleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const animFrame = useRef<number>(0);

  const spawn = useCallback(
    (cx: number, cy: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const count = 200;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 5;
        const life = 60 + Math.random() * 120;
        particles.current.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2,
          life,
          maxLife: life,
          size: 2 + Math.random() * 4,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          decay: 0.96 + Math.random() * 0.03,
        });
      }
    },
    []
  );

  useEffect(() => {
    if (!trigger) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = canvas.width * originX;
    const cy = canvas.height * originY;
    spawn(cx, cy);
  }, [trigger, originX, originY, spawn]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener("resize", resize);

    const loop = () => {
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

      particles.current = particles.current.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.02;
        p.vx *= p.decay;
        p.vy *= p.decay;
        p.life--;

        const alpha = Math.max(0, p.life / p.maxLife);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fillStyle =
          p.color.slice(0, 7) +
          Math.round(alpha * 255)
            .toString(16)
            .padStart(2, "0");
        ctx.fill();

        // Glow
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha * 3, 0, Math.PI * 2);
        ctx.fillStyle =
          p.color.slice(0, 7) +
          Math.round(alpha * 40)
            .toString(16)
            .padStart(2, "0");
        ctx.fill();

        return p.life > 0;
      });

      animFrame.current = requestAnimationFrame(loop);
    };

    loop();

    return () => {
      cancelAnimationFrame(animFrame.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="particle-canvas"
      style={{ width: "100%", height: "100%" }}
    />
  );
}
