"use client";

import { useRef, useState, useCallback, useEffect } from "react";

type Corner = [number, number]; // fractions 0-1 of image display size

interface CameraCaptureProps {
  onCapture: (dataUrl: string) => void;
}

// ── Perspective warp math ──────────────────────────────────────────────────

function gaussSolve(A: number[][], b: number[]): number[] {
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    for (let row = col + 1; row < n; row++) {
      const f = M[row][col] / M[col][col];
      for (let j = col; j <= n; j++) M[row][j] -= f * M[col][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    x[row] = M[row][n];
    for (let j = row + 1; j < n; j++) x[row] -= M[row][j] * x[j];
    x[row] /= M[row][row];
  }
  return x;
}

function computeHomography(src: Corner[], dst: Corner[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [X, Y] = src[i];
    const [x, y] = dst[i];
    A.push([X, Y, 1, 0, 0, 0, -x * X, -x * Y]);
    b.push(x);
    A.push([0, 0, 0, X, Y, 1, -y * X, -y * Y]);
    b.push(y);
  }
  return gaussSolve(A, b);
}

function scaleCanvas(src: HTMLCanvasElement, maxDim: number): HTMLCanvasElement {
  const { width, height } = src;
  if (width <= maxDim && height <= maxDim) return src;
  const s = maxDim / Math.max(width, height);
  const dst = document.createElement("canvas");
  dst.width = Math.round(width * s);
  dst.height = Math.round(height * s);
  dst.getContext("2d")!.drawImage(src, 0, 0, dst.width, dst.height);
  return dst;
}

// corners: [TL, TR, BR, BL] in src canvas pixels
function warpPerspective(
  srcCanvas: HTMLCanvasElement,
  corners: Corner[],
  outW: number,
  outH: number
): string {
  const dstPts: Corner[] = [
    [0, 0], [outW - 1, 0], [outW - 1, outH - 1], [0, outH - 1],
  ];
  // Inverse map: for each output pixel → source pixel
  const [a, b, c, d, e, f, g, h] = computeHomography(dstPts, corners);

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const outCtx = out.getContext("2d")!;
  const srcCtx = srcCanvas.getContext("2d")!;
  const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
  const outData = outCtx.createImageData(outW, outH);
  const sw = srcCanvas.width;
  const sh = srcCanvas.height;

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const denom = g * x + h * y + 1;
      const sx = (a * x + b * y + c) / denom;
      const sy = (d * x + e * y + f) / denom;
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const x1 = x0 + 1, y1 = y0 + 1;
      const oi = (y * outW + x) * 4;

      if (x0 < 0 || y0 < 0 || x1 >= sw || y1 >= sh) {
        outData.data[oi] = outData.data[oi + 1] = outData.data[oi + 2] = 255;
        outData.data[oi + 3] = 255;
        continue;
      }

      const fx = sx - x0, fy = sy - y0;
      for (let ch = 0; ch < 4; ch++) {
        outData.data[oi + ch] = Math.round(
          srcData.data[(y0 * sw + x0) * 4 + ch] * (1 - fx) * (1 - fy) +
          srcData.data[(y0 * sw + x1) * 4 + ch] * fx * (1 - fy) +
          srcData.data[(y1 * sw + x0) * 4 + ch] * (1 - fx) * fy +
          srcData.data[(y1 * sw + x1) * 4 + ch] * fx * fy
        );
      }
    }
  }

  outCtx.putImageData(outData, 0, 0);
  return out.toDataURL("image/jpeg", 0.92);
}

// ── Component ──────────────────────────────────────────────────────────────

const INIT_CORNERS: Corner[] = [
  [0.05, 0.05], [0.95, 0.05], [0.95, 0.95], [0.05, 0.95],
];

