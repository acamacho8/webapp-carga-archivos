"use client";

import { useRef, useCallback } from "react";

interface CameraCaptureProps {
  onCapture: (dataUrl: string) => void;
}

export default function CameraCapture({ onCapture }: CameraCaptureProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        if (dataUrl) onCapture(dataUrl);
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [onCapture]
  );

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      {/* Camera input — opens camera directly */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />
      {/* Gallery input — on iOS shows "Escanear documento" option */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />

      <button
        onClick={() => cameraInputRef.current?.click()}
        className="w-full px-6 py-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
      >
        📷 Tomar foto
      </button>

      <button
        onClick={() => galleryInputRef.current?.click()}
        className="w-full px-6 py-3 border border-blue-300 text-blue-600 rounded-xl font-medium hover:bg-blue-50 transition-colors text-sm"
      >
        📄 Escanear documento (iPhone) / Galería
      </button>
    </div>
  );
}
