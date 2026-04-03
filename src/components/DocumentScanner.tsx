"use client";

import { useRef, useState, useEffect, useCallback } from "react";

type ScanStatus = "loading" | "scanning" | "processing" | "preview" | "error";

interface Props {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}

// Reorder 4 corners: top-left, top-right, bottom-right, bottom-left
function orderPoints(pts: [number, number][]): [number, number][] {
  const sorted = [...pts].sort((a, b) => a[1] - b[1]);
  const top = sorted.slice(0, 2).sort((a, b) => a[0] - b[0]);
  const bottom = sorted.slice(2).sort((a, b) => a[0] - b[0]);
  return [top[0], top[1], bottom[1], bottom[0]];
}

export default function DocumentScanner({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const hiddenRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const cvRef = useRef<any>(null);

  const [status, setStatus] = useState<ScanStatus>("loading");
  const [preview, setPreview] = useState<string | null>(null);
  const [cornersFound, setCornersFound] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load OpenCV from /public/opencv.js (avoids bundler issues with Node.js modules)
  useEffect(() => {
    const win = window as any;

    function initCv(cv: any) {
      if (cv.Mat) {
        cvRef.current = cv;
      } else {
        cv.onRuntimeInitialized = () => { cvRef.current = cv; };
      }
    }

    if (win.cv) {
      initCv(win.cv);
      return;
    }

    const script = document.createElement("script");
    script.src = "/opencv.js";
    script.async = true;
    script.onload = () => initCv(win.cv);
    script.onerror = () => {
      setErrorMsg("No se pudo cargar el motor de escaneo");
      setStatus("error");
    };
    document.head.appendChild(script);
  }, []);

  // Start camera
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
    }).then((stream) => {
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().then(() => setStatus("scanning"));
      }
    }).catch(() => {
      setErrorMsg("No se pudo acceder a la cámara");
      setStatus("error");
    });

    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Real-time corner detection loop (runs every 500ms to avoid battery drain)
  useEffect(() => {
    if (status !== "scanning") return;
    let lastRun = 0;

    const loop = () => {
      const now = Date.now();
      if (now - lastRun > 500 && cvRef.current && videoRef.current?.readyState === 4) {
        lastRun = now;
        try { runDetection(false); } catch {}
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [status]);

  function runDetection(fullRes: boolean): [number, number][] | null {
    const cv = cvRef.current;
    const video = videoRef.current!;
    const scale = fullRes ? 1 : 0.3;
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);
    if (!w || !h) return null;

    // Draw video frame to a temporary canvas
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    tmp.getContext("2d")!.drawImage(video, 0, 0, w, h);

    const src = cv.imread(tmp);
    const gray = new cv.Mat();
    const blurred = new cv.Mat();
    const edged = new cv.Mat();
    const dilated = new cv.Mat();
    const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edged, 75, 200);
    cv.dilate(edged, dilated, kernel);
    cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    // Sort contours by area descending, check top 5 for 4-corner shape
    const areas: { idx: number; area: number }[] = [];
    for (let i = 0; i < contours.size(); i++) {
      areas.push({ idx: i, area: cv.contourArea(contours.get(i)) });
    }
    areas.sort((a, b) => b.area - a.area);

    let corners: [number, number][] | null = null;
    let approxMat: any = null;

    for (const { idx } of areas.slice(0, 5)) {
      const c = contours.get(idx);
      const peri = cv.arcLength(c, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(c, approx, 0.02 * peri, true);
      if (approx.rows === 4) {
        approxMat = approx;
        corners = [];
        for (let i = 0; i < 4; i++) {
          corners.push([
            approx.data32S[i * 2] / scale,
            approx.data32S[i * 2 + 1] / scale,
          ]);
        }
        break;
      }
      approx.delete();
    }

    // Draw overlay
    if (!fullRes && overlayRef.current && videoRef.current) {
      const canvas = overlayRef.current;
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (corners) {
        const ordered = orderPoints(corners);
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(ordered[0][0], ordered[0][1]);
        for (let i = 1; i < 4; i++) ctx.lineTo(ordered[i][0], ordered[i][1]);
        ctx.closePath();
        ctx.stroke();
        ordered.forEach(([x, y]) => {
          ctx.beginPath();
          ctx.arc(x, y, 12, 0, Math.PI * 2);
          ctx.fillStyle = "#22c55e";
          ctx.fill();
        });
      }
      setCornersFound(!!corners);
    }

    // Cleanup
    src.delete(); gray.delete(); blurred.delete(); edged.delete();
    dilated.delete(); kernel.delete(); contours.delete(); hierarchy.delete();
    if (approxMat) approxMat.delete();

    return corners;
  }

  const capture = useCallback(async () => {
    const cv = cvRef.current;
    const video = videoRef.current;
    const canvas = hiddenRef.current;
    if (!cv || !video || !canvas) return;

    setStatus("processing");
    cancelAnimationFrame(rafRef.current);

    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")!.drawImage(video, 0, 0);

      const src = cv.imread(canvas);
      const gray = new cv.Mat();
      const blurred = new cv.Mat();
      const edged = new cv.Mat();
      const dilated = new cv.Mat();
      const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();

      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
      cv.Canny(blurred, edged, 75, 200);
      cv.dilate(edged, dilated, kernel);
      cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

      const areas: { idx: number; area: number }[] = [];
      for (let i = 0; i < contours.size(); i++) {
        areas.push({ idx: i, area: cv.contourArea(contours.get(i)) });
      }
      areas.sort((a, b) => b.area - a.area);

      let corners: [number, number][] | null = null;
      let approxMat: any = null;

      for (const { idx } of areas.slice(0, 5)) {
        const c = contours.get(idx);
        const peri = cv.arcLength(c, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(c, approx, 0.02 * peri, true);
        if (approx.rows === 4) {
          approxMat = approx;
          corners = [];
          for (let i = 0; i < 4; i++) {
            corners.push([approx.data32S[i * 2], approx.data32S[i * 2 + 1]]);
          }
          break;
        }
        approx.delete();
      }

      let warped: any;

      if (corners) {
        const [tl, tr, br, bl] = orderPoints(corners);
        const maxW = Math.round(Math.max(
          Math.hypot(br[0] - bl[0], br[1] - bl[1]),
          Math.hypot(tr[0] - tl[0], tr[1] - tl[1])
        ));
        const maxH = Math.round(Math.max(
          Math.hypot(tr[0] - br[0], tr[1] - br[1]),
          Math.hypot(tl[0] - bl[0], tl[1] - bl[1])
        ));

        const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
          tl[0], tl[1], tr[0], tr[1], br[0], br[1], bl[0], bl[1],
        ]);
        const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
          0, 0, maxW - 1, 0, maxW - 1, maxH - 1, 0, maxH - 1,
        ]);
        const M = cv.getPerspectiveTransform(srcPts, dstPts);
        warped = new cv.Mat();
        cv.warpPerspective(src, warped, M, new cv.Size(maxW, maxH));
        M.delete(); srcPts.delete(); dstPts.delete();
      } else {
        warped = src.clone();
      }

      // Adaptive threshold → clean B&W "CamScanner" look
      const warpedGray = new cv.Mat();
      cv.cvtColor(warped, warpedGray, cv.COLOR_RGBA2GRAY);
      const thresholded = new cv.Mat();
      cv.adaptiveThreshold(warpedGray, thresholded, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 10);

      const outCanvas = document.createElement("canvas");
      cv.imshow(outCanvas, thresholded);
      const dataUrl = outCanvas.toDataURL("image/jpeg", 0.92);

      // Cleanup all mats
      src.delete(); gray.delete(); blurred.delete(); edged.delete();
      dilated.delete(); kernel.delete(); contours.delete(); hierarchy.delete();
      warped.delete(); warpedGray.delete(); thresholded.delete();
      if (approxMat) approxMat.delete();

      setPreview(dataUrl);
      setStatus("preview");
    } catch {
      setErrorMsg("Error al procesar imagen");
      setStatus("error");
    }
  }, []);

  function confirm() {
    if (!preview) return;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCapture(preview);
  }

  function retake() {
    setPreview(null);
    setCornersFound(false);
    setStatus("scanning");
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">

      {/* Loading */}
      {status === "loading" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
          <p className="text-white text-sm">Cargando escáner…</p>
        </div>
      )}

      {/* Error */}
      {status === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-white text-lg font-semibold">⚠️ {errorMsg}</p>
          <button onClick={onClose} className="px-6 py-3 bg-white text-black rounded-xl font-medium">
            Cerrar
          </button>
        </div>
      )}

      {/* Processing */}
      {status === "processing" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
          <p className="text-white text-sm">Procesando documento…</p>
        </div>
      )}

      {/* Live camera view */}
      {(status === "scanning" || status === "processing") && (
        <div className={`${status === "processing" ? "hidden" : "flex"} flex-col flex-1`}>
          <div className="relative flex-1 overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Corner overlay canvas */}
            <canvas
              ref={overlayRef}
              className="absolute inset-0 w-full h-full"
              style={{ pointerEvents: "none" }}
            />
            {/* Guide frame when no corners detected */}
            {!cornersFound && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className="relative border-2 border-white border-opacity-50"
                  style={{ width: "82%", height: "62%", boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)" }}
                >
                  {/* Corner brackets */}
                  {[
                    "top-0 left-0 border-t-4 border-l-4 rounded-tl-sm",
                    "top-0 right-0 border-t-4 border-r-4 rounded-tr-sm",
                    "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-sm",
                    "bottom-0 right-0 border-b-4 border-r-4 rounded-br-sm",
                  ].map((cls, i) => (
                    <div key={i} className={`absolute w-7 h-7 border-white ${cls}`} />
                  ))}
                </div>
              </div>
            )}
            {/* Status pill */}
            <div className="absolute top-4 left-0 right-0 flex justify-center pointer-events-none">
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                cornersFound ? "bg-green-500 text-white" : "bg-black bg-opacity-50 text-white"
              }`}>
                {cornersFound ? "✓ Documento detectado" : "Apunta al documento"}
              </span>
            </div>
          </div>

          {/* Controls */}
          <div className="bg-black px-6 py-6 flex items-center justify-between safe-area-bottom">
            <button onClick={onClose} className="text-white text-sm w-16">
              Cancelar
            </button>
            <button
              onClick={capture}
              className="w-18 h-18 rounded-full border-4 border-white flex items-center justify-center"
              style={{ width: 72, height: 72 }}
            >
              <div className="w-14 h-14 rounded-full bg-white" />
            </button>
            <div className="w-16" />
          </div>
        </div>
      )}

      {/* Preview */}
      {status === "preview" && preview && (
        <div className="flex flex-col flex-1 bg-gray-900">
          <div className="flex-1 overflow-auto flex items-center justify-center p-4">
            <img src={preview} alt="Documento escaneado" className="max-w-full max-h-full rounded-lg shadow-lg" />
          </div>
          <div className="bg-black px-6 py-6 flex gap-3 safe-area-bottom">
            <button
              onClick={retake}
              className="flex-1 py-3 border border-white text-white rounded-xl font-medium text-sm"
            >
              Repetir
            </button>
            <button
              onClick={confirm}
              className="flex-1 py-3 bg-green-500 text-white rounded-xl font-semibold text-sm"
            >
              ✓ Usar imagen
            </button>
          </div>
        </div>
      )}

      {/* Hidden canvas for frame capture */}
      <canvas ref={hiddenRef} className="hidden" />
    </div>
  );
}
