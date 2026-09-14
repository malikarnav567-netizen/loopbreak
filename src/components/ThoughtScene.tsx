"use client";

import { useRef, useMemo, useEffect, useState, useCallback } from "react";
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



interface CrackLineData {
  start: THREE.Vector3;
  end: THREE.Vector3;
  seed: number;
  intensity: number;
}

// ── Constants ──────────────────────────────────

const WORD_STAGGER = 0.8; // seconds between each word shattering
const SHATTER_DURATION = 4.0; // seconds for letters to fly apart
const CRACK_MAX_LINES = 40;

// ── Font loader hook ───────────────────────────

let fontLoaded = false;
let fontPromise: Promise<void> | null = null;

function useNeubrutalistFont(): boolean {
  const [loaded, setLoaded] = useState(fontLoaded);

  useEffect(() => {
    if (fontLoaded) {
      setLoaded(true);
      return;
    }
    if (!fontPromise) {
      fontPromise = (async () => {
        try {
          const font = new FontFace(
            "SpaceGrotesk",
            "url(https://fonts.gstatic.com/s/spacegrotesk/v16/V8mDoQDjQSkFtoMM3T6r8E7mPb54C_k3HqUtELg.woff2)",
            { weight: "700" }
          );
          await font.load();
          document.fonts.add(font);
          fontLoaded = true;
        } catch (e) {
          console.warn("Space Grotesk font failed to load, falling back", e);
          fontLoaded = true; // proceed with fallback
        }
      })();
    }
    fontPromise.then(() => setLoaded(true));
  }, []);

  return loaded;
}

// ── Crack Lines Component ──────────────────────

