"use client";

import { useRef, useCallback } from "react";

interface CameraCaptureProps {
  onCapture: (dataUrl: string) => void;
}

function compressImage(dataUrl: string, maxWidth = 1400): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.src = dataUrl;
  });
}

export default function CameraCapture({ onCapture }: CameraCaptureProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const raw = ev.target?.result as string;
          if (!raw) return;
          const compressed = await compressImage(raw);
          onCapture(compressed);
        };
        reader.readAsDataURL(file);
      });
      e.target.value = "";
    },
    [onCapture]
  );

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      {/* Main input — no capture attr so iOS shows "Scan Document" option in picker */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFile}
      />
      {/* Gallery-only input for selecting existing photos */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFile}
      />

      <button
        onClick={() => cameraInputRef.current?.click()}
        className="w-full px-6 py-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
      >
        📷 Cámara / Escanear documento
      </button>

      <button
        onClick={() => galleryInputRef.current?.click()}
        className="w-full px-6 py-3 border border-blue-300 text-blue-600 rounded-xl font-medium hover:bg-blue-50 transition-colors text-sm"
      >
        🖼️ Galería
      </button>
    </div>
  );
}
