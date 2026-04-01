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

  const generateTextPdf = useCallback(async (text: string): Promise<Blob> => {
    const jsPDFModule = await import("jspdf");
    const JsPDF = jsPDFModule.default ?? (jsPDFModule as any).jsPDF;
    const doc = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const margin = 15;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const maxWidth = pageWidth - margin * 2;
    const lineHeight = 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    const lines = doc.splitTextToSize(text, maxWidth);
    let y = margin;
    for (const line of lines) {
      if (y + lineHeight > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += lineHeight;
    }

    return doc.output("blob");
  }, []);

  return { generatePdf, downloadPdf, generateTextPdf };
}
