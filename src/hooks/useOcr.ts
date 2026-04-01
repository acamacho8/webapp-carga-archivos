"use client";

import { useState, useCallback } from "react";

export function useOcr() {
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);

  const runOcr = useCallback(async (imageDataUrl: string) => {
    setOcrText(null);
    setOcrLoading(true);
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("spa");
      const { data } = await worker.recognize(imageDataUrl);
      await worker.terminate();
      setOcrText(data.text.trim());
    } catch {
      setOcrText("");
    } finally {
      setOcrLoading(false);
    }
  }, []);

  const resetOcr = useCallback(() => {
    setOcrText(null);
    setOcrLoading(false);
  }, []);

  return { ocrText, ocrLoading, runOcr, resetOcr };
}
