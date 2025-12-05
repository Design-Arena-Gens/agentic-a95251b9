"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { createNoise3D } from "simplex-noise";

type PromptFeatures = {
  palette: string[];
  motionStyle: "wave" | "particle" | "burst" | "nebula";
  particleCount: number;
  waveHeight: number;
  warpFactor: number;
  sparkle: boolean;
  grain: number;
  speed: number;
  mood: "calm" | "dynamic" | "dreamy" | "intense";
};

const keywordPalettes: Record<string, string[]> = {
  ocean: ["#0ea5e9", "#22d3ee", "#2563eb", "#0f172a"],
  aurora: ["#7c3aed", "#22d3ee", "#22c55e", "#0f172a"],
  fire: ["#f97316", "#ef4444", "#facc15", "#7f1d1d"],
  neon: ["#f472b6", "#22d3ee", "#a855f7", "#1f2937"],
  forest: ["#15803d", "#4ade80", "#0f766e", "#0b1120"],
  desert: ["#f59e0b", "#fcd34d", "#f97316", "#1f2937"],
  cosmic: ["#38bdf8", "#6366f1", "#a855f7", "#020617"],
  cyber: ["#22d3ee", "#06b6d4", "#facc15", "#082f49"],
  dream: ["#f9a8d4", "#c084fc", "#60a5fa", "#1f1b3a"],
  storm: ["#38bdf8", "#1d4ed8", "#0f172a", "#1e293b"],
  zen: ["#10b981", "#34d399", "#22d3ee", "#0f172a"]
};

const keywordStyles: Record<
  string,
  Partial<Omit<PromptFeatures, "palette">>
> = {
  ocean: { motionStyle: "wave", mood: "calm", waveHeight: 0.9 },
  aurora: { motionStyle: "nebula", mood: "dreamy", warpFactor: 1.1 },
  fire: { motionStyle: "burst", mood: "intense", sparkle: true, speed: 1.4 },
  neon: { motionStyle: "particle", mood: "dynamic", sparkle: true },
  forest: { motionStyle: "wave", mood: "calm", particleCount: 120 },
  cosmic: { motionStyle: "nebula", mood: "dreamy", warpFactor: 1.4 },
  cyber: { motionStyle: "particle", mood: "dynamic", speed: 1.3 },
  dream: { motionStyle: "nebula", mood: "dreamy", sparkle: true, grain: 0.45 },
  storm: { motionStyle: "burst", mood: "intense", particleCount: 180 },
  zen: { motionStyle: "wave", mood: "calm", speed: 0.7 }
};

