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
  seed: number; // unique seed for vibration variation
}

interface ParticleData {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
}

// ── Jagged vibrating letter mesh ──────────────

function JaggedLetter({
  char,
  position,
  seed,
  tension,
  visible,
  shatterTime,
  wordShatterDelay,
}: {
  char: string;
  position: [number, number, number];
  seed: number;
  tension: number;
  visible: boolean;
  shatterTime: number; // when this word starts shattering
  wordShatterDelay: number; // 0 = not shattering yet, >0 = seconds since shatter start
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  // Vibration params unique to this letter
  const vibFreqX = 10 + seed * 7.3;
  const vibFreqY = 13 + seed * 5.7;
  const vibFreqRot = 8 + seed * 4.1;
  const vibPhaseX = seed * 2.1;
  const vibPhaseY = seed * 3.4;
  const vibPhaseRot = seed * 1.7;

  // Create canvas texture for this single character
  useEffect(() => {
    if (!visible) {
      setTexture(null);
      return;
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const size = 128;
    canvas.width = size;
    canvas.height = size;

    ctx.clearRect(0, 0, size, size);

    const fontSize = char === " " ? 10 : 56;
    ctx.font = `800 ${fontSize}px "Plus Jakarta Sans", "Inter", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Glow layer — crimson/amber based on tension
    const glowColor = tension > 0.5 ? "#FF2A55" : "#F59E0B";
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 12 + tension * 25;
    ctx.fillStyle = tension > 0.5 ? "#FFD6D6" : "#FFF7E6";

    if (char !== " ") {
      ctx.fillText(char, size / 2, size / 2);
      // Sharper pass on top
      ctx.shadowBlur = 3 + tension * 8;
      ctx.fillText(char, size / 2, size / 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    setTexture(tex);

    return () => {
      tex.dispose();
    };
  }, [char, visible, tension > 0.5]); // only re-render texture when tension crosses threshold

  // Per-frame vibration
  useFrame(({ clock }) => {
    if (!meshRef.current || !visible) return;
    const t = clock.getElapsedTime();

    // If this word is currently shattering, fly apart
    if (wordShatterDelay > 0) {
      const elapsed = wordShatterDelay;
      const flySpeed = 3 + seed * 0.5;
      meshRef.current.position.x = position[0] + (Math.random() - 0.5) * elapsed * flySpeed;
      meshRef.current.position.y = position[1] + elapsed * (2 + seed * 0.3);
      meshRef.current.position.z = position[2] + (Math.random() - 0.5) * elapsed * 2;
      meshRef.current.rotation.x += 0.05 * (seed + 1);
      meshRef.current.rotation.y += 0.03 * (seed + 1);
      meshRef.current.rotation.z += 0.04 * (seed + 1);
      // Scale down as it flies away
      const fade = Math.max(0, 1 - elapsed * 0.8);
      meshRef.current.scale.setScalar(fade);
      if (matRef.current) matRef.current.opacity = fade;
      return;
    }

    // Normal jagged vibration
    const baseJitter = 0.015 + tension * 0.06;
    const jitterX = Math.sin(t * vibFreqX + vibPhaseX) * baseJitter * (1 + seed * 0.3);
    const jitterY = Math.cos(t * vibFreqY + vibPhaseY) * baseJitter * 0.6;
    const jitterRot = Math.sin(t * vibFreqRot + vibPhaseRot) * baseJitter * 0.15;

    // Add high-frequency micro-jitter for "jagged" feel
    const microJitter = Math.sin(t * 47 + seed * 13) * 0.005 * tension;

    meshRef.current.position.x = position[0] + jitterX + microJitter;
    meshRef.current.position.y = position[1] + jitterY;
    meshRef.current.position.z = position[2];
    meshRef.current.rotation.z = jitterRot;
    meshRef.current.rotation.x = Math.sin(t * 6 + seed * 9) * 0.02 * tension;

    // Scale pulsing
    const scalePulse = 1 + Math.sin(t * 4 + seed * 2) * 0.03 * tension;
    meshRef.current.scale.setScalar(scalePulse);
  });

  if (!visible || !texture) return null;

  const isSpace = char === " ";
  const width = isSpace ? 0.22 : 0.42;
  const height = 0.55;

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

// ── Word-level particle shatter ────────────────

function WordParticleShatter({
  shatterTrigger,
  words,
  letterData,
}: {
  shatterTrigger: number;
  words: string[];
  letterData: LetterData[];
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const particlesRef = useRef<ParticleData[]>([]);
  const startTimeRef = useRef(0);
  const WORD_DELAY = 0.35; // seconds between each word fracturing

  const MAX_PARTICLES = 2000;

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
    if (shatterTrigger === 0) return;

    startTimeRef.current = performance.now() / 1000;
    const allParticles: ParticleData[] = [];

    // Group letters by word
    let letterIdx = 0;
    words.forEach((word, wordIdx) => {
      const wordLetters = letterData.slice(
        letterIdx,
        letterIdx + word.length
      );
      letterIdx += word.length;

      // Center of this word
      const wordCenterX =
        wordLetters.length > 0
          ? (wordLetters[0].position[0] +
              wordLetters[wordLetters.length - 1].position[0]) /
            2
          : 0;
      const wordCenterY =
        wordLetters.length > 0 ? wordLetters[0].position[1] : 0;

      // ~120 particles per word
      const particlesPerWord = Math.min(150, Math.max(60, word.length * 15));

      for (let i = 0; i < particlesPerWord; i++) {
        const angle = Math.random() * Math.PI * 2;
        const upAngle = Math.random() * Math.PI * 0.4;
        const speed = 3 + Math.random() * 9;
        const lifeBase = 160 + Math.random() * 120;

        allParticles.push({
          position: new THREE.Vector3(
            wordCenterX + (Math.random() - 0.5) * word.length * 0.4,
            wordCenterY + (Math.random() - 0.5) * 0.4,
            (Math.random() - 0.5) * 0.3
          ),
          velocity: new THREE.Vector3(
            Math.cos(angle) * Math.cos(upAngle) * speed,
            Math.sin(upAngle) * speed + 1.5,
            Math.sin(angle) * Math.cos(upAngle) * speed * 0.2
          ),
          life: lifeBase,
          maxLife: lifeBase,
          size: 0.02 + Math.random() * 0.06,
          // Start crimson, shift to teal/cyan as they age
          color: new THREE.Color("#FF2A55"),
        });
      }
    });

    particlesRef.current = allParticles;
  }, [shatterTrigger, words, letterData]);

  useFrame(() => {
    if (particlesRef.current.length === 0) return;
    const now = performance.now() / 1000;
    const elapsed = now - startTimeRef.current;

    const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
    const col = geometry.getAttribute("color") as THREE.BufferAttribute;
    let alive = 0;

    particlesRef.current.forEach((p) => {
      if (p.life <= 0) return;

      p.position.x += p.velocity.x * 0.016;
      p.position.y += p.velocity.y * 0.016;
      p.position.z += p.velocity.z * 0.016;

      // Upward thermal buoyancy
      p.velocity.y += 0.008;
      // Drag
      p.velocity.multiplyScalar(0.972);

      p.life--;

      const t = 1 - p.life / p.maxLife;

      // Color transition: crimson → cyan/teal → gold/prismatic
      if (t < 0.2) {
        p.color.lerpColors(
          new THREE.Color("#FF2A55"),
          new THREE.Color("#FF6B8A"),
          t / 0.2
        );
      } else if (t < 0.5) {
        p.color.lerpColors(
          new THREE.Color("#FF6B8A"),
          new THREE.Color("#00F5D4"),
          (t - 0.2) / 0.3
        );
      } else {
        p.color.lerpColors(
          new THREE.Color("#00F5D4"),
          new THREE.Color("#FFD166"),
          (t - 0.5) / 0.5
        );
      }

      // Fade out in last 20%
      const alpha = t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1;

      pos.setXYZ(alive, p.position.x, p.position.y, p.position.z);
      col.setXYZ(alive, p.color.r * alpha, p.color.g * alpha, p.color.b * alpha);
      alive++;
    });

    for (let i = alive; i < MAX_PARTICLES; i++) {
      pos.setXYZ(i, 0, -100, 0);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    geometry.setDrawRange(0, alive);
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        vertexColors
        size={0.08}
        sizeAttenuation
        transparent
        opacity={0.95}
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
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  }, []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    const positions = ref.current.geometry.getAttribute(
      "position"
    ) as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i++) {
      positions.setY(
        i,
        positions.getY(i) + Math.sin(t * 0.5 + i * 0.1) * 0.001
      );
      positions.setX(
        i,
        positions.getX(i) + Math.cos(t * 0.3 + i * 0.05) * 0.0005
      );
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
  const maxCharsPerLine = 24;
  const letterWidth = 0.42;
  const spaceWidth = 0.22;
  const lineSpacing = 0.7;
  const letters: LetterData[] = [];

  const displayText =
    text.length > 120 ? text.slice(0, 117) + "..." : text;
  const words = displayText.split(/(\s+)/); // preserve spaces

  let cursorX = 0;
  let cursorY = 0;
  let charCount = 0;
  let lineCharCount = 0;

  for (const segment of words) {
    for (let i = 0; i < segment.length; i++) {
      const ch = segment[i];
      const isSpace = ch === " " || ch === "\n";

      if (ch === "\n" || (!isSpace && lineCharCount >= maxCharsPerLine)) {
        // New line
        cursorY -= lineSpacing;
        cursorX = 0;
        lineCharCount = 0;
      }

      const w = isSpace ? spaceWidth : letterWidth;

      letters.push({
        char: ch,
        wordIndex: 0, // will be set below
        position: [cursorX, cursorY, 0],
        width: w,
        seed: charCount * 0.618 + Math.sin(charCount * 1.7) * 0.5, // golden-ratio-based unique seed
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

  // Assign word indices — track which word each non-space letter belongs to
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
  const letterData = useMemo(
    () => (showText && thought ? computeLetterPositions(thought) : []),
    [thought, showText]
  );

  // Get unique words with their indices
  const words = useMemo(() => {
    if (!thought) return [];
    const displayText =
      thought.length > 120 ? thought.slice(0, 117) + "..." : thought;
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

  // Track shatter start time per word
  const wordShatterTimes = useMemo(() => {
    if (shatterTrigger === 0) return {};
    const times: Record<number, number> = {};
    words.forEach((_, i) => {
      times[i + 1] = i * 0.35; // 350ms stagger between words
    });
    return times;
  }, [shatterTrigger, words]);

  // Compute per-letter shatter delay
  const letterShatterData = useMemo(() => {
    return letterData.map((l) => ({
      ...l,
      wordShatterDelay:
        shatterTrigger > 0 && l.wordIndex > 0
          ? (wordShatterTimes[l.wordIndex] || 0)
          : 0,
    }));
  }, [letterData, shatterTrigger, wordShatterTimes]);

  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[5, 5, 5]} intensity={0.8} color="#14B8A6" />
      <pointLight position={[-5, 3, 3]} intensity={0.5} color="#F43F5E" />
      <pointLight position={[0, -3, 2]} intensity={0.3} color="#38BDF8" />
      <color attach="background" args={["#07090E"]} />
      <fog attach="fog" args={["#07090E", 8, 20]} />

      <AmbientParticles />

      {/* Individual jagged letters */}
      {letterShatterData.map((l, i) => (
        <JaggedLetter
          key={`${l.char}-${i}-${thought}`}
          char={l.char}
          position={l.position}
          seed={l.seed}
          tension={tension}
          visible={showText}
          shatterTime={shatterTrigger > 0 ? performance.now() / 1000 : 0}
          wordShatterDelay={l.wordShatterDelay}
        />
      ))}

      {/* Word-by-word particle shatter */}
      {shatterTrigger > 0 && (
        <WordParticleShatter
          shatterTrigger={shatterTrigger}
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
