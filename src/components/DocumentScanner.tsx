"use client";

import { useRef, useState, useEffect, useCallback } from "react";

type Status = "starting" | "scanning" | "preview" | "error";

interface Props {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}

export default function DocumentScanner({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<Status>("starting");
  const [preview, setPreview] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })
      .then((stream) => {
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.play().then(() => setStatus("scanning"));
        }
      })
      .catch(() => {
        setErrorMsg("No se pudo acceder a la cámara");
        setStatus("error");
      });

    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;

    // Step 1: draw grayscale frame
    ctx.filter = "grayscale(1)";
    ctx.drawImage(video, 0, 0);
    ctx.filter = "none";

    // Step 2: threshold — fondo blanco, texto negro (estilo CamScanner)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const threshold = 128;
    for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const value = avg > threshold ? 255 : 0;
      data[i]     = value; // R
      data[i + 1] = value; // G
      data[i + 2] = value; // B
    }
    ctx.putImageData(imageData, 0, 0);

    setPreview(canvas.toDataURL("image/jpeg", 0.92));
    setStatus("preview");
  }, []);

  function confirm() {
    if (!preview) return;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCapture(preview);
  }

  function retake() {
    setPreview(null);
    setStatus("scanning");
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">

      {/* Error */}
      {status === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-white font-semibold">⚠️ {errorMsg}</p>
          <button onClick={onClose} className="px-6 py-3 bg-white text-black rounded-xl font-medium">
            Cerrar
          </button>
        </div>
      )}

      {/* Live video — always mounted so videoRef is valid when getUserMedia resolves */}
      {status !== "error" && status !== "preview" && (
        <div className="flex flex-col flex-1">
          <div className="relative flex-1 overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Spinner overlay while camera initialises */}
            {status === "starting" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black">
                <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
                <p className="text-white text-sm">Iniciando cámara…</p>
              </div>
            )}

            {/* Document guide overlay — only when live */}
            {status === "scanning" && <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className="relative"
                style={{
                  width: "88%",
                  height: "68%",
                  boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
                }}
              >
                {/* Corner brackets */}
                {[
                  "top-0 left-0 border-t-[4px] border-l-[4px]",
                  "top-0 right-0 border-t-[4px] border-r-[4px]",
                  "bottom-0 left-0 border-b-[4px] border-l-[4px]",
                  "bottom-0 right-0 border-b-[4px] border-r-[4px]",
                ].map((cls, i) => (
                  <div key={i} className={`absolute w-7 h-7 border-white ${cls}`} />
                ))}
              </div>
            </div>}

            {status === "scanning" && (
              <div className="absolute top-4 inset-x-0 flex justify-center pointer-events-none">
                <span className="bg-black/50 text-white text-xs font-medium px-3 py-1 rounded-full">
                  Alinea el documento y captura
                </span>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="bg-black px-6 py-6 flex items-center justify-between">
            <button onClick={onClose} className="text-white text-sm w-16">
              Cancelar
            </button>
            <button
              onClick={capture}
              className="rounded-full border-4 border-white flex items-center justify-center"
              style={{ width: 72, height: 72 }}
            >
              <div className="rounded-full bg-white" style={{ width: 52, height: 52 }} />
            </button>
            <div className="w-16" />
          </div>
        </div>
      )}

      {/* Preview */}
      {status === "preview" && preview && (
        <div className="flex flex-col flex-1 bg-gray-900">
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
            <img
              src={preview}
              alt="Documento escaneado"
              className="max-w-full max-h-full rounded-lg shadow-lg"
            />
          </div>
          <div className="bg-black px-6 py-6 flex gap-3">
            <button
              onClick={retake}
              className="flex-1 py-3 border border-white text-white rounded-xl font-medium text-sm"
            >
              Repetir
            </button>
            <button
              onClick={confirm}
              className="flex-1 py-3 bg-green-500 text-white rounded-xl font-semibold text-sm"
            >
              ✓ Usar imagen
            </button>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
