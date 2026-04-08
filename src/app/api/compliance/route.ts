import { NextResponse } from 'next/server';
import { extractText, renderPageAsImage } from 'unpdf';
import { createWorker } from 'tesseract.js';
import type { ComplianceStore } from '@/types/compliance';

const GAS_URL = process.env.COMPLIANCE_GAS_URL!;

const STORE_NAMES: Record<string, string> = {
  FQ01: 'CC Sambil',
  FQ28: 'El Marqués',
  FQ88: 'Sambil La Candelaria',
};

interface GasFile {
  fileId: string;
  name: string;
  webViewLink: string;
  base64: string;
}

// ─── Extraer store ID del nombre del archivo ──────────────────────────────────
function parseStoreId(filename: string): string | null {
  // Acepta: "FQ88", "FQ 88", "FQ01", "FQ 01", "FQ28", "FQ 28"
  const match = filename.match(/\bFQ\s?(01|28|88)\b/i);
  if (!match) return null;
  return `FQ${match[1]}`;
}

// ─── Extraer fecha del nombre del archivo (fallback) ─────────────────────────
// Acepta: YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY al final del nombre
function parseDateFromFilename(filename: string): string | null {
  const name = filename.replace(/\.pdf$/i, '');

  // YYYY-MM-DD
  const iso = name.match(/(\d{4})-(\d{2})-(\d{2})\s*$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // DD-MM-YYYY o DD/MM/YYYY
  const dmy = name.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s*$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;

  // MM YYYY al final (ej: "12 2025") → último día del mes
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

// ─── Extraer nombre del documento del nombre del archivo ─────────────────────
function parseDocName(filename: string): string {
  // Quitar extensión
  let name = filename.replace(/\.pdf$/i, '').trim();
  // Quitar prefijo de tienda "FQ 88 " o "FQ88 "
  name = name.replace(/^FQ\s?\d{2}\s*/i, '').trim();
  // Quitar fecha al final si existe (YYYY-MM-DD, DD-MM-YYYY, MM YYYY)
  name = name.replace(/\s*\d{4}-\d{2}-\d{2}\s*$/, '').trim();
  name = name.replace(/\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\s*$/, '').trim();
  name = name.replace(/\s*\d{1,2}\s+\d{4}\s*$/, '').trim();
  // Truncar a 50 chars
  return name.slice(0, 50);
}

// ─── Detectar categoría del documento ────────────────────────────────────────
import type { DocumentType } from '@/types/compliance';

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

// ─── Helpers de fecha ─────────────────────────────────────────────────────────
const MONTHS: Record<string, string> = {
  // Nombres completos
  enero: '01', febrero: '02', marzo: '03', abril: '04',
  mayo: '05', junio: '06', julio: '07', agosto: '08',
  septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
  // Abreviaturas de 3 letras (certificados físicos escaneados, ej: "03 NOV 2026")
  ene: '01', feb: '02', mar: '03', abr: '04',
  may: '05', jun: '06', jul: '07', ago: '08',
  sep: '09', set: '09', oct: '10', nov: '11', dic: '12',
};

const MONTH_NAMES = Object.keys(MONTHS).join('|');

const DATE_PATTERNS = [
  // DD/MM/YYYY o DD-MM-YYYY
  /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
  // YYYY-MM-DD
  /(\d{4})-(\d{2})-(\d{2})/,
  // D de MMMM de YYYY (español)
  new RegExp(`(\\d{1,2})\\s+de\\s+(${MONTH_NAMES})\\s+(?:del?\\s+)?(\\d{4})`),
  // DD MMM YYYY o DD/MMM/YYYY (ej: "03 NOV 2026", "03/nov/2025") — certificados físicos
  new RegExp(`(\\d{1,2})[\\s\\/\\-](${MONTH_NAMES})[\\s\\/\\-](\\d{4})`),
  // MMMM YYYY
  new RegExp(`(${MONTH_NAMES})\\s+(?:del?\\s+)?(\\d{4})`),
];

// Convierte un match de DATE_PATTERNS a YYYY-MM-DD, o null si no aplica
function matchToDate(m: RegExpMatchArray): string | null {
  // DD/MM/YYYY o DD-MM-YYYY
  if (/^\d{1,2}$/.test(m[1]) && /^\d{1,2}$/.test(m[2]) && /^\d{4}$/.test(m[3])) {
    return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  }
  // YYYY-MM-DD
  if (/^\d{4}$/.test(m[1]) && /^\d{2}$/.test(m[2]) && /^\d{2}$/.test(m[3])) {
    return `${m[1]}-${m[2]}-${m[3]}`;
  }
  // D de MMMM de YYYY
  if (MONTHS[m[2]]) {
    return `${m[3]}-${MONTHS[m[2]]}-${m[1].padStart(2,'0')}`;
  }
  // MMMM YYYY → último día del mes
  if (MONTHS[m[1]] && /^\d{4}$/.test(m[2])) {
    const mo = parseInt(MONTHS[m[1]]);
    const lastDay = new Date(parseInt(m[2]), mo, 0).getDate();
    return `${m[2]}-${MONTHS[m[1]]}-${String(lastDay).padStart(2,'0')}`;
  }
  return null;
}

// Suma 1 año a una fecha YYYY-MM-DD
function addOneYear(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const next = new Date(y + 1, mo - 1, d);
  return `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-${String(next.getDate()).padStart(2,'0')}`;
}

// Extrae la primera fecha que aparece en el texto (para usarla como fecha de emisión)
function findFirstDate(t: string): string | null {
  for (const pat of DATE_PATTERNS) {
    const m = t.match(pat);
    if (m) {
      const d = matchToDate(m);
      if (d) return d;
    }
  }
  return null;
}

// Extrae TODAS las fechas de un snippet y devuelve la más tardía (útil para vencimientos)
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
  if (found.length === 0) return null;
  return found.sort().at(-1) ?? null; // la fecha más futura
}

// ─── Normalizar texto OCR: une dígitos separados por espacios ────────────────
// El OCR a menudo lee "0 3" en vez de "03", "2 0 2 6" en vez de "2026"
function normalizeOcrText(raw: string): string {
  let t = raw.toLowerCase().replace(/\s+/g, ' ');
  // Dos pasadas para cubrir "2 0 2 6" → "2026"
  t = t.replace(/(\d) (\d)/g, '$1$2');
  t = t.replace(/(\d) (\d)/g, '$1$2');
  return t;
}

// ─── Extraer fecha de vencimiento del texto del PDF ──────────────────────────
function parseExpiryDate(text: string): string | null {
  const t = normalizeOcrText(text);

  // ── Certificados médicos venezolanos (MPPS / Ministerio de Salud) ─────────
  // La firma del médico suele cubrir el año del vencimiento → OCR lo lee mal.
  // Solución fiable: fecha de emisión + 1 año (vigencia legal siempre 1 año).
  const medicalKeywords = ['serologia', 'hepatitis b', 'toxoide tetanico', 'vacunas recibidas', 'tension ocular'];
  const isMedicalCert = medicalKeywords.filter(kw => t.includes(kw)).length >= 2;
  if (isMedicalCert) {
    // La fecha de emisión aparece múltiples veces (Serología, HIV, etc.) → muy fiable
    const issueDate = findFirstDate(t);
    if (issueDate) return addOneYear(issueDate);
  }

  // ── Detectar "vigente por un año" / "válido por 1 año" ────────────────────
  // Si el documento dice que tiene vigencia de 1 año, calculamos:
  // fecha de vencimiento = fecha de emisión + 1 año
  const ONE_YEAR_PATTERNS = [
    /v[aá]lid[oa]\s+(?:por\s+)?(?:un|1|uno)\s+(?:\(1\)\s+)?a[ñn]o/,
    /vigente\s+(?:por\s+)?(?:un|1|uno)\s+(?:\(1\)\s+)?a[ñn]o/,
    /vigencia\s+de\s+(?:un|1|uno)\s+(?:\(1\)\s+)?a[ñn]o/,
    /por\s+(?:el\s+)?per[ií]odo\s+de\s+(?:un|1|uno)\s+(?:\(1\)\s+)?a[ñn]o/,
    /durante\s+(?:un|1|uno)\s+(?:\(1\)\s+)?a[ñn]o/,
    /por\s+(?:un|1|uno)\s+(?:\(1\)\s+)?a[ñn]o/,
  ];

  // Solo aplica si hay una fecha de vencimiento EXPLÍCITA que lo confirme;
  // si el doc ya tiene "fecha vencimiento" con fecha, esa tiene prioridad
  const hasExplicitExpiry = ['fecha vencimiento', 'fecha de vencimiento', 'vencimiento:', 'vence el']
    .some(kw => t.includes(kw));
  const hasOneYear = !hasExplicitExpiry && ONE_YEAR_PATTERNS.some(p => p.test(t));

  if (hasOneYear) {
    // Buscar la fecha de emisión — keywords comunes
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
        if (m) {
          const issueDate = matchToDate(m);
          if (issueDate) return addOneYear(issueDate);
        }
      }
    }
    // Si no hay keyword de emisión, usar la primera fecha encontrada en el doc
    const firstDate = findFirstDate(t);
    if (firstDate) return addOneYear(firstDate);
  }

  // ── Buscar fecha explícita de vencimiento ─────────────────────────────────
  const EXPIRY_KEYWORDS = [
    // Certificados médicos venezolanos (físicos escaneados)
    'fecha vencimiento:', 'fecha vencimiento', 'fechavencimiento',
    'fecha de vencimiento:', 'fecha de vencimiento',
    // Genéricos
    'vence el', 'vence:', 'vence', 'vencimiento:', 'vencimiento',
    'válido hasta', 'valido hasta', 'vigente hasta', 'vigencia hasta',
    'expira el', 'expira:', 'hasta el', 'hasta:', 'vigencia:', 'vigencia hasta el',
    'caduca:', 'caduca', 'caducidad:',
  ];

  for (const kw of EXPIRY_KEYWORDS) {
    const idx = t.indexOf(kw);
    if (idx === -1) continue;
    // Ventana ampliada: toma la fecha MÁS TARDÍA del snippet (evita confundir fecha de emisión con vencimiento)
    const snippet = t.slice(idx + kw.length, idx + kw.length + 120);
    const d = findLatestDateInSnippet(snippet);
    if (d) return d;
  }

  // ── Detectar rangos de período con "al" o " - " como separador ──────────────
  // Ej: "Período: 28/05/2024 al 28/05/2027"  →  2027-05-28
  // Ej: "Período: 01/01/2026 - 31/12/2026"   →  2026-12-31
  // Ej: "Vigente del 07/12/2024 al 07/12/2027" → 2027-12-07
  // Ej: "del 07/12/2024 al 07/12/2027"         → 2027-12-07
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

  // ── Fallback: primera fecha en el documento ───────────────────────────────
  return findFirstDate(t);
}

