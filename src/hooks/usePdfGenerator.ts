import { useCallback } from "react";

export function usePdfGenerator() {
  const generatePdf = useCallback(
    async (imageDataUrl: string, filename = "reporte"): Promise<Blob> => {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 10;
      const imgWidth = pageWidth - margin * 2;

      // Calculate proportional height from dataUrl
      const img = new Image();
      img.src = imageDataUrl;
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
      });

      const ratio = img.naturalHeight / img.naturalWidth;
      const imgHeight = Math.min(imgWidth * ratio, pageHeight - margin * 2);

      doc.addImage(imageDataUrl, "PNG", margin, margin, imgWidth, imgHeight);

      return doc.output("blob");
    },
    []
  );

  const downloadPdf = useCallback(
    async (imageDataUrl: string, filename = "reporte") => {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

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

      doc.addImage(imageDataUrl, "PNG", margin, margin, imgWidth, imgHeight);
      doc.save(`${filename}.pdf`);
    },
    []
  );

  return { generatePdf, downloadPdf };
}
