import { useCallback } from "react";

export function usePdfGenerator() {
  const generatePdf = useCallback(
    async (imageDataUrls: string | string[]): Promise<Blob> => {
      const images = Array.isArray(imageDataUrls) ? imageDataUrls : [imageDataUrls];

      const jsPDFModule = await import("jspdf");
      const JsPDF = jsPDFModule.default ?? (jsPDFModule as any).jsPDF;
      const doc = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 10;
      const maxW = pageWidth - margin * 2;
      const maxH = pageHeight - margin * 2;

      for (let i = 0; i < images.length; i++) {
        if (i > 0) doc.addPage();

        const dataUrl = images[i];
        const img = new Image();
        img.src = dataUrl;
        await new Promise<void>((resolve) => { img.onload = () => resolve(); });

        const ratio = img.naturalHeight / img.naturalWidth;
        const imgWidth = maxW;
        const imgHeight = Math.min(imgWidth * ratio, maxH);

        const format = dataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
        doc.addImage(dataUrl, format, margin, margin, imgWidth, imgHeight);
      }

      return doc.output("blob");
    },
    []
  );

  const downloadPdf = useCallback(
    async (imageDataUrls: string | string[], filename = "reporte") => {
      const images = Array.isArray(imageDataUrls) ? imageDataUrls : [imageDataUrls];

      const jsPDFModule = await import("jspdf");
      const JsPDF = jsPDFModule.default ?? (jsPDFModule as any).jsPDF;
      const doc = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 10;
      const maxW = pageWidth - margin * 2;
      const maxH = pageHeight - margin * 2;

      for (let i = 0; i < images.length; i++) {
        if (i > 0) doc.addPage();

        const dataUrl = images[i];
        const img = new Image();
        img.src = dataUrl;
        await new Promise<void>((resolve) => { img.onload = () => resolve(); });

        const ratio = img.naturalHeight / img.naturalWidth;
        const imgWidth = maxW;
        const imgHeight = Math.min(imgWidth * ratio, maxH);

        const format = dataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
        doc.addImage(dataUrl, format, margin, margin, imgWidth, imgHeight);
      }

      doc.save(`${filename}.pdf`);
    },
    []
  );

  return { generatePdf, downloadPdf };
}