// ─── OCR fallback para PDFs escaneados ───────────────────────────────────────
async function ocrPdfText(buffer: Buffer): Promise<string> {
  // Renderizar página 1 como PNG usando unpdf con @napi-rs/canvas
  const pngBuffer = await renderPageAsImage(new Uint8Array(buffer), 1, {
    scale: 2.0,
    canvasImport: () => import('@napi-rs/canvas'),
  });

  // OCR con Tesseract en español
  const worker = await createWorker('spa');
  try {
    const { data: { text } } = await worker.recognize(Buffer.from(pngBuffer));
    return text;
  } finally {
    await worker.terminate();
  }
}

// ─── Caché en memoria + deduplicación de peticiones en vuelo ─────────────────
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora
let cache: { data: ComplianceStore[]; ts: number } | null = null;
let inFlight: Promise<ComplianceStore[]> | null = null;

async function processCompliance(): Promise<ComplianceStore[]> {
  const gasRes = await fetch(`${GAS_URL}?action=listCompliance`, {
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
  });

  if (!gasRes.ok) throw new Error(`GAS status ${gasRes.status}`);

  const body = await gasRes.json() as unknown;
  if (!Array.isArray(body)) {
    throw new Error(`GAS no retornó array: ${JSON.stringify(body).slice(0, 200)}`);
  }

  const files = body as GasFile[];
  if (files.length === 0) return [];

  const storeMap = new Map<string, ComplianceStore>();

  for (const file of files) {
    try {
      const storeId = parseStoreId(file.name);
      if (!storeId || !STORE_NAMES[storeId]) {
        console.warn(`Tienda no reconocida en: ${file.name}`);
        continue;
      }

      const buffer = Buffer.from(file.base64, 'base64');

      // Intentar extracción de texto nativa; si está vacío → OCR
      let { text: pdfText } = await extractText(new Uint8Array(buffer), { mergePages: true });
      if (!pdfText.trim()) {
        console.log(`PDF escaneado detectado: "${file.name}" — usando OCR`);
        pdfText = await ocrPdfText(buffer);
      }

      // Certificados médicos venezolanos: la firma del médico tapa el año del vencimiento
      // en el scan. Fiabilidad 100%: se detecta por nombre de archivo → vigencia = 1 año.
      const isMedicalCertByName = /certificado\s*medico/i.test(file.name);

      let expiresAt: string;
      if (isMedicalCertByName) {
        const normalizedText = normalizeOcrText(pdfText);
        const issueDate = findFirstDate(normalizedText);
        expiresAt = issueDate
          ? addOneYear(issueDate)
          : (parseDateFromFilename(file.name) ?? '1970-01-01');
        console.log(`Certificado médico "${file.name}": emisión ${issueDate ?? '?'} → vence ${expiresAt}`);
      } else {
        // Prioridad: texto del PDF → nombre del archivo → fallback vencido
        expiresAt = parseExpiryDate(pdfText)
          ?? parseDateFromFilename(file.name)
          ?? '1970-01-01';
      }
      const docName = parseDocName(file.name);

      if (!storeMap.has(storeId)) {
        storeMap.set(storeId, {
          id: storeId,
          name: STORE_NAMES[storeId],
          documents: [],
        });
      }

      storeMap.get(storeId)!.documents.push({
        id: file.fileId,
        type: detectDocType(file.name),
        name: docName,
        expires_at: expiresAt,
        file_url: file.webViewLink,
      });

    } catch (err) {
      console.error(`Error procesando "${file.name}":`, err);
    }
  }

  return Array.from(storeMap.values());
}

// ─── API Route ────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const bust = new URL(req.url).searchParams.has('bust');

  // Servir desde caché si está fresca y no es un refresh forzado
  if (!bust && cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  // Deduplicar peticiones en vuelo (StrictMode doble-mount, refresh concurrente, etc.)
  if (!inFlight) {
    inFlight = processCompliance()
      .then(data => { cache = { data, ts: Date.now() }; return data; })
      .finally(() => { inFlight = null; });
  }

  try {
    return NextResponse.json(await inFlight);
  } catch (err) {
    console.error('Compliance API error:', err);
    if (cache) return NextResponse.json(cache.data); // caché obsoleta como fallback
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}
