"use client";

import { useState } from "react";
import CameraCapture from "@/components/CameraCapture";
import FolderSelector, { type FolderSelection } from "@/components/FolderSelector";
import { usePdfGenerator } from "@/hooks/usePdfGenerator";

type Step = "folder" | "capture" | "preview" | "uploading" | "done" | "error";

const MESES_INDEX = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

function todayFolder(): FolderSelection {
  const now = new Date();
  return {
    tienda: "FQ01",
    mes: MESES_INDEX[now.getMonth()],
    dia: now.getDate(),
  };
}

const STEP_LABELS = ["Carpeta", "Foto", "Revisar", "Drive"];

export default function Home() {
  const [step, setStep] = useState<Step>("folder");
  const [folder, setFolder] = useState<FolderSelection>(todayFolder());
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [customName, setCustomName] = useState("");
  const [driveLink, setDriveLink] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { generatePdf, downloadPdf } = usePdfGenerator();

  const stepIndex = { folder: 0, capture: 1, preview: 2, uploading: 3, done: 3, error: 3 }[step];

  function handleCapture(dataUrl: string) {
    setImageDataUrl(dataUrl);
    setStep("preview");
  }

  async function handleUpload() {
    if (!imageDataUrl) return;
    setStep("uploading");
    try {
      const blob = await generatePdf(imageDataUrl);
      const mesNum = String(MESES_INDEX.indexOf(folder.mes) + 1).padStart(2, "0");
      const diaNum = String(folder.dia).padStart(2, "0");
      const year = new Date().getFullYear();
      // Map store codes to actual Drive folder names
      const TIENDA_FOLDER: Record<string, string> = {
        FQ01: "Chacao FQ01",
        FQ28: "Marqués FQ28",
        FQ88: "Candelaria FQ88",
      };
      const tiendaFolder = TIENDA_FOLDER[folder.tienda] ?? folder.tienda;
      // Month: "01 - Enero" | Day: "01" (zero-padded) — matching Drive structure
      const mesFolderName = `${mesNum} - ${folder.mes}`;
      const folderPath = `${tiendaFolder}/${mesFolderName}/${diaNum}`;
      // Always include date suffix so GAS can parse it
      const dateTag = `${year}_${mesNum}_${diaNum}`;
      const baseName = customName.trim()
        ? `${customName.trim().replace(/\.pdf$/i, "")}_${dateTag}`
        : `reporte_${folder.tienda}_${dateTag}`;
      const filename = `${baseName}.pdf`;
      const formData = new FormData();
      formData.append("file", blob, filename);
      formData.append("filename", filename);
      formData.append("folderPath", folderPath);

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
    if (imageDataUrl) downloadPdf(imageDataUrl, `reporte_${folder.tienda}`);
  }

  function reset() {
    setStep("folder");
    setImageDataUrl(null);
    setDriveLink(null);
    setErrorMsg(null);
    setCustomName("");
    setFolder(todayFolder());
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 w-full max-w-md p-6 flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Carga de Reportes</h1>
          <p className="text-gray-500 text-sm mt-1">Captura, genera PDF y sube a Google Drive</p>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center justify-center gap-1">
          {STEP_LABELS.map((label, i) => (
            <div key={label} className="flex items-center gap-1">
              <div className="flex flex-col items-center gap-1">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  i === stepIndex ? "bg-blue-600 text-white"
                  : i < stepIndex ? "bg-green-500 text-white"
                  : "bg-gray-100 text-gray-400"
                }`}>
                  {i < stepIndex ? "✓" : i + 1}
                </span>
                <span className={`text-[10px] ${i === stepIndex ? "text-blue-600 font-semibold" : "text-gray-400"}`}>
                  {label}
                </span>
              </div>
              {i < STEP_LABELS.length - 1 && <div className="w-8 h-px bg-gray-200 mb-4" />}
            </div>
          ))}
        </div>

        {/* Step: folder */}
        {step === "folder" && (
          <FolderSelector
            value={folder}
            onChange={setFolder}
            onConfirm={() => setStep("capture")}
          />
        )}

        {/* Step: capture */}
        {step === "capture" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 font-mono bg-gray-50 px-3 py-1.5 rounded-lg">
                📁 {folder.tienda} / {folder.mes} / {String(folder.dia).padStart(2, "0")}
              </p>
              <button onClick={() => setStep("folder")} className="text-xs text-blue-500 hover:underline">
                Cambiar
              </button>
            </div>
            <CameraCapture onCapture={handleCapture} />
          </div>
        )}

        {/* Step: preview */}
        {step === "preview" && imageDataUrl && (
          <div className="flex flex-col gap-4 items-center">
            <img src={imageDataUrl} alt="Foto capturada" className="rounded-xl w-full border border-gray-200 shadow-sm" />
            <div className="w-full flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre del archivo</label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder={`reporte_${folder.tienda}_${new Date().getFullYear()}_...`}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 focus:outline-none focus:border-blue-400"
              />
              <p className="text-[11px] text-gray-400">Se guardará como <span className="font-mono">{(customName.trim() ? customName.trim().replace(/\.pdf$/i, "") : `reporte_${folder.tienda}`)}_{ `${new Date().getFullYear()}_${String(MESES_INDEX.indexOf(folder.mes)+1).padStart(2,"0")}_${String(folder.dia).padStart(2,"0")}`}.pdf</span></p>
            </div>
            <div className="flex gap-2 w-full">
              <button onClick={() => setStep("capture")} className="flex-1 px-3 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Repetir
              </button>
              <button onClick={handleDownload} className="flex-1 px-3 py-2.5 border border-blue-300 rounded-xl text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors">
                Descargar
              </button>
              <button onClick={handleUpload} className="flex-1 px-3 py-2.5 bg-blue-600 rounded-xl text-sm font-medium text-white hover:bg-blue-700 transition-colors">
                Subir
              </button>
            </div>
          </div>
        )}

        {/* Step: uploading */}
        {step === "uploading" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-600 text-sm">Subiendo a {folder.tienda} / {folder.mes} / {folder.dia}...</p>
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
              <p className="text-gray-500 text-xs mt-1 font-mono">📁 {folder.tienda} / {folder.mes} / {folder.dia}</p>
            </div>
            <a href={driveLink} target="_blank" rel="noopener noreferrer"
              className="w-full px-4 py-2.5 bg-blue-600 rounded-xl text-sm font-medium text-white hover:bg-blue-700 transition-colors text-center">
              Ver en Google Drive
            </a>
            <button onClick={reset} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
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
            <button onClick={() => setStep("preview")} className="w-full px-4 py-2.5 bg-blue-600 rounded-xl text-sm font-medium text-white hover:bg-blue-700 transition-colors">
              Reintentar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
