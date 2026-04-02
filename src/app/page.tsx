"use client";

import { useState } from "react";
import CameraCapture from "@/components/CameraCapture";
import FolderSelector, { type FolderSelection } from "@/components/FolderSelector";
import { usePdfGenerator } from "@/hooks/usePdfGenerator";


type Step = "folder" | "capture" | "preview" | "uploading" | "done" | "error";
type PendingPdf = { images: string[]; name: string };

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

const TIENDA_FOLDER: Record<string, string> = {
  FQ01: "Chacao FQ01",
  FQ28: "Marqués FQ28",
  FQ88: "Candelaria FQ88",
};

export default function Home() {
  const [step, setStep] = useState<Step>("folder");
  const [folder, setFolder] = useState<FolderSelection>(todayFolder());
  const [images, setImages] = useState<string[]>([]);
  const [pendingPdfs, setPendingPdfs] = useState<PendingPdf[]>([]);
  const [customName, setCustomName] = useState("");
  const [driveLinks, setDriveLinks] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { generatePdf, downloadPdf } = usePdfGenerator();

  const stepIndex = { folder: 0, capture: 1, preview: 2, uploading: 3, done: 3, error: 3 }[step];

  function handleCapture(dataUrl: string) {
    setImages((prev) => [...prev, dataUrl]);
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  function buildFilename(): string {
    const mesNum = String(MESES_INDEX.indexOf(folder.mes) + 1).padStart(2, "0");
    const diaNum = String(folder.dia).padStart(2, "0");
    const year = new Date().getFullYear();
    const dateTag = `${year}_${mesNum}_${diaNum}`;
    return customName.trim()
      ? `${customName.trim().replace(/\.pdf$/i, "")}_${dateTag}`
      : `reporte_${folder.tienda}_${dateTag}`;
  }

  function saveAndAddAnother() {
    if (images.length === 0) return;
    setPendingPdfs((prev) => [...prev, { images: [...images], name: buildFilename() }]);
    setImages([]);
    setCustomName("");
    setStep("capture");
  }

  async function handleUpload() {
    const allPdfs: PendingPdf[] = [
      ...pendingPdfs,
      ...(images.length > 0 ? [{ images, name: buildFilename() }] : []),
    ];
    if (allPdfs.length === 0) return;
    setStep("uploading");

    const mesNum = String(MESES_INDEX.indexOf(folder.mes) + 1).padStart(2, "0");
    const diaNum = String(folder.dia).padStart(2, "0");
    const tiendaFolder = TIENDA_FOLDER[folder.tienda] ?? folder.tienda;
    const folderPath = `${tiendaFolder}/${mesNum} - ${folder.mes}/${diaNum}`;

    try {
      const links: string[] = [];
      for (const pdf of allPdfs) {
        const blob = await generatePdf(pdf.images);
        const formData = new FormData();
        formData.append("file", blob, `${pdf.name}.pdf`);
        formData.append("filename", `${pdf.name}.pdf`);
        formData.append("folderPath", folderPath);
        const res = await fetch("/api/upload-drive", { method: "POST", body: formData });
        const text = await res.text();
        let data: Record<string, string> = {};
        try { data = JSON.parse(text); } catch {}
        if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
        links.push(data.viewLink);
      }
      setDriveLinks(links);
      setPendingPdfs([]);
      setStep("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error desconocido");
      setStep("error");
    }
  }

  function handleDownload() {
    if (images.length > 0) downloadPdf(images, `reporte_${folder.tienda}`);
  }

  function reset() {
    setStep("folder");
    setImages([]);
    setPendingPdfs([]);
    setDriveLinks([]);
    setErrorMsg(null);
    setCustomName("");
    setFolder(todayFolder());
  }

  const totalPdfCount = pendingPdfs.length + (images.length > 0 ? 1 : 0);

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

            {/* Queue indicator */}
            {pendingPdfs.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                <span className="text-blue-700 text-sm font-semibold">
                  📂 {pendingPdfs.length} {pendingPdfs.length === 1 ? "PDF guardado" : "PDFs guardados"} en cola
                </span>
              </div>
            )}

            {/* Guía de captura */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-col gap-2">
              <p className="text-xs font-semibold text-amber-800">📋 Para mejor lectura del ticket:</p>
              <div className="grid grid-cols-2 gap-1.5 text-xs text-amber-700">
                <span>📱 Teléfono recto, desde arriba</span>
                <span>💡 Sin sombras ni reflejos</span>
                <span>📄 Ticket plano y completo</span>
                <span>🔍 Llena el encuadre</span>
              </div>
            </div>

            <CameraCapture onCapture={handleCapture} />

            {/* Miniaturas de fotos tomadas */}
            {images.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Fotos tomadas ({images.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {images.map((img, i) => (
                    <div key={i} className="relative">
                      <img
                        src={img}
                        alt={`Foto ${i + 1}`}
                        className="w-16 h-20 object-cover rounded-lg border border-gray-200"
                      />
                      <button
                        onClick={() => removeImage(i)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center leading-none"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setStep("preview")}
                  className="w-full px-4 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors"
                >
                  ✅ Revisar y subir ({images.length} {images.length === 1 ? "foto" : "fotos"})
                </button>
              </div>
            )}

            {/* Upload queued PDFs when no current images */}
            {pendingPdfs.length > 0 && images.length === 0 && (
              <button
                onClick={handleUpload}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
              >
                ☁️ Subir {pendingPdfs.length} {pendingPdfs.length === 1 ? "PDF" : "PDFs"} a Drive
              </button>
            )}
          </div>
        )}

        {/* Step: preview */}
        {step === "preview" && images.length > 0 && (
          <div className="flex flex-col gap-4">
            {/* Queue indicator */}
            {pendingPdfs.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                <span className="text-blue-700 text-xs">
                  📂 {pendingPdfs.length} {pendingPdfs.length === 1 ? "PDF" : "PDFs"} en cola — se subirán todos juntos
                </span>
              </div>
            )}

            {/* Grid de miniaturas */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {images.length} {images.length === 1 ? "página" : "páginas"} en este PDF
              </p>
              <div className="flex flex-wrap gap-2">
                {images.map((img, i) => (
                  <div key={i} className="relative">
                    <img
                      src={img}
                      alt={`Página ${i + 1}`}
                      className="w-16 h-20 object-cover rounded-lg border border-gray-200"
                    />
                    <button
                      onClick={() => removeImage(i)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center leading-none"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Nombre del archivo */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre del archivo</label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder={`reporte_${folder.tienda}_${new Date().getFullYear()}_...`}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 focus:outline-none focus:border-blue-400"
              />
              <p className="text-[11px] text-gray-400">
                Se guardará como{" "}
                <span className="font-mono">
                  {(customName.trim() ? customName.trim().replace(/\.pdf$/i, "") : `reporte_${folder.tienda}`)}_
                  {`${new Date().getFullYear()}_${String(MESES_INDEX.indexOf(folder.mes) + 1).padStart(2, "0")}_${String(folder.dia).padStart(2, "0")}`}.pdf
                </span>
              </p>
            </div>

            <div className="flex flex-col gap-2 w-full">
              <div className="flex gap-2">
                <button onClick={() => setStep("capture")} className="flex-1 px-3 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  + Foto
                </button>
                <button onClick={handleDownload} className="flex-1 px-3 py-2.5 border border-blue-300 rounded-xl text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors">
                  Descargar
                </button>
              </div>
              <button
                onClick={saveAndAddAnother}
                className="w-full px-3 py-2.5 border border-green-400 rounded-xl text-sm font-medium text-green-700 hover:bg-green-50 transition-colors"
              >
                📄 Guardar PDF y capturar otro
              </button>
              <button
                onClick={handleUpload}
                className="w-full px-3 py-2.5 bg-blue-600 rounded-xl text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                ☁️ {totalPdfCount > 1 ? `Subir ${totalPdfCount} PDFs a Drive` : "Subir a Drive"}
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
        {step === "done" && driveLinks.length > 0 && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                {driveLinks.length === 1 ? "¡Subido exitosamente!" : `¡${driveLinks.length} PDFs subidos!`}
              </p>
              <p className="text-gray-500 text-xs mt-1 font-mono">📁 {folder.tienda} / {folder.mes} / {folder.dia}</p>
            </div>
            <div className="w-full flex flex-col gap-2">
              {driveLinks.map((link, i) => (
                <a key={i} href={link} target="_blank" rel="noopener noreferrer"
                  className="w-full px-4 py-2.5 bg-blue-600 rounded-xl text-sm font-medium text-white hover:bg-blue-700 transition-colors text-center">
                  {driveLinks.length === 1 ? "Ver en Google Drive" : `Ver PDF ${i + 1} en Drive`}
                </a>
              ))}
            </div>
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
