"use client";

import { useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

// ── Types ──────────────────────────────────────

interface LetterData {
  char: string;
  wordIndex: number;
  position: [number, number, number];
  width: number;
  seed: number;
}

interface ParticleData {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
}

// ── Constants ──────────────────────────────────

const WORD_STAGGER = 0.6; // seconds between each word shattering (slower = more visible)
const SHATTER_DURATION = 3.0; // seconds for letters to fly apart (slower = more visible)

// ── Jagged vibrating letter mesh ──────────────

function JaggedLetter({
  char,
  position,
  seed,
  tension,
  visible,
  shatterElapsed,
  wordDelay,
}: {
  char: string;
  position: [number, number, number];
  seed: number;
  tension: number;
  visible: boolean;
  shatterElapsed: number;
  wordDelay: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  // Slower, more readable vibration frequencies
  const vibFreqX = 3.0 + seed * 1.2; // was 10 + seed*7.3
  const vibFreqY = 3.5 + seed * 0.9; // was 13 + seed*5.7
  const vibFreqRot = 2.0 + seed * 0.7; // was 8 + seed*4.1
  const vibPhaseX = seed * 2.1;
  const vibPhaseY = seed * 3.4;
  const vibPhaseRot = seed * 1.7;

  const isShattering = shatterElapsed >= 0 && shatterElapsed >= wordDelay;
  const localElapsed = isShattering ? shatterElapsed - wordDelay : -1;
  const shatterProgress = isShattering ? Math.min(1, localElapsed / SHATTER_DURATION) : 0;

  // Create canvas texture
  useEffect(() => {
    if (!visible || (isShattering && shatterProgress >= 0.9)) {
      setTexture(null);
      return;
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const size = 128;
    canvas.width = size;
    canvas.height = size;
    ctx.clearRect(0, 0, size, size);

    const fontSize = char === " " ? 10 : 64; // larger text
    ctx.font = `800 ${fontSize}px "Plus Jakarta Sans", "Inter", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    let glowColor: string;
    let fillColor: string;
    if (isShattering && shatterProgress > 0 && shatterProgress < 0.3) {
      glowColor = "#FFFFFF";
      fillColor = "#FFFFFF";
      ctx.shadowBlur = 30 + shatterProgress * 40;
    } else if (isShattering) {
      glowColor = "#00F5D4";
      fillColor = "#B0F5E8";
      ctx.shadowBlur = 20 * (1 - shatterProgress);
    } else {
      // Normal: amber base, crimson at high tension
      glowColor = tension > 0.5 ? "#FF2A55" : "#F59E0B";
      fillColor = tension > 0.5 ? "#FFD6D6" : "#FFF7E6";
      ctx.shadowBlur = 10 + tension * 15;
    }

    ctx.shadowColor = glowColor;
    ctx.fillStyle = fillColor;

    if (char !== " ") {
      ctx.fillText(char, size / 2, size / 2);
      // Second pass for stronger glow
      ctx.shadowBlur = 4 + tension * 6;
      ctx.fillText(char, size / 2, size / 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    setTexture(tex);

    return () => tex.dispose();
  }, [char, visible, tension > 0.5, isShattering, Math.floor(shatterProgress * 4)]);

  // Per-frame animation
  useFrame(({ clock }) => {
    if (!meshRef.current || !visible) return;
    const t = clock.getElapsedTime();

    if (isShattering) {
      const speed = 2.5 + seed * 0.6;
      const direction = new THREE.Vector3(
        Math.cos(seed * 3.7) * speed,
        Math.sin(seed * 2.3) * speed * 0.4 + 2.0,
        Math.sin(seed * 5.1) * speed * 0.2
      );

      const easeOut = 1 - Math.pow(1 - shatterProgress, 3);

      meshRef.current.position.x = position[0] + direction.x * easeOut;
      meshRef.current.position.y = position[1] + direction.y * easeOut;
      meshRef.current.position.z = position[2] + direction.z * easeOut;

      // Slower spin so user can see letters rotating
      meshRef.current.rotation.x += 0.04 * (seed + 1);
      meshRef.current.rotation.y += 0.03 * (seed + 1);
      meshRef.current.rotation.z += 0.025 * (seed + 1);

      // Scale down and fade
      const fade = Math.max(0, 1 - shatterProgress * 1.1);
      meshRef.current.scale.setScalar(fade);
      if (matRef.current) matRef.current.opacity = fade;
      return;
    }

    // ── Gentle jagged vibration — readable but tense ──
    const baseJitter = 0.008 + tension * 0.02; // much smaller than before
    const jitterX = Math.sin(t * vibFreqX + vibPhaseX) * baseJitter;
    const jitterY = Math.cos(t * vibFreqY + vibPhaseY) * baseJitter * 0.5;
    const jitterRot = Math.sin(t * vibFreqRot + vibPhaseRot) * baseJitter * 0.08;

    // Subtle micro-jitter (very gentle)
    const microJitter = Math.sin(t * 12 + seed * 13) * 0.002 * tension;

    meshRef.current.position.x = position[0] + jitterX + microJitter;
    meshRef.current.position.y = position[1] + jitterY;
    meshRef.current.position.z = position[2];
    meshRef.current.rotation.z = jitterRot;
    meshRef.current.rotation.x = Math.sin(t * 2 + seed * 9) * 0.008 * tension;

    // Gentle scale pulse
    const scalePulse = 1 + Math.sin(t * 2 + seed * 2) * 0.015 * tension;
    meshRef.current.scale.setScalar(scalePulse);
  });

  if (!visible || !texture) return null;

  const isSpace = char === " ";
  const width = isSpace ? 0.28 : 0.36; // tighter spacing
  const height = 0.5;

  return (
    <mesh ref={meshRef} position={position}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        ref={matRef}
        map={texture}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// ── Word-level particle burst ──────────────────

function WordParticleBurst({
  shatterElapsed,
  words,
  letterData,
}: {
  shatterElapsed: number;
  words: string[];
  letterData: LetterData[];
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const particlesRef = useRef<ParticleData[]>([]);
  const spawnedRef = useRef<Set<number>>(new Set());
  const MAX_PARTICLES = 2500;

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3)
    );
    geo.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3)
    );
    return geo;
  }, []);

  useEffect(() => {
    if (shatterElapsed <= 0) {
      particlesRef.current = [];
      spawnedRef.current = new Set();
    }
  }, [shatterElapsed <= 0]);

  useFrame(() => {
    if (shatterElapsed < 0) {
      if (particlesRef.current.length > 0) {
        particlesRef.current = [];
        const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
        const col = geometry.getAttribute("color") as THREE.BufferAttribute;
        for (let i = 0; i < MAX_PARTICLES; i++) {
          pos.setXYZ(i, 0, -200, 0);
          col.setXYZ(i, 0, 0, 0);
        }
        pos.needsUpdate = true;
        col.needsUpdate = true;
        geometry.setDrawRange(0, 0);
      }
      return;
    }

    // Spawn particles per word when its delay hits
    let letterIdx = 0;
    words.forEach((word, wordIdx) => {
      const wordDelay = wordIdx * WORD_STAGGER;
      const wordLetters = letterData.slice(letterIdx, letterIdx + word.length);
      letterIdx += word.length;

      if (shatterElapsed >= wordDelay && !spawnedRef.current.has(wordIdx)) {
        spawnedRef.current.add(wordIdx);

        let cx = 0, cy = 0;
        if (wordLetters.length > 0) {
          cx = wordLetters.reduce((s, l) => s + l.position[0], 0) / wordLetters.length;
          cy = wordLetters[0].position[1];
        }

        const count = Math.min(200, Math.max(80, word.length * 20));
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const upAngle = Math.random() * Math.PI * 0.5;
          const speed = 4 + Math.random() * 10;

          particlesRef.current.push({
            position: new THREE.Vector3(
              cx + (Math.random() - 0.5) * word.length * 0.35,
              cy + (Math.random() - 0.5) * 0.4,
              (Math.random() - 0.5) * 0.4
            ),
            velocity: new THREE.Vector3(
              Math.cos(angle) * Math.cos(upAngle) * speed,
              Math.sin(upAngle) * speed + 2,
              Math.sin(angle) * Math.cos(upAngle) * speed * 0.3
            ),
            life: 200 + Math.random() * 120,
            maxLife: 320,
            size: 0.03 + Math.random() * 0.07,
            color: new THREE.Color("#FF2A55"),
          });
        }
      }
    });

    // Update particles
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
    const col = geometry.getAttribute("color") as THREE.BufferAttribute;
    let alive = 0;

    for (const p of particlesRef.current) {
      if (p.life <= 0) continue;

      p.position.x += p.velocity.x * 0.016;
      p.position.y += p.velocity.y * 0.016;
      p.position.z += p.velocity.z * 0.016;
      p.velocity.y += 0.012;
      p.velocity.multiplyScalar(0.97);
      p.life--;

      const t = 1 - p.life / p.maxLife;

      if (t < 0.15) {
        p.color.lerpColors(new THREE.Color("#FF2A55"), new THREE.Color("#FF6B8A"), t / 0.15);
      } else if (t < 0.4) {
        p.color.lerpColors(new THREE.Color("#FF6B8A"), new THREE.Color("#00F5D4"), (t - 0.15) / 0.25);
      } else if (t < 0.7) {
        p.color.lerpColors(new THREE.Color("#00F5D4"), new THREE.Color("#38BDF8"), (t - 0.4) / 0.3);
      } else {
        p.color.lerpColors(new THREE.Color("#38BDF8"), new THREE.Color("#FFD166"), (t - 0.7) / 0.3);
      }

      const alpha = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;

      pos.setXYZ(alive, p.position.x, p.position.y, p.position.z);
      col.setXYZ(alive, p.color.r * alpha, p.color.g * alpha, p.color.b * alpha);
      alive++;
    }

    for (let i = alive; i < MAX_PARTICLES; i++) {
      pos.setXYZ(i, 0, -200, 0);
      col.setXYZ(i, 0, 0, 0);
    }

    pos.needsUpdate = true;
    col.needsUpdate = true;
    geometry.setDrawRange(0, alive);
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        vertexColors
        size={0.1}
        sizeAttenuation
        transparent
        opacity={1}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

// ── Ambient Floating Particles ─────────────────

function AmbientParticles() {
  const ref = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const count = 250;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = [
      new THREE.Color("#14B8A6"),
      new THREE.Color("#38BDF8"),
      new THREE.Color("#10B981"),
    ];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 16;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 6 - 2;
      const c = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  }, []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    const positions = ref.current.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i++) {
      positions.setY(i, positions.getY(i) + Math.sin(t * 0.5 + i * 0.1) * 0.001);
      positions.setX(i, positions.getX(i) + Math.cos(t * 0.3 + i * 0.05) * 0.0005);
    }
    positions.needsUpdate = true;
  });

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        vertexColors
        size={0.035}
        sizeAttenuation
        transparent
        opacity={0.35}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

// ── Compute letter positions ──────────────────

function computeLetterPositions(text: string): LetterData[] {
  const maxCharsPerLine = 28; // more chars per line for readability
  const letterWidth = 0.36; // tighter
  const spaceWidth = 0.2;
  const lineSpacing = 0.6;
  const letters: LetterData[] = [];

  const displayText = text.length > 140 ? text.slice(0, 137) + "..." : text;
  const words = displayText.split(/(\s+)/);

  let cursorX = 0;
  let cursorY = 0;
  let charCount = 0;
  let lineCharCount = 0;

  for (const segment of words) {
    for (let i = 0; i < segment.length; i++) {
      const ch = segment[i];
      const isSpace = ch === " " || ch === "\n";

      if (ch === "\n" || (!isSpace && lineCharCount >= maxCharsPerLine)) {
        cursorY -= lineSpacing;
        cursorX = 0;
        lineCharCount = 0;
      }

      const w = isSpace ? spaceWidth : letterWidth;

      letters.push({
        char: ch,
        wordIndex: 0,
        position: [cursorX, cursorY, 0],
        width: w,
        seed: charCount * 0.618 + Math.sin(charCount * 1.7) * 0.5,
      });

      cursorX += w;
      charCount++;
      if (!isSpace) lineCharCount++;
    }
  }

  // Center the text block
  if (letters.length > 0) {
    const maxX = Math.max(...letters.map((l) => l.position[0] + l.width));
    const minY = Math.min(...letters.map((l) => l.position[1]));
    const maxY = Math.max(...letters.map((l) => l.position[1]));
    const offsetX = -maxX / 2;
    const offsetY = -(minY + maxY) / 2 + 0.3;

    for (const l of letters) {
      l.position[0] += offsetX;
      l.position[1] += offsetY;
    }
  }

  // Assign word indices
  let wordIdx = 0;
  let inWord = false;
  for (const l of letters) {
    if (l.char === " " || l.char === "\n") {
      inWord = false;
    } else {
      if (!inWord) {
        wordIdx++;
        inWord = true;
      }
      l.wordIndex = wordIdx;
    }
  }

  return letters;
}

// ── Scene Composition ──────────────────────────

function Scene({
  thought,
  tension,
  shatterTrigger,
  showText,
}: {
  thought: string;
  tension: number;
  shatterTrigger: number;
  showText: boolean;
}) {
  const shatterStartRef = useRef<number>(-1);
  const prevTriggerRef = useRef<number>(0);
  const [shatterElapsed, setShatterElapsed] = useState(-1);

  const letterData = useMemo(
    () => (showText && thought ? computeLetterPositions(thought) : []),
    [thought, showText]
  );

  const words = useMemo(() => {
    if (!thought) return [];
    const displayText = thought.length > 140 ? thought.slice(0, 137) + "..." : thought;
    const uniqueWords: string[] = [];
    let lastWord = "";
    for (const ch of displayText) {
      if (ch === " " || ch === "\n") {
        if (lastWord) {
          uniqueWords.push(lastWord);
          lastWord = "";
        }
      } else {
        lastWord += ch;
      }
    }
    if (lastWord) uniqueWords.push(lastWord);
    return uniqueWords;
  }, [thought]);

  useEffect(() => {
    if (shatterTrigger > prevTriggerRef.current) {
      shatterStartRef.current = performance.now() / 1000;
      prevTriggerRef.current = shatterTrigger;
    }
  }, [shatterTrigger]);

  useFrame(() => {
    if (shatterStartRef.current < 0) {
      if (shatterElapsed !== -1) setShatterElapsed(-1);
      return;
    }
    const now = performance.now() / 1000;
    setShatterElapsed(now - shatterStartRef.current);
  });

  const wordDelays = useMemo(() => {
    return words.map((_, i) => i * WORD_STAGGER);
  }, [words]);

  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[5, 5, 5]} intensity={0.8} color="#14B8A6" />
      <pointLight position={[-5, 3, 3]} intensity={0.5} color="#F43F5E" />
      <pointLight position={[0, -3, 2]} intensity={0.3} color="#38BDF8" />
      <color attach="background" args={["#07090E"]} />
      <fog attach="fog" args={["#07090E", 8, 20]} />

      <AmbientParticles />

      {letterData.map((l, i) => (
        <JaggedLetter
          key={`${l.char}-${i}-${thought}`}
          char={l.char}
          position={l.position}
          seed={l.seed}
          tension={tension}
          visible={showText}
          shatterElapsed={shatterElapsed}
          wordDelay={wordDelays[l.wordIndex - 1] ?? 0}
        />
      ))}

      {shatterTrigger > 0 && (
        <WordParticleBurst
          shatterElapsed={shatterElapsed}
          words={words}
          letterData={letterData}
        />
      )}
    </>
  );
}

// ── Exported Canvas Component ──────────────────

export default function ThoughtScene({
  thought,
  tension = 0,
  shatterTrigger = 0,
  showText = true,
}: {
  thought: string;
  tension?: number;
  shatterTrigger?: number;
  showText?: boolean;
}) {
  return (
    <div style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}>
      <Canvas
        camera={{ position: [0, 0, 4.5], fov: 50 }}
        dpr={[1, 2]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
        style={{ background: "#07090E" }}
      >
        <Scene
          thought={thought}
          tension={tension}
          shatterTrigger={shatterTrigger}
          showText={showText}
        />
      </Canvas>
    </div>
  );
}