function CrackLines({
  tension,
  letterData,
  shatterTrigger,
  shatterElapsed,
}: {
  tension: number;
  letterData: LetterData[];
  shatterTrigger: number;
  shatterElapsed: number;
}) {
  const ref = useRef<THREE.Group>(null);
  const linesRef = useRef<THREE.LineSegments | null>(null);

  // Compute crack lines based on tension
  const crackLines = useMemo(() => {
    if (letterData.length < 2 || tension < 0.15) return [];

    const lines: CrackLineData[] = [];
    const intensity = Math.max(0, (tension - 0.15) / 0.85); // 0→1 as tension goes 0.15→1

    // How many crack lines to show based on intensity
    const numLines = Math.floor(intensity * CRACK_MAX_LINES);

    // Generate cracks between adjacent letters at word boundaries
    const sorted = [...letterData].sort((a, b) => a.position[0] - b.position[0]);

    for (let i = 0; i < numLines && i < sorted.length - 1; i++) {
      const idx = Math.floor(
        (i / Math.max(1, numLines - 1)) * (sorted.length - 1)
      );
      const l1 = sorted[idx];
      const l2 = sorted[idx + 1];
      if (!l1 || !l2) continue;

      const seed = i * 0.618 + 0.1;
      const midX = (l1.position[0] + l2.position[0]) / 2;
      const midY = (l1.position[1] + l2.position[1]) / 2;

      // Crack radiates from gap between letters
      const crackLen = 0.15 + intensity * 0.6;
      const angle = (seed * 2.39996 + Math.sin(seed * 5) * 0.8) * Math.PI;
      const endX = midX + Math.cos(angle) * crackLen;
      const endY = midY + Math.sin(angle) * crackLen;

      // Branch: add a secondary shorter crack
      const branchAngle = angle + (Math.sin(seed * 7) > 0 ? 0.5 : -0.5);
      const branchLen = crackLen * 0.5;

      lines.push({
        start: new THREE.Vector3(midX, midY, 0.01),
        end: new THREE.Vector3(endX, endY, 0.01),
        seed,
        intensity,
      });
      lines.push({
        start: new THREE.Vector3(endX, endY, 0.01),
        end: new THREE.Vector3(
          endX + Math.cos(branchAngle) * branchLen,
          endY + Math.sin(branchAngle) * branchLen,
          0.01
        ),
        seed: seed + 0.5,
        intensity: intensity * 0.6,
      });
    }

    return lines;
  }, [letterData, tension]);

  // Render crack lines
  useFrame(({ clock }) => {
    if (!ref.current) return;

    // Remove old lines
    if (linesRef.current) {
      ref.current.remove(linesRef.current);
      linesRef.current.geometry.dispose();
      (linesRef.current.material as THREE.Material).dispose();
    }

    if (crackLines.length === 0) return;

    // If shattering has started, fade cracks out
    const shatterFade =
      shatterElapsed > 0 ? Math.max(0, 1 - shatterElapsed / 1.5) : 1;
    if (shatterFade <= 0) return;

    const positions: number[] = [];
    const colors: number[] = [];
    const t = clock.getElapsedTime();

    for (const line of crackLines) {
      // Animate crack endpoints with slight jitter
      const jitterX = Math.sin(t * 8 + line.seed * 10) * 0.005;
      const jitterY = Math.cos(t * 6 + line.seed * 7) * 0.005;

      positions.push(
        line.start.x + jitterX,
        line.start.y + jitterY,
        line.start.z,
        line.end.x + jitterX * 1.5,
        line.end.y + jitterY * 1.5,
        line.end.z
      );

      // Color: white core with cyan/teal glow, pulsing
      const pulse = 0.7 + Math.sin(t * 4 + line.seed * 3) * 0.3;
      const alpha = line.intensity * pulse * shatterFade;

      // White-hot core
      colors.push(1 * alpha, 1 * alpha, 1 * alpha);
      // Cyan glow at end
      colors.push(0 * alpha, 0.96 * alpha, 0.83 * alpha);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(colors, 3)
    );

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9 * shatterFade,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      linewidth: 2,
    });

    const lines = new THREE.LineSegments(geometry, material);
    ref.current.add(lines);
    linesRef.current = lines;
  });

  return <group ref={ref} />;
}

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

  const isShattering = shatterElapsed >= 0 && shatterElapsed >= wordDelay;
  const localElapsed = isShattering ? shatterElapsed - wordDelay : -1;
  const shatterProgress = isShattering
    ? Math.min(1, localElapsed / SHATTER_DURATION)
    : 0;

  // ── Neubrutalist font vibration params ──
  const vibFreqX = 2.2 + seed * 0.8;
  const vibFreqY = 2.8 + seed * 0.6;
  const vibFreqRot = 1.5 + seed * 0.5;
  const vibPhaseX = seed * 2.1;
  const vibPhaseY = seed * 3.4;
  const vibPhaseRot = seed * 1.7;

  // Create canvas texture with Space Grotesk (neubrutalist)
  useEffect(() => {
    if (!visible || (isShattering && shatterProgress >= 0.95)) {
      setTexture(null);
      return;
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const size = 128;
    canvas.width = size;
    canvas.height = size;
    ctx.clearRect(0, 0, size, size);

    const fontSize = char === " " ? 10 : 58;

    // Use Space Grotesk if loaded, fallback to sans-serif
    const fontFamily = fontLoaded
      ? '"SpaceGrotesk", "Space Grotesk", "SF Mono", system-ui, sans-serif'
      : '"Space Grotesk", system-ui, sans-serif';

    ctx.font = `700 ${fontSize}px ${fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    let glowColor: string;
    let fillColor: string;

    if (isShattering && shatterProgress > 0 && shatterProgress < 0.25) {
      // Flash white at fracture moment
      glowColor = "#FFFFFF";
      fillColor = "#FFFFFF";
      ctx.shadowBlur = 40 + shatterProgress * 60;
    } else if (isShattering) {
      // Shift to cyan/teal during dissolution
      glowColor = "#00F5D4";
      fillColor = "#B0F5E8";
      ctx.shadowBlur = 25 * (1 - shatterProgress);
    } else {
      // Normal: amber base → crimson as tension rises
      glowColor = tension > 0.5 ? "#FF2A55" : "#F59E0B";
      fillColor = tension > 0.5 ? "#FFD6D6" : "#FFF7E6";
      ctx.shadowBlur = 12 + tension * 18;
    }

    ctx.shadowColor = glowColor;
    ctx.fillStyle = fillColor;

    if (char !== " ") {
      ctx.fillText(char, size / 2, size / 2);
      // Double-pass for stronger glow
      ctx.shadowBlur = 6 + tension * 8;
      ctx.fillText(char, size / 2, size / 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    setTexture(tex);

    return () => tex.dispose();
  }, [char, visible, tension > 0.5, isShattering, Math.floor(shatterProgress * 4), fontLoaded]);

  // Per-frame animation
  useFrame(({ clock }) => {
    if (!meshRef.current || !visible) return;
    const t = clock.getElapsedTime();

    if (isShattering) {
      const speed = 2.5 + seed * 0.5;
      const direction = new THREE.Vector3(
        Math.cos(seed * 3.7) * speed,
        Math.sin(seed * 2.3) * speed * 0.4 + 2.5,
        Math.sin(seed * 5.1) * speed * 0.2
      );

      const easeOut = 1 - Math.pow(1 - shatterProgress, 3);

      meshRef.current.position.x = position[0] + direction.x * easeOut;
      meshRef.current.position.y = position[1] + direction.y * easeOut;
      meshRef.current.position.z = position[2] + direction.z * easeOut;

      // Slow visible spin during shatter
      meshRef.current.rotation.x += 0.035 * (seed + 1);
      meshRef.current.rotation.y += 0.025 * (seed + 1);
      meshRef.current.rotation.z += 0.02 * (seed + 1);

      // Fade out
      const fade = Math.max(0, 1 - shatterProgress * 1.05);
      meshRef.current.scale.setScalar(fade);
      if (matRef.current) matRef.current.opacity = fade;
      return;
    }

    // ── Jagged vibration — readable but visually tense ──
    const baseJitter = 0.006 + tension * 0.018;
    const jitterX = Math.sin(t * vibFreqX + vibPhaseX) * baseJitter;
    const jitterY = Math.cos(t * vibFreqY + vibPhaseY) * baseJitter * 0.5;
    const jitterRot =
      Math.sin(t * vibFreqRot + vibPhaseRot) * baseJitter * 0.06;

    // Micro-jitter: subtle high-freq twitch
    const microJitter = Math.sin(t * 8 + seed * 13) * 0.0015 * tension;

    meshRef.current.position.x = position[0] + jitterX + microJitter;
    meshRef.current.position.y = position[1] + jitterY;
    meshRef.current.position.z = position[2];
    meshRef.current.rotation.z = jitterRot;
    meshRef.current.rotation.x = Math.sin(t * 1.5 + seed * 9) * 0.006 * tension;

    // Gentle scale pulse
    const scalePulse = 1 + Math.sin(t * 1.8 + seed * 2) * 0.012 * tension;
    meshRef.current.scale.setScalar(scalePulse);
  });

  if (!visible || !texture) return null;

  const isSpace = char === " ";
  const width = isSpace ? 0.26 : 0.38;
  const height = 0.52;

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

// ── Firework Particle Burst ─────────────────
// Particles shoot upward like fireworks, arc, then rain down to the bottom

interface FireworkParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
  trail: THREE.Vector3[]; // last N positions for trail effect
}

// Real firework color palettes — gold, red, green, blue, white/silver
const FIREWORK_PALETTES = [
  // Classic gold/amber burst
  [new THREE.Color("#FFD700"), new THREE.Color("#FFA500"), new THREE.Color("#FF8C00"), new THREE.Color("#FFEC8B")],
  // Red/orange burst
  [new THREE.Color("#FF4500"), new THREE.Color("#FF6347"), new THREE.Color("#DC143C"), new THREE.Color("#FFCCCB")],
  // White/silver burst
  [new THREE.Color("#FFFFFF"), new THREE.Color("#E8E8E8"), new THREE.Color("#C0C0C0"), new THREE.Color("#F5F5F5")],
  // Green burst
  [new THREE.Color("#00FF7F"), new THREE.Color("#32CD32"), new THREE.Color("#00FF00"), new THREE.Color("#90EE90")],
  // Blue burst
  [new THREE.Color("#1E90FF"), new THREE.Color("#00BFFF"), new THREE.Color("#4169E1"), new THREE.Color("#87CEEB")],
  // Warm gold+red mix (double burst feel)
  [new THREE.Color("#FFD700"), new THREE.Color("#FF4500"), new THREE.Color("#FFA500"), new THREE.Color("#FFEC8B")],
];

const FIREWORK_MAX = 4000;
const GRAVITY = -1.8; // gentle gravity — particles arc high, then slowly rain down to the bottom
const TRAIL_LENGTH = 4;

function FireworkBurst({
  shatterElapsed,
  words,
  letterData,
}: {
  shatterElapsed: number;
  words: string[];
  letterData: LetterData[];
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const trailPointsRef = useRef<THREE.Points>(null);
  const particlesRef = useRef<FireworkParticle[]>([]);
  const spawnedRef = useRef<Set<number>>(new Set());

  // Main particles geometry
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(FIREWORK_MAX * 3), 3)
    );
    geo.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(FIREWORK_MAX * 3), 3)
    );
    return geo;
  }, []);

  // Trail particles (ghost copies for streak effect)
  const trailGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const trailMax = FIREWORK_MAX * TRAIL_LENGTH;
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(trailMax * 3), 3)
    );
    geo.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(trailMax * 3), 3)
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
        for (let i = 0; i < FIREWORK_MAX; i++) {
          pos.setXYZ(i, 0, -200, 0);
          col.setXYZ(i, 0, 0, 0);
        }
        pos.needsUpdate = true;
        col.needsUpdate = true;
        geometry.setDrawRange(0, 0);

        const tpos = trailGeometry.getAttribute("position") as THREE.BufferAttribute;
        const tcol = trailGeometry.getAttribute("color") as THREE.BufferAttribute;
        for (let i = 0; i < FIREWORK_MAX * TRAIL_LENGTH; i++) {
          tpos.setXYZ(i, 0, -200, 0);
          tcol.setXYZ(i, 0, 0, 0);
        }
        tpos.needsUpdate = true;
        tcol.needsUpdate = true;
        trailGeometry.setDrawRange(0, 0);
      }
      return;
    }

    // ── Spawn firework particles per word ──
    let letterIdx = 0;
    words.forEach((word, wordIdx) => {
      const wordDelay = wordIdx * WORD_STAGGER;
      const wordLetters = letterData.slice(letterIdx, letterIdx + word.length);
      letterIdx += word.length;

      if (shatterElapsed >= wordDelay && !spawnedRef.current.has(wordIdx)) {
        spawnedRef.current.add(wordIdx);

        // Word center position
        let cx = 0, cy = 0;
        if (wordLetters.length > 0) {
          cx = wordLetters.reduce((s, l) => s + l.position[0], 0) / wordLetters.length;
          cy = wordLetters.reduce((s, l) => s + l.position[1], 0) / wordLetters.length;
        }

        // Pick a random firework palette for this word
        const palette = FIREWORK_PALETTES[wordIdx % FIREWORK_PALETTES.length];

        // Main burst: particles shoot UPWARD and outward like fireworks
        const count = Math.min(350, Math.max(120, word.length * 30));
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2; // radial spread
          const upSpeed = 3 + Math.random() * 5; // moderate upward — stay in view
          const radialSpeed = 2 + Math.random() * 7; // wide horizontal spread
          const depth = (Math.random() - 0.5) * 1.5;

          // Pick random color from this word's palette
          const color = palette[Math.floor(Math.random() * palette.length)].clone();

          particlesRef.current.push({
            position: new THREE.Vector3(
              cx + (Math.random() - 0.5) * 0.5,
              cy + (Math.random() - 0.5) * 0.3,
              depth
            ),
            velocity: new THREE.Vector3(
              Math.cos(angle) * radialSpeed,
              upSpeed,
              Math.sin(angle) * radialSpeed * 0.3
            ),
            life: 600 + Math.random() * 600,
            maxLife: 1200,
            size: 0.04 + Math.random() * 0.08,
            color,
            trail: [],
          });
        }

        // Secondary sparkle burst (smaller, faster sparks)
        for (let i = 0; i < 40; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 3 + Math.random() * 6;
          const color = palette[Math.floor(Math.random() * palette.length)].clone();

          particlesRef.current.push({
            position: new THREE.Vector3(cx, cy, 0),
            velocity: new THREE.Vector3(
              Math.cos(angle) * speed,
              speed * 0.8 + 4,
              Math.sin(angle) * speed * 0.2
            ),
            life: 200 + Math.random() * 300,
            maxLife: 500,
            size: 0.02 + Math.random() * 0.03,
            color,
            trail: [],
          });
        }
      }
    });

    // ── Update particles with firework physics ──
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
    const col = geometry.getAttribute("color") as THREE.BufferAttribute;
    const tpos = trailGeometry.getAttribute("position") as THREE.BufferAttribute;
    const tcol = trailGeometry.getAttribute("color") as THREE.BufferAttribute;
    let alive = 0;
    let trailIdx = 0;

    for (const p of particlesRef.current) {
      if (p.life <= 0) continue;

      // Save trail position before updating
      p.trail.push(p.position.clone());
      if (p.trail.length > TRAIL_LENGTH) p.trail.shift();

      // Physics: velocity + gravity + drag
      p.position.x += p.velocity.x * 0.016;
      p.position.y += p.velocity.y * 0.016;
      p.position.z += p.velocity.z * 0.016;
      p.velocity.y += GRAVITY * 0.016; // gravity pulls DOWN      p.velocity.x *= 0.988; // air resistance
          p.velocity.z *= 0.988;
          p.velocity.y *= 0.996; // minimal Y drag so particles fall far
      p.life--;

      const t = 1 - p.life / p.maxLife; // 0→1 over lifetime

      // Color lifecycle: bright burst → warm glow → cool fade
      const baseColor = p.color;
      if (t < 0.1) {
        // Initial flash: white-hot
        const flash = new THREE.Color(1, 1, 1);
        pos.setXYZ(alive, p.position.x, p.position.y, p.position.z);
        col.setXYZ(alive, flash.r, flash.g, flash.b);
      } else if (t < 0.3) {
        // Bright burst phase: particle's own color at full brightness
        const brightness = 1.0 - (t - 0.1) * 2; // 1→0.6
        pos.setXYZ(alive, p.position.x, p.position.y, p.position.z);
        col.setXYZ(alive, baseColor.r * brightness + 0.3, baseColor.g * brightness + 0.2, baseColor.b * brightness + 0.2);
      } else if (t < 0.6) {
        // Cooling: particle's base color, slightly dimmer
        const dim = 1.0 - (t - 0.3);
        pos.setXYZ(alive, p.position.x, p.position.y, p.position.z);
        col.setXYZ(alive, baseColor.r * dim, baseColor.g * dim, baseColor.b * dim);
      } else {
        // Fading: ember glow as they fall
        const fade = Math.max(0, 1.0 - (t - 0.6) / 0.4);
        const ember = new THREE.Color(baseColor.r * 0.6, baseColor.g * 0.3, baseColor.b * 0.1);
        pos.setXYZ(alive, p.position.x, p.position.y, p.position.z);
        col.setXYZ(alive, ember.r * fade, ember.g * fade, ember.b * fade);
      }
      alive++;

      // Write trail positions (fading ghost copies behind the particle)
      for (let ti = 0; ti < p.trail.length; ti++) {
        const trailAge = (p.trail.length - ti) / p.trail.length;
        const trailAlpha = trailAge * (1 - t) * 0.4; // dimmer than main particle
        const tp = p.trail[ti];
        tpos.setXYZ(trailIdx, tp.x, tp.y, tp.z);
        tcol.setXYZ(
          trailIdx,
          baseColor.r * trailAlpha,
          baseColor.g * trailAlpha,
          baseColor.b * trailAlpha
        );
        trailIdx++;
      }
    }

    // Clear unused slots
    for (let i = alive; i < FIREWORK_MAX; i++) {
      pos.setXYZ(i, 0, -200, 0);
      col.setXYZ(i, 0, 0, 0);
    }
    for (let i = trailIdx; i < FIREWORK_MAX * TRAIL_LENGTH; i++) {
      tpos.setXYZ(i, 0, -200, 0);
      tcol.setXYZ(i, 0, 0, 0);
    }

    pos.needsUpdate = true;
    col.needsUpdate = true;
    geometry.setDrawRange(0, alive);
    tpos.needsUpdate = true;
    tcol.needsUpdate = true;
    trailGeometry.setDrawRange(0, trailIdx);
  });

  return (
    <group>
      {/* Main firework particles */}
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
      {/* Trail streaks behind each particle */}
      <points ref={trailPointsRef} geometry={trailGeometry}>
        <pointsMaterial
          vertexColors
          size={0.06}
          sizeAttenuation
          transparent
          opacity={0.8}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </group>
  );
}

// ── Ambient Floating Particles ─────────────────

function AmbientParticles() {
  const ref = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const count = 300;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = [
      new THREE.Color("#FFDE4D"),
      new THREE.Color("#8B4049"),
      new THREE.Color("#3B5998"),
      new THREE.Color("#FFFFFF"),
    ];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 18;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 12;
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
        size={0.03}
        sizeAttenuation
        transparent
        opacity={0.3}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

// ── Compute letter positions ──────────────────

function computeLetterPositions(text: string): LetterData[] {
  const maxCharsPerLine = 26;
  const letterWidth = 0.38; // Space Grotesk — slightly more room
  const spaceWidth = 0.22;
  const lineSpacing = 0.62;
  const letters: LetterData[] = [];

  const displayText =
    text.length > 140 ? text.slice(0, 137) + "..." : text;
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
    const maxX = Math.max(
      ...letters.map((l) => l.position[0] + l.width)
    );
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
    const displayText =
      thought.length > 140 ? thought.slice(0, 137) + "..." : thought;
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
      <ambientLight intensity={0.4} />
      <pointLight position={[5, 5, 5]} intensity={0.8} color="#FFDE4D" />
      <pointLight position={[-5, 3, 3]} intensity={0.5} color="#8B4049" />
      <pointLight position={[0, -3, 2]} intensity={0.3} color="#3B5998" />
      <color attach="background" args={["#0A0A0A"]} />
      <fog attach="fog" args={["#0A0A0A", 14, 30]} />

      <AmbientParticles />

      {/* Crack lines — appear as tension builds, fade during shatter */}
      <CrackLines
        tension={tension}
        letterData={letterData}
        shatterTrigger={shatterTrigger}
        shatterElapsed={shatterElapsed}
      />

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
        <FireworkBurst
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
  // Preload Space Grotesk font for 3D canvas
  useNeubrutalistFont();

  return (
    <div style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}>        <Canvas
        camera={{ position: [0, -1.5, 6], fov: 60 }}
        dpr={[1, 2]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
        style={{ background: "#0A0A0A" }}
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
