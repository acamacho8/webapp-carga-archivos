import { NextResponse } from 'next/server';
import { extractText, renderPageAsImage } from 'unpdf';
import { createWorker } from 'tesseract.js';
import type { ComplianceStore, DocumentType } from '@/types/compliance';

export const maxDuration = 60;

const GAS_URL = process.env.COMPLIANCE_GAS_URL!;

const STORE_NAMES: Record<string, string> = {
  FQ01: 'CC Sambil',
  FQ28: 'El Marqués',
  FQ88: 'Sambil La Candelaria',
};

// Resultado procesado de un PDF — lo que guardamos en PropertiesService
interface CachedDoc {
  fileId: string;
  storeId: string;
  storeName: string;
  docType: string;
  docName: string;
  expiresAt: string;
  fileUrl: string;
}

// Lo que devuelve GAS en listCompliance
interface GasFile {
  fileId: string;
  name: string;
  webViewLink: string;
  storeId?: string;
  base64?: string; // ausente si ya estaba en caché
}

// ─── Extraer store ID del nombre del archivo ──────────────────
function parseStoreId(filename: string): string | null {
  const match = filename.match(/\bFQ\s?(01|28|88)\b/i);
  return match ? `FQ${match[1]}` : null;
}

// ─── Extraer fecha del nombre del archivo ─────────────────────
function parseDateFromFilename(filename: string): string | null {
  const name = filename.replace(/\.pdf$/i, '');
  const iso = name.match(/(\d{4})-(\d{2})-(\d{2})\s*$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = name.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s*$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
  const my = name.match(/(\d{1,2})\s+(\d{4})\s*$/);
  if (my) {
    const mo = parseInt(my[1]);
    const yr = parseInt(my[2]);
    if (mo >= 1 && mo <= 12) {
      const lastDay = new Date(yr, mo, 0).getDate();
      return `${yr}-${String(mo).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    }
  }
  return null;
}

// ─── Extraer nombre del documento del nombre del archivo ──────
function parseDocName(filename: string): string {
  let name = filename.replace(/\.pdf$/i, '').trim();
  name = name.replace(/^FQ\s?\d{2}\s*/i, '').trim();
  name = name.replace(/\s*\d{4}-\d{2}-\d{2}\s*$/, '').trim();
  name = name.replace(/\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\s*$/, '').trim();
  name = name.replace(/\s*\d{1,2}\s+\d{4}\s*$/, '').trim();
  return name.slice(0, 50);
}

// ─── Detectar categoría del documento ────────────────────────
function detectDocType(name: string): DocumentType {
  const n = name.toLowerCase();
  if (/propaganda|publicidad/.test(n)) return 'publicidad';
  if (/permiso\s*sanitario/.test(n))    return 'permiso_sanitario';
  if (/conformidad\s*sanitaria/.test(n)) return 'permiso_sanitario';
  if (/conformidad[_\s]de[_\s]uso|conformidad_de_uso/.test(n)) return 'conformidad_uso';
  if (/registro\s*de\s*contribuyente|licencia\s*de\s*actividad/.test(n)) return 'registro_contribuyente';
  if (/inces/.test(n))                  return 'inces';
  if (/impuesto|declaraci[oó]n/.test(n)) return 'impuesto';
  return 'patente';
}

// ─── Helpers de fecha ────────────────────────────────────────
const MONTHS: Record<string, string> = {
  enero: '01', febrero: '02', marzo: '03', abril: '04',
  mayo: '05', junio: '06', julio: '07', agosto: '08',
  septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
  ene: '01', feb: '02', mar: '03', abr: '04',
  may: '05', jun: '06', jul: '07', ago: '08',
  sep: '09', set: '09', oct: '10', nov: '11', dic: '12',
};

const MONTH_NAMES = Object.keys(MONTHS).join('|');

const DATE_PATTERNS = [
  /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
  /(\d{4})-(\d{2})-(\d{2})/,
  new RegExp(`(\\d{1,2})\\s+de\\s+(${MONTH_NAMES})\\s+(?:del?\\s+)?(\\d{4})`),
  new RegExp(`(\\d{1,2})[\\s\\/\\-](${MONTH_NAMES})[\\s\\/\\-](\\d{4})`),
  new RegExp(`(${MONTH_NAMES})\\s+(?:del?\\s+)?(\\d{4})`),
];

function matchToDate(m: RegExpMatchArray): string | null {
  if (/^\d{1,2}$/.test(m[1]) && /^\d{1,2}$/.test(m[2]) && /^\d{4}$/.test(m[3])) {
    return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  }
  if (/^\d{4}$/.test(m[1]) && /^\d{2}$/.test(m[2]) && /^\d{2}$/.test(m[3])) {
    return `${m[1]}-${m[2]}-${m[3]}`;
  }
  if (MONTHS[m[2]]) {
    return `${m[3]}-${MONTHS[m[2]]}-${m[1].padStart(2,'0')}`;
  }
  if (MONTHS[m[1]] && /^\d{4}$/.test(m[2])) {
    const mo = parseInt(MONTHS[m[1]]);
    const lastDay = new Date(parseInt(m[2]), mo, 0).getDate();
    return `${m[2]}-${MONTHS[m[1]]}-${String(lastDay).padStart(2,'0')}`;
  }
  return null;
}

function addOneYear(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const next = new Date(y + 1, mo - 1, d);
  return `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-${String(next.getDate()).padStart(2,'0')}`;
}

function findFirstDate(t: string): string | null {
  for (const pat of DATE_PATTERNS) {
    const m = t.match(pat);
    if (m) { const d = matchToDate(m); if (d) return d; }
  }
  return null;
}

function findLatestDateInSnippet(snippet: string): string | null {
  const found: string[] = [];
  for (const pat of DATE_PATTERNS) {
    const gPat = new RegExp(pat.source, 'gi');
    let m: RegExpExecArray | null;
    while ((m = gPat.exec(snippet)) !== null) {
      const d = matchToDate(m);
      if (d) found.push(d);
    }
  }
  return found.length === 0 ? null : (found.sort().at(-1) ?? null);
}

function normalizeOcrText(raw: string): string {
  let t = raw.toLowerCase().replace(/\s+/g, ' ');
  t = t.replace(/(\d) (\d)/g, '$1$2');
  t = t.replace(/(\d) (\d)/g, '$1$2');
  return t;
}

function parseExpiryDate(text: string): string | null {
  const t = normalizeOcrText(text);

  const medicalKeywords = ['serologia', 'hepatitis b', 'toxoide tetanico', 'vacunas recibidas', 'tension ocular'];
  if (medicalKeywords.filter(kw => t.includes(kw)).length >= 2) {
    const issueDate = findFirstDate(t);
    if (issueDate) return addOneYear(issueDate);
  }

  const ONE_YEAR_PATTERNS = [
    /v[aá]lid[oa]\s+(?:por\s+)?(?:un|1|uno)\s+(?:\(1\)\s+)?a[ñn]o/,
    /vigente\s+(?:por\s+)?(?:un|1|uno)\s+(?:\(1\)\s+)?a[ñn]o/,
    /vigencia\s+de\s+(?:un|1|uno)\s+(?:\(1\)\s+)?a[ñn]o/,
    /por\s+(?:el\s+)?per[ií]odo\s+de\s+(?:un|1|uno)\s+(?:\(1\)\s+)?a[ñn]o/,
    /durante\s+(?:un|1|uno)\s+(?:\(1\)\s+)?a[ñn]o/,
    /por\s+(?:un|1|uno)\s+(?:\(1\)\s+)?a[ñn]o/,
  ];

  const hasExplicitExpiry = ['fecha vencimiento', 'fecha de vencimiento', 'vencimiento:', 'vence el']
    .some(kw => t.includes(kw));
  const hasOneYear = !hasExplicitExpiry && ONE_YEAR_PATTERNS.some(p => p.test(t));

  if (hasOneYear) {
    const ISSUE_KEYWORDS = [
      'fecha de expedición', 'fecha de emision', 'fecha de emisión',
      'expedido el', 'expedida el', 'emitido el', 'emitida el',
      'otorgado el', 'otorgada el', 'fecha:', 'fecha ',
    ];
    for (const kw of ISSUE_KEYWORDS) {
      const idx = t.indexOf(kw);
      if (idx === -1) continue;
      const snippet = t.slice(idx + kw.length, idx + kw.length + 80);
      for (const pat of DATE_PATTERNS) {
        const m = snippet.match(pat);
        if (m) { const d = matchToDate(m); if (d) return addOneYear(d); }
      }
    }
    const firstDate = findFirstDate(t);
    if (firstDate) return addOneYear(firstDate);
  }

  const EXPIRY_KEYWORDS = [
    'fecha vencimiento:', 'fecha vencimiento', 'fechavencimiento',
    'fecha de vencimiento:', 'fecha de vencimiento',
    'vence el', 'vence:', 'vence', 'vencimiento:', 'vencimiento',
    'válido hasta', 'valido hasta', 'vigente hasta', 'vigencia hasta',
    'expira el', 'expira:', 'hasta el', 'hasta:', 'vigencia:', 'vigencia hasta el',
    'caduca:', 'caduca', 'caducidad:',
  ];

  for (const kw of EXPIRY_KEYWORDS) {
    const idx = t.indexOf(kw);
    if (idx === -1) continue;
    const snippet = t.slice(idx + kw.length, idx + kw.length + 120);
    const d = findLatestDateInSnippet(snippet);
    if (d) return d;
  }

  const RANGE_PATTERNS = [
    /per[ií]odo[:\s]+[\d\/\-]+\s+al\s+/i,
    /per[ií]odo[:\s]+[\d\/]+\s+-\s+/i,
    /(?:vigente\s+)?(?:del|desde)\s+[\d\/\-]+\s+al\s+/i,
  ];
  for (const rx of RANGE_PATTERNS) {
    const rm = rx.exec(t);
    if (!rm) continue;
    const afterSep = t.slice(rm.index + rm[0].length, rm.index + rm[0].length + 60);
    const d = findLatestDateInSnippet(afterSep);
    if (d) return d;
  }

  return findFirstDate(t);
}

// ─── OCR para PDFs escaneados ─────────────────────────────────
async function ocrPdfText(buffer: Buffer): Promise<string> {
  const pngBuffer = await renderPageAsImage(new Uint8Array(buffer), 1, {
    scale: 2.0,
    canvasImport: () => import('@napi-rs/canvas'),
  });
  const worker = await createWorker('spa');
  try {
    const { data: { text } } = await worker.recognize(Buffer.from(pngBuffer));
    return text;
  } finally {
    await worker.terminate();
  }
}

// ─── Procesar un PDF y devolver CachedDoc ─────────────────────
async function processPdf(file: GasFile): Promise<CachedDoc | null> {
  const storeId = file.storeId ?? parseStoreId(file.name);
  if (!storeId || !STORE_NAMES[storeId]) {
    console.warn(`Tienda no reconocida: ${file.name}`);
    return null;
  }
  if (!file.base64) return null;

  const buffer = Buffer.from(file.base64, 'base64');
  let { text: pdfText } = await extractText(new Uint8Array(buffer), { mergePages: true });
  if (!pdfText.trim()) {
    console.log(`PDF escaneado: "${file.name}" — usando OCR`);
    pdfText = await ocrPdfText(buffer);
  }

  const isMedicalCert = /certificado\s*medico/i.test(file.name);
  let expiresAt: string;
  if (isMedicalCert) {
    const issueDate = findFirstDate(normalizeOcrText(pdfText));
    expiresAt = issueDate ? addOneYear(issueDate) : (parseDateFromFilename(file.name) ?? '1970-01-01');
  } else {
    expiresAt = parseExpiryDate(pdfText) ?? parseDateFromFilename(file.name) ?? '1970-01-01';
  }

  return {
    fileId: file.fileId,
    storeId,
    storeName: STORE_NAMES[storeId],
    docType: detectDocType(file.name),
    docName: parseDocName(file.name),
    expiresAt,
    fileUrl: file.webViewLink,
  };
}

// ─── Caché en memoria (L1) — válida dentro de una instancia ───
const MEM_TTL_MS = 5 * 60 * 1000; // 5 minutos
let memCache: { data: ComplianceStore[]; ts: number } | null = null;
let inFlight: Promise<ComplianceStore[]> | null = null;

// ─── Lógica principal con caché persistente en GAS ────────────
async function processCompliance(bust: boolean): Promise<ComplianceStore[]> {
  // ── 1. Obtener caché persistente de GAS ──────────────────────
  let cachedDocs: CachedDoc[] = [];
  try {
    const cacheRes = await fetch(`${GAS_URL}?action=getCache`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    if (cacheRes.ok) {
      const body = await cacheRes.json();
      if (Array.isArray(body)) cachedDocs = body;
    }
  } catch (err) {
    console.warn('No se pudo obtener caché de GAS:', err);
  }

  const cachedMap = new Map<string, CachedDoc>(cachedDocs.map(d => [d.fileId, d]));

  // En bust, ignoramos el caché y reprocesamos todo
  const skipIds = bust ? '' : Array.from(cachedMap.keys()).join(',');

  // ── 2. Listar archivos de Drive (con base64 solo para nuevos) ─
  const listUrl = `${GAS_URL}?action=listCompliance${skipIds ? `&skip=${skipIds}` : ''}`;
  const listRes = await fetch(listUrl, {
    redirect: 'follow',
    signal: AbortSignal.timeout(55_000),
  });

  if (!listRes.ok) throw new Error(`GAS listCompliance status ${listRes.status}`);

  const allFiles = await listRes.json() as GasFile[];
  if (!Array.isArray(allFiles)) throw new Error(`GAS no devolvió array: ${JSON.stringify(allFiles).slice(0, 200)}`);

  // IDs actualmente en Drive (para descartar archivos eliminados del caché)
  const validFileIds = new Set(allFiles.map(f => f.fileId));

  // ── 3. Procesar solo archivos nuevos (los que traen base64) ───
  const newFiles = allFiles.filter(f => f.base64);
  const newResults: CachedDoc[] = [];

  if (newFiles.length > 0) {
    console.log(`Procesando ${newFiles.length} PDFs nuevos...`);
    const CONCURRENCY = 5;
    for (let i = 0; i < newFiles.length; i += CONCURRENCY) {
      const batch = newFiles.slice(i, i + CONCURRENCY);
      const settled = await Promise.allSettled(batch.map(processPdf));
      for (const r of settled) {
        if (r.status === 'fulfilled' && r.value) newResults.push(r.value);
        else if (r.status === 'rejected') console.error('Error procesando PDF:', r.reason);
      }
    }

    // ── 4. Guardar nuevos resultados en GAS (awaited — Vercel mata fire-and-forget) ─
    try {
      await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _action: 'saveCache', results: newResults }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      console.error('Error guardando caché en GAS:', err);
    }
  }

  // ── 5. Combinar caché + nuevos, descartando archivos eliminados
  const storeMap = new Map<string, ComplianceStore>();

  const allDocs: CachedDoc[] = [
    ...Array.from(cachedMap.values()).filter(d => validFileIds.has(d.fileId)),
    ...newResults,
  ];

  for (const doc of allDocs) {
    if (!storeMap.has(doc.storeId)) {
      storeMap.set(doc.storeId, {
        id: doc.storeId,
        name: doc.storeName,
        documents: [],
      });
    }
    storeMap.get(doc.storeId)!.documents.push({
      id: doc.fileId,
      type: doc.docType as DocumentType,
      name: doc.docName,
      expires_at: doc.expiresAt,
      file_url: doc.fileUrl,
    });
  }

  return Array.from(storeMap.values());
}

// ─── API Route ────────────────────────────────────────────────
export async function GET(req: Request) {
  const bust = new URL(req.url).searchParams.has('bust');

  // L1: caché en memoria (válida 5 min dentro de la misma instancia)
  if (!bust && memCache && Date.now() - memCache.ts < MEM_TTL_MS) {
    return NextResponse.json(memCache.data);
  }

  if (!inFlight) {
    inFlight = processCompliance(bust)
      .then(data => { memCache = { data, ts: Date.now() }; return data; })
      .finally(() => { inFlight = null; });
  }

  try {
    return NextResponse.json(await inFlight);
  } catch (err) {
    console.error('Compliance API error:', err);
    if (memCache) return NextResponse.json(memCache.data);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}
