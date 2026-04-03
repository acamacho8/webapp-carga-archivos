"use client";

import { useRef, useCallback, useState } from "react";
import { compressImage } from "@/utils/imageUtils";
import DocumentScanner from "@/components/DocumentScanner";

interface CameraCaptureProps {
  onCapture: (dataUrl: string) => void;
}

export default function CameraCapture({ onCapture }: CameraCaptureProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [scannerOpen, setScannerOpen] = useState(false);


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

  function handleScannerCapture(dataUrl: string) {
    setScannerOpen(false);
    onCapture(dataUrl);
  }

  return (
    <>
      {scannerOpen && (
        <DocumentScanner
          onCapture={handleScannerCapture}
          onClose={() => setScannerOpen(false)}
        />
      )}

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
        {/* Gallery-only input */}
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFile}
        />

        <button
          onClick={() => setScannerOpen(true)}
          className="w-full px-6 py-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
        >
          🔍 Escáner de documentos
        </button>

        <button
          onClick={() => cameraInputRef.current?.click()}
          className="w-full px-6 py-3 border border-blue-300 text-blue-600 rounded-xl font-medium hover:bg-blue-50 transition-colors text-sm"
        >
          📷 Tomar foto
        </button>

        <button
          onClick={() => galleryInputRef.current?.click()}
          className="w-full px-6 py-3 border border-gray-200 text-gray-600 rounded-xl font-medium hover:bg-gray-50 transition-colors text-sm"
        >
          🖼️ Galería
        </button>
      </div>
    </>
  );
}
