import { useCallback } from "react";

export function usePdfGenerator() {
  const generatePdf = useCallback(
    async (imageDataUrl: string, filename = "reporte"): Promise<Blob> => {
      const jsPDFModule = await import("jspdf");
      const JsPDF = jsPDFModule.default ?? (jsPDFModule as any).jsPDF;
      const doc = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 10;
      const imgWidth = pageWidth - margin * 2;

      const img = new Image();
      img.src = imageDataUrl;
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
      });

      const ratio = img.naturalHeight / img.naturalWidth;
      const imgHeight = Math.min(imgWidth * ratio, pageHeight - margin * 2);

      const format = imageDataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
      doc.addImage(imageDataUrl, format, margin, margin, imgWidth, imgHeight);

      return doc.output("blob");
    },
    []
  );

  const downloadPdf = useCallback(
    async (imageDataUrl: string, filename = "reporte") => {
      const jsPDFModule = await import("jspdf");
      const JsPDF = jsPDFModule.default ?? (jsPDFModule as any).jsPDF;
      const doc = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 10;
      const imgWidth = pageWidth - margin * 2;

      const img = new Image();
      img.src = imageDataUrl;
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
      });

      const ratio = img.naturalHeight / img.naturalWidth;
      const imgHeight = Math.min(imgWidth * ratio, pageHeight - margin * 2);

      const format = imageDataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
      doc.addImage(imageDataUrl, format, margin, margin, imgWidth, imgHeight);
      doc.save(`${filename}.pdf`);
    },
    []
  );

  return { generatePdf, downloadPdf };
}
