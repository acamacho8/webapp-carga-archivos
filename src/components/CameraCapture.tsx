"use client";

import { useRef, useState, useCallback, useEffect } from "react";

interface CameraCaptureProps {
  onCapture: (dataUrl: string) => void;
}

export default function CameraCapture({ onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(false);

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

  // Assign stream after video element is mounted (active=true triggers render)
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
    const guide = guideRef.current;
    if (!video || !canvas || !guide) return;

    const videoRect = video.getBoundingClientRect();
    const guideRect = guide.getBoundingClientRect();

    const scaleX = video.videoWidth / videoRect.width;
    const scaleY = video.videoHeight / videoRect.height;

    const srcX = Math.round((guideRect.left - videoRect.left) * scaleX);
    const srcY = Math.round((guideRect.top - videoRect.top) * scaleY);
    const srcW = Math.round(guideRect.width * scaleX);
    const srcH = Math.round(guideRect.height * scaleY);

    canvas.width = srcW;
    canvas.height = srcH;
    canvas.getContext("2d")?.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setPreview(dataUrl);
    onCapture(dataUrl);
    stopCamera();
  }, [onCapture, stopCamera]);

  const retry = useCallback(() => {
    setPreview(null);
    startCamera();
  }, [startCamera]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

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
            />
            <p
              className="absolute text-white text-xs font-medium pointer-events-none"
              style={{ top: "calc(5% - 18px)", left: "6%", textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
            >
              Alinea el documento aquí
            </p>
            <div
              ref={guideRef}
              className="absolute pointer-events-none"
              style={{
                top: "5%",
                left: "6%",
                width: "88%",
                aspectRatio: "210 / 297",
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
                border: "2px solid rgba(255,255,255,0.85)",
                borderRadius: "4px",
              }}
            />
          </div>
          <button
            onClick={capture}
            className="px-6 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors"
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
