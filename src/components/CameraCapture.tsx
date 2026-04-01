"use client";

import { useRef, useState, useCallback, useEffect } from "react";

interface CameraCaptureProps {
  onCapture: (dataUrl: string) => void;
}

interface CropBounds {
  x: number; y: number; w: number; h: number;
}

interface GuideStyle {
  left: string; top: string; width: string; height: string;
}

export default function CameraCapture({ onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [cropBounds, setCropBounds] = useState<CropBounds | null>(null);
  const [guideStyle, setGuideStyle] = useState<GuideStyle | null>(null);

  // Compute guide bounds from actual video native + display dimensions
  const computeGuide = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const displayRect = video.getBoundingClientRect();
    const displayW = displayRect.width;
    const displayH = displayRect.height;
    if (displayW === 0 || displayH === 0) return;

    // Target: 88% of native width, A4 portrait ratio, centered
    // Cap height to 90% of video height in case of landscape camera
    const nativeW = Math.round(0.88 * vw);
    const nativeH_A4 = Math.round(nativeW * 297 / 210);
    const maxNativeH = Math.round(0.90 * vh);

    const finalH = Math.min(nativeH_A4, maxNativeH);
    const finalW = finalH < nativeH_A4
      ? Math.round(finalH * 210 / 297)
      : nativeW;

    const srcX = Math.round((vw - finalW) / 2);
    const srcY = Math.round((vh - finalH) / 2);

    setCropBounds({ x: srcX, y: srcY, w: finalW, h: finalH });

    // Map native pixel positions to display pixels for the CSS overlay
    const scaleX = displayW / vw;
    const scaleY = displayH / vh;

    setGuideStyle({
      left: `${Math.round(srcX * scaleX)}px`,
      top: `${Math.round(srcY * scaleY)}px`,
      width: `${Math.round(finalW * scaleX)}px`,
      height: `${Math.round(finalH * scaleY)}px`,
    });
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    setCropBounds(null);
    setGuideStyle(null);
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

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !cropBounds) return;

    const { x, y, w, h } = cropBounds;
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")?.drawImage(video, x, y, w, h, 0, 0, w, h);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setPreview(dataUrl);
    onCapture(dataUrl);
    stopCamera();
  }, [onCapture, stopCamera, cropBounds]);

  const retry = useCallback(() => {
    setPreview(null);
    startCamera();
  }, [startCamera]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const handlePlay = useCallback(() => {
    // Wait one frame for layout to settle before measuring
    requestAnimationFrame(computeGuide);
  }, [computeGuide]);

  const hintTop = guideStyle
    ? `${Math.max(0, parseInt(guideStyle.top) - 20)}px`
    : undefined;

  return (
    <div className="flex flex-col items-center gap-4">
      {error && (
        <p className="text-red-500 text-sm bg-red-50 px-4 py-2 rounded-lg">{error}</p>
      )}

      {!active && !preview && (
        <button
          onClick={startCamera}
          className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
        >
          Abrir cámara
        </button>
      )}

      {active && (
        <div className="flex flex-col items-center gap-3 w-full">
          <div className="relative w-full max-w-sm overflow-hidden rounded-xl border border-gray-200 shadow">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full block"
              onPlay={handlePlay}
            />
            {guideStyle && (
              <>
                <p
                  className="absolute text-white text-xs font-medium pointer-events-none select-none"
                  style={{
                    top: hintTop,
                    left: guideStyle.left,
                    textShadow: "0 1px 3px rgba(0,0,0,0.8)",
                  }}
                >
                  Alinea el documento aquí
                </p>
                <div
                  className="absolute pointer-events-none"
                  style={{
                    ...guideStyle,
                    boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
                    border: "2px solid rgba(255,255,255,0.9)",
                    borderRadius: "4px",
                  }}
                />
              </>
            )}
          </div>
          <button
            onClick={capture}
            disabled={!cropBounds}
            className="px-6 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            Capturar foto
          </button>
        </div>
      )}

      {preview && (
        <div className="flex flex-col items-center gap-3 w-full">
          <img
            src={preview}
            alt="Vista previa"
            className="rounded-xl w-full max-w-sm border border-gray-200 shadow"
          />
          <button
            onClick={retry}
            className="px-6 py-3 bg-gray-500 text-white rounded-xl font-semibold hover:bg-gray-600 transition-colors"
          >
            Volver a capturar
          </button>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