function hashPrompt(prompt: string): number {
  let hash = 2166136261;
  for (let i = 0; i < prompt.length; i += 1) {
    hash ^= prompt.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generatePalette(seed: number): string[] {
  const random = mulberry32(seed);
  const colors: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    const hue = Math.floor(random() * 360);
    const saturation = 40 + Math.floor(random() * 45);
    const lightness = 35 + Math.floor(random() * 35);
    colors.push(`hsl(${hue}deg ${saturation}% ${lightness}%)`);
  }
  return colors;
}

function extractFeatures(prompt: string): PromptFeatures {
  const normalized = prompt.toLowerCase();
  const hash = hashPrompt(normalized || "default");
  const keywords = Object.keys(keywordPalettes).filter((keyword) =>
    normalized.includes(keyword)
  );

  const basePalette =
    keywords.length > 0
      ? keywordPalettes[keywords[0]]
      : generatePalette(hash ^ 0x9e3779b1);

  const features: PromptFeatures = {
    palette: basePalette,
    motionStyle: "wave",
    particleCount: 150,
    waveHeight: 0.7,
    warpFactor: 1.0,
    sparkle: false,
    grain: 0.35,
    speed: 1.0,
    mood: "dreamy"
  };

  keywords.forEach((keyword) => {
    const overrides = keywordStyles[keyword];
    if (!overrides) return;
    Object.assign(features, overrides);
  });

  features.particleCount = Math.max(
    80,
    Math.min(
      260,
      features.particleCount +
        Math.floor(((hash & 0xff) / 255) * 60 - 30)
    )
  );

  features.speed *= 0.8 + ((hash >>> 8) & 0xff) / 255;

  return features;
}

const STAGES = [
  "Parsing cinematic intent",
  "Designing volumetric scene",
  "Animating neural keyframes",
  "Applying cinematic grade",
  "Rendering final sequence"
];

const CANVAS_WIDTH = 896;
const CANVAS_HEIGHT = 504;
const VIDEO_DURATION_MS = 5200;
const FPS = 30;

export default function HomePage() {
  const [prompt, setPrompt] = useState(
    "An aurora lights up a futuristic city skyline reflected on water"
  );
  const [videoUrl, setVideoUrl] = useState<string>();
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState(STAGES[0]);
  const [error, setError] = useState<string>();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const animationRef = useRef<number>();

  const previewFeatures = useMemo(() => extractFeatures(prompt), [prompt]);

  const drawFrame = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      noise3D: (x: number, y: number, z: number) => number,
      features: PromptFeatures,
      elapsed: number,
      progress: number
    ) => {
      const {
        palette,
        motionStyle,
        waveHeight,
        particleCount,
        sparkle,
        grain,
        warpFactor,
        speed,
        mood
      } = features;

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      gradient.addColorStop(0, palette[0]);
      gradient.addColorStop(0.4, palette[1]);
      gradient.addColorStop(0.75, palette[2]);
      gradient.addColorStop(1, palette[3]);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.save();
      ctx.globalCompositeOperation = "screen";

      const time = elapsed * 0.001 * speed;
      const layerCount = 5;
      for (let layer = 0; layer < layerCount; layer += 1) {
        const amplitude =
          waveHeight * 50 * (1 - layer / layerCount) + layer * 6;
        ctx.beginPath();
        for (let x = 0; x <= CANVAS_WIDTH; x += 6) {
          const nx = x / CANVAS_WIDTH;
          const noiseVal =
            noise3D(
              nx * 1.6 + layer * 0.2,
              time * 0.8 + layer * 0.5,
              layer * 0.3
            ) * amplitude;
          const waveY =
            CANVAS_HEIGHT * 0.65 +
            noiseVal +
            Math.sin(nx * Math.PI * 2 + time * warpFactor) *
              amplitude *
              0.4;
          if (x === 0) {
            ctx.moveTo(x, waveY);
          } else {
            ctx.lineTo(x, waveY);
          }
        }
        ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.lineTo(0, CANVAS_HEIGHT);
        ctx.closePath();
        const colorIndex = layer % palette.length;
        ctx.fillStyle = palette[colorIndex] + "66";
        ctx.fill();
      }

      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const particles = particleCount;
      for (let i = 0; i < particles; i += 1) {
        const seedOffset = i * 13.37;
        const angle =
          noise3D(i * 0.05, time * 0.3, seedOffset) *
            Math.PI *
            (motionStyle === "burst" ? 6 : 2) +
          time * (motionStyle === "particle" ? 1.4 : 0.5);
        const radius =
          ((noise3D(i * 0.3, time * 0.6 + seedOffset, seedOffset * 0.2) + 1) /
            2) *
          (CANVAS_WIDTH * 0.5);
        const centerX = CANVAS_WIDTH / 2;
        const centerY =
          CANVAS_HEIGHT *
          (motionStyle === "wave" ? 0.55 : motionStyle === "nebula" ? 0.5 : 0.6);
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius * 0.6;
        const size =
          ((noise3D(seedOffset, time * 0.8, i * 0.08) + 1.4) /
            2.4) *
          (motionStyle === "burst" ? 6 : 3);

        const color = palette[i % palette.length];
        ctx.fillStyle = color + "aa";
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();

        if (sparkle && i % 16 === 0) {
          ctx.strokeStyle = color + "66";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x - size * 2, y);
          ctx.lineTo(x + size * 2, y);
          ctx.moveTo(x, y - size * 2);
          ctx.lineTo(x, y + size * 2);
          ctx.stroke();
        }
      }
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.09 + grain * 0.06;
      ctx.globalCompositeOperation = mood === "intense" ? "difference" : "overlay";
      for (let i = 0; i < 60; i += 1) {
        const x = Math.random() * CANVAS_WIDTH;
        const y = Math.random() * CANVAS_HEIGHT;
        ctx.fillStyle = `rgba(8, 11, 26, ${0.3 + Math.random() * 0.3})`;
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.restore();
    },
    []
  );

  const stopAnimation = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  }, []);

  const resetRecorder = useCallback(() => {
    stopAnimation();
    recorderRef.current?.stop();
    recorderRef.current = null;
    chunksRef.current = [];
  }, [stopAnimation]);

  const generateVideo = useCallback(
    async (promptSource: string) => {
      if (!canvasRef.current) return;

      setIsGenerating(true);
    setStatus(STAGES[0]);
    setError(undefined);
    setVideoUrl(undefined);

    await new Promise((resolve) => setTimeout(resolve, 120));
    setStatus(STAGES[1]);

    const canvas = canvasRef.current;
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Canvas rendering is not supported in this environment.");
      setIsGenerating(false);
      return;
    }

      const hash = hashPrompt(promptSource);
      const seededRandom = mulberry32(hash | 0xa53b1);
      const noise3D = createNoise3D(seededRandom);
      const activeFeatures = extractFeatures(promptSource);

    const stream = canvas.captureStream(FPS);
    const recorderOptions: MediaRecorderOptions[] = [
      { mimeType: "video/webm;codecs=vp9" },
      { mimeType: "video/webm;codecs=vp8" },
      { mimeType: "video/webm" }
    ];

    let recorder: MediaRecorder | null = null;
    for (const options of recorderOptions) {
      if (MediaRecorder.isTypeSupported(options.mimeType || "")) {
        recorder = new MediaRecorder(stream, options);
        break;
      }
    }

    if (!recorder) {
      setError("Unable to initialize video encoder in this browser.");
      setIsGenerating(false);
      return;
    }

    recorderRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || "video/webm" });
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      setIsGenerating(false);
      setStatus("Ready");
    };

    recorder.start();

    const start = performance.now();

    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / VIDEO_DURATION_MS);
      if (progress < 0.25) setStatus(STAGES[1]);
      else if (progress < 0.55) setStatus(STAGES[2]);
      else if (progress < 0.85) setStatus(STAGES[3]);
      else setStatus(STAGES[4]);

      drawFrame(ctx, noise3D, activeFeatures, elapsed, progress);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        recorder.stop();
      }
    };

    animationRef.current = requestAnimationFrame(animate);
    },
    [drawFrame]
  );

  const handleGenerate = useCallback(
    async (promptOverride?: string) => {
      const effectivePrompt = (promptOverride ?? prompt).trim();
      if (!effectivePrompt) return;

      try {
        resetRecorder();
        await generateVideo(effectivePrompt);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unexpected error during generation.";
        setError(message);
        setIsGenerating(false);
      }
    },
    [generateVideo, prompt, resetRecorder]
  );

  return (
    <main className="min-h-screen flex flex-col items-center py-16 px-5 gap-12">
      <header className="max-w-4xl text-center space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-4 py-1 text-sm tracking-wide uppercase text-slate-300 bg-slate-900/60">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          Agentic Gen-AI Lab • SORA-2 Inspired
        </div>
        <h1 className="text-4xl sm:text-5xl font-semibold leading-tight">
          Generate immersive cinematic videos from natural language prompts
        </h1>
        <p className="text-slate-300 text-lg max-w-3xl mx-auto">
          This experimental generator synthesizes stylized volumetric motion
          using layered noise fields, particle dynamics, and adaptive color
          grading derived from your prompt semantics. Everything runs locally in
          your browser.
        </p>
      </header>

      <section className="w-full max-w-5xl space-y-8">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] items-end">
          <div className="flex flex-col gap-3 text-left">
            <label htmlFor="prompt" className="text-sm uppercase tracking-wide text-slate-400">
              Cinematic Prompt
            </label>
            <textarea
              id="prompt"
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 p-4 text-base leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400/70"
              rows={4}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe the scene you imagine..."
              disabled={isGenerating}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              void handleGenerate();
            }}
            disabled={isGenerating || !prompt.trim()}
            className="h-12 px-7 rounded-xl bg-emerald-500 text-slate-900 font-semibold uppercase tracking-wide shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {isGenerating ? "Rendering..." : "Generate"}
          </button>
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-slate-300">
          {previewFeatures.palette.map((color, index) => (
            <div
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2"
            >
              <span
                className="h-6 w-6 rounded-full border border-slate-900 shadow-inner"
                style={{ background: color }}
              />
              <span className="font-mono text-xs">{color}</span>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
          <header className="flex items-center justify-between">
            <span className="text-sm uppercase tracking-wide text-slate-400">
              Generation Timeline
            </span>
            <span className="text-xs font-semibold text-emerald-300">
              {status}
            </span>
          </header>
          <div className="relative h-3 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-400 via-sky-400 to-violet-500 transition-all duration-150 ease-out"
              style={{
                width: isGenerating ? "90%" : videoUrl ? "100%" : "0%"
              }}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            {STAGES.map((stage) => (
              <span
                key={stage}
                className={`rounded-full px-3 py-1 text-xs uppercase tracking-wide ${
                  status === stage
                    ? "bg-emerald-400/20 text-emerald-200 border border-emerald-400/30"
                    : "bg-slate-800/70 border border-slate-700 text-slate-400"
                }`}
              >
                {stage}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="w-full max-w-5xl">
        <div className="relative rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
          <canvas
            ref={canvasRef}
            className="w-full rounded-2xl border border-slate-800 bg-slate-950"
          />
          {isGenerating && (
            <div className="absolute inset-0 grid place-items-center rounded-3xl backdrop-blur-sm bg-slate-950/60">
              <div className="space-y-4 text-center">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-emerald-300/60 text-emerald-200">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-transparent border-t-emerald-300" />
                </span>
                <p className="text-lg font-medium text-slate-100">
                  Synthesizing volumetric animation…
                </p>
                <p className="text-sm text-slate-400">
                  Harnessing procedural intelligence for cinematic motion
                </p>
              </div>
            </div>
          )}
        </div>

        {videoUrl && (
          <div className="mt-8 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] items-center border border-slate-800 rounded-3xl bg-slate-900/60 p-6">
            <video
              src={videoUrl}
              className="w-full rounded-2xl border border-slate-800"
              controls
              loop
            />
            <div className="flex flex-col gap-3">
              <a
                href={videoUrl}
                download="ai-video.webm"
                className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-5 py-3 font-semibold uppercase tracking-wide text-slate-900 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400 transition"
              >
                Download .webm
              </a>
              <button
                type="button"
                onClick={() => {
                const nextPrompt =
                  "A neon desert of synthwave dunes under twin moons";
                setPrompt(nextPrompt);
                void handleGenerate(nextPrompt);
              }}
                className="rounded-xl border border-slate-700 px-5 py-3 text-sm uppercase tracking-wide text-slate-200 hover:border-emerald-400/50 transition"
              >
                Surprise Me Again
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}
      </section>

      <footer className="pb-8 text-center text-sm text-slate-500">
        Built with generative motion fields and procedural artistry. Works best
        in modern Chromium-based browsers.
      </footer>
    </main>
  );
}
