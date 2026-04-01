"use client";

import { useRef, useCallback } from "react";

interface CameraCaptureProps {
  onCapture: (dataUrl: string) => void;
}

export default function CameraCapture({ onCapture }: CameraCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);

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
      e.target.value = ""; // reset so same file can re-trigger
    },
    [onCapture]
  );

  return (
    <div className="flex flex-col items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />

      <button
        onClick={() => inputRef.current?.click()}
        className="w-full px-6 py-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
      >
        Escanear / Tomar foto
      </button>

      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700 w-full">
        <p className="font-semibold mb-1">📱 iPhone / iPad</p>
        <p>Selecciona <strong>"Escanear documento"</strong> para recorte y corrección automática.</p>
        <p className="mt-2 font-semibold">🤖 Android</p>
        <p>Usa el <strong>modo documento</strong> de tu cámara si está disponible.</p>
      </div>
    </div>
  );
}
