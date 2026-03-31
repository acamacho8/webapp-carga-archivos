"use client";

import { useState } from "react";
import CameraCapture from "@/components/CameraCapture";
import { usePdfGenerator } from "@/hooks/usePdfGenerator";

type Step = "capture" | "preview" | "uploading" | "done" | "error";

export default function Home() {
  const [step, setStep] = useState<Step>("capture");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [driveLink, setDriveLink] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { generatePdf, downloadPdf } = usePdfGenerator();

  function handleCapture(dataUrl: string) {
    setImageDataUrl(dataUrl);
    setStep("preview");
  }

  async function handleUpload() {
    if (!imageDataUrl) return;
    setStep("uploading");
    try {
      const blob = await generatePdf(imageDataUrl);
      const filename = `reporte_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.pdf`;
      const formData = new FormData();
      formData.append("file", blob, filename);
      formData.append("filename", filename);

      const res = await fetch("/api/upload-drive", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Error al subir");
      setDriveLink(data.viewLink);
      setStep("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error desconocido");
      setStep("error");
    }
  }

  function handleDownload() {
    if (imageDataUrl) downloadPdf(imageDataUrl, "reporte");
  }

  function reset() {
    setStep("capture");
    setImageDataUrl(null);
    setDriveLink(null);
    setErrorMsg(null);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 w-full max-w-md p-6 flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Carga de Reportes</h1>
          <p className="text-gray-500 text-sm mt-1">Captura, genera PDF y sube a Google Drive</p>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center justify-center gap-2 text-xs font-medium">
          {(["capture", "preview", "uploading", "done"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  step === s
                    ? "bg-blue-600 text-white"
                    : ["done", "uploading"].includes(step) && i < ["capture","preview","uploading","done"].indexOf(step)
                    ? "bg-green-500 text-white"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                {i + 1}
              </span>
              {i < 3 && <div className="w-6 h-px bg-gray-200" />}
            </div>
          ))}
        </div>

        {/* Step: capture */}
        {step === "capture" && (
          <CameraCapture onCapture={handleCapture} />
        )}

        {/* Step: preview */}
        {step === "preview" && imageDataUrl && (
          <div className="flex flex-col gap-4 items-center">
            <img
              src={imageDataUrl}
              alt="Foto capturada"
              className="rounded-xl w-full border border-gray-200 shadow-sm"
            />
            <div className="flex gap-3 w-full">
              <button
                onClick={reset}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Repetir
              </button>
              <button
                onClick={handleDownload}
                className="flex-1 px-4 py-2.5 border border-blue-300 rounded-xl text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"
              >
                Descargar PDF
              </button>
              <button
                onClick={handleUpload}
                className="flex-1 px-4 py-2.5 bg-blue-600 rounded-xl text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Subir a Drive
              </button>
            </div>
          </div>
        )}

        {/* Step: uploading */}
        {step === "uploading" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-600 text-sm">Generando PDF y subiendo a Drive...</p>
          </div>
        )}

        {/* Step: done */}
        {step === "done" && driveLink && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-gray-900">¡Subido exitosamente!</p>
              <p className="text-gray-500 text-sm mt-1">El PDF está disponible en Google Drive</p>
            </div>
            <a
              href={driveLink}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full px-4 py-2.5 bg-blue-600 rounded-xl text-sm font-medium text-white hover:bg-blue-700 transition-colors text-center"
            >
              Ver en Google Drive
            </a>
            <button
              onClick={reset}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Capturar otro reporte
            </button>
          </div>
        )}

        {/* Step: error */}
        {step === "error" && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center">
              <svg className="w-7 h-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Error al subir</p>
              <p className="text-red-500 text-sm mt-1">{errorMsg}</p>
            </div>
            <button
              onClick={() => setStep("preview")}
              className="w-full px-4 py-2.5 bg-blue-600 rounded-xl text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Reintentar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