export default function CameraCapture({ onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const draggingIdx = useRef<number | null>(null);

  const [step, setStep] = useState<"camera" | "adjust">("camera");
  const [rawCapture, setRawCapture] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [corners, setCorners] = useState<Corner[]>(INIT_CORNERS);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setActive(true);
    } catch {
      setError("No se pudo acceder a la cámara. Verifica los permisos.");
    }
  }, []);

  useEffect(() => {
    if (active && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [active]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const captureRaw = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);

    // Keep high-res copy for warp (downscaled to 1600px max for memory)
    rawCanvasRef.current = scaleCanvas(canvas, 1600);

    setRawCapture(canvas.toDataURL("image/jpeg", 0.85));
    setCorners(INIT_CORNERS);
    stopCamera();
    setStep("adjust");
  }, [stopCamera]);

  const applyWarp = useCallback(async () => {
    const raw = rawCanvasRef.current;
    if (!raw) return;
    setProcessing(true);
    await new Promise((r) => setTimeout(r, 60)); // let spinner render

    // Map display-fraction corners → raw canvas pixel coords
    const nativeCorners: Corner[] = corners.map(([cx, cy]) => [
      Math.round(cx * raw.width),
      Math.round(cy * raw.height),
    ]);

    const [tl, tr, , bl] = nativeCorners;
    const outW = Math.round(Math.hypot(tr[0] - tl[0], tr[1] - tl[1]));
    const outH = Math.round(Math.hypot(bl[0] - tl[0], bl[1] - tl[1]));

    // Cap output at 1600px longest side
    const s = Math.min(1, 1600 / Math.max(outW, outH));
    const finalW = Math.max(1, Math.round(outW * s));
    const finalH = Math.max(1, Math.round(outH * s));

    const result = warpPerspective(raw, nativeCorners, finalW, finalH);
    setProcessing(false);
    onCapture(result);
  }, [corners, onCapture]);

  const retry = useCallback(() => {
    setStep("camera");
    setRawCapture(null);
    rawCanvasRef.current = null;
    startCamera();
  }, [startCamera]);

  // Pointer handlers for dragging corners
  const getPos = useCallback((e: React.TouchEvent | React.MouseEvent): Corner | null => {
    const imgEl = imgRef.current;
    if (!imgEl) return null;
    const rect = imgEl.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0]?.clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0]?.clientY : (e as React.MouseEvent).clientY;
    if (clientX === undefined || clientY === undefined) return null;
    return [
      Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    ];
  }, []);

  const onPointerDown = (idx: number) => (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    draggingIdx.current = idx;
  };

  const onPointerMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (draggingIdx.current === null) return;
    e.preventDefault();
    const pos = getPos(e);
    if (!pos) return;
    setCorners((prev) => {
      const next = [...prev] as Corner[];
      next[draggingIdx.current!] = pos;
      return next;
    });
  }, [getPos]);

  const onPointerUp = useCallback(() => {
    draggingIdx.current = null;
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      {error && (
        <p className="text-red-500 text-sm bg-red-50 px-4 py-2 rounded-lg">{error}</p>
      )}

      {/* ── Camera step ── */}
      {step === "camera" && (
        <>
          {!active && (
            <button
              onClick={startCamera}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
            >
              Abrir cámara
            </button>
          )}
          {active && (
            <div className="flex flex-col items-center gap-3 w-full">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="rounded-xl w-full max-w-sm border border-gray-200 shadow"
              />
              <button
                onClick={captureRaw}
                className="px-6 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors"
              >
                Capturar foto
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Adjust corners step ── */}
      {step === "adjust" && rawCapture && (
        <div className="flex flex-col items-center gap-3 w-full">
          <p className="text-sm text-gray-500 text-center px-2">
            Arrastra las esquinas azules hasta los vértices del documento
          </p>

          <div
            className="relative w-full max-w-sm touch-none select-none"
            onMouseMove={onPointerMove}
            onMouseUp={onPointerUp}
            onTouchMove={onPointerMove}
            onTouchEnd={onPointerUp}
          >
            <img
              ref={imgRef}
              src={rawCapture}
              alt="Ajustar esquinas"
              className="w-full rounded-xl border border-gray-200 shadow block"
              draggable={false}
            />

            {/* Quad overlay */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <polygon
                points={corners.map(([x, y]) => `${x * 100},${y * 100}`).join(" ")}
                fill="rgba(59,130,246,0.12)"
                stroke="rgba(59,130,246,0.9)"
                strokeWidth="0.6"
                strokeDasharray="2 1"
              />
            </svg>

            {/* Corner handles */}
            {corners.map(([cx, cy], idx) => (
              <div
                key={idx}
                className="absolute w-8 h-8 rounded-full bg-blue-500 border-2 border-white shadow-lg touch-none cursor-grab active:cursor-grabbing"
                style={{
                  left: `calc(${cx * 100}% - 16px)`,
                  top: `calc(${cy * 100}% - 16px)`,
                }}
                onMouseDown={onPointerDown(idx)}
                onTouchStart={onPointerDown(idx)}
              />
            ))}
          </div>

          <div className="flex gap-2 w-full max-w-sm">
            <button
              onClick={retry}
              disabled={processing}
              className="flex-1 px-3 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Repetir foto
            </button>
            <button
              onClick={applyWarp}
              disabled={processing}
              className="flex-1 px-3 py-2.5 bg-blue-600 rounded-xl text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {processing ? "Procesando…" : "Escanear ✓"}
            </button>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
