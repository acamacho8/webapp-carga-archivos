import { extractText, renderPageAsImage } from 'unpdf';
import { createWorker } from 'tesseract.js';
import type { ComplianceStore, DocumentType } from '@/types/compliance';

const GAS_URL = process.env.COMPLIANCE_GAS_URL!;

const STORE_NAMES: Record<string, string> = {
  FQ01: 'CC Sambil',
  FQ28: 'El Marqués',
  FQ88: 'Sambil La Candelaria',
};

interface GasFileMeta {
  fileId: string;
  name: string;
  webViewLink: string;
  mimeType: string;
  storeId: string;
  size?: number;
}

// ─── Extraer store ID del nombre del archivo ──────────────────────────────────
function parseStoreId(filename: string): string | null {
  const match = filename.match(/\bFQ\s?(01|28|88)\b/i);
  if (!match) return null;
  return `FQ${match[1]}`;
}

// ─── Extraer fecha del nombre del archivo (fallback) ─────────────────────────
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

// ─── Extraer nombre del documento del nombre del archivo ─────────────────────
function parseDocName(filename: string): string {
  let name = filename.replace(/\.pdf$/i, '').trim();
  name = name.replace(/^FQ\s?\d{2}\s*/i, '').trim();
  name = name.replace(/\s*\d{4}-\d{2}-\d{2}\s*$/, '').trim();
  name = name.replace(/\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\s*$/, '').trim();
  name = name.replace(/\s*\d{1,2}\s+\d{4}\s*$/, '').trim();
  return name.slice(0, 50);
}

// ─── Detectar categoría del documento ────────────────────────────────────────
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
      const d = matchToDate(m); if (d) found.push(d);
    }
  }
  if (found.length === 0) return null;
  return found.sort().at(-1) ?? null;
}

function normalizeOcrText(raw: string): string {
  let t = raw.toLowerCase().replace(/\s+/g, ' ');
  t = t.replace(/(\d) (\d)/g, '$1$2');
  t = t.replace(/(\d) (\d)/g, '$1$2');
  return t;
}

function parseExpiryDate(text: string): string | null {
  const t = normalizeOcrText(text);

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
        if (m) { const issueDate = matchToDate(m); if (issueDate) return addOneYear(issueDate); }
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

  const medicalKeywords = ['serologia', 'hepatitis b', 'toxoide tetanico', 'vacunas recibidas', 'tension ocular'];
  const isMedicalCert = medicalKeywords.filter(kw => t.includes(kw)).length >= 2;
  if (isMedicalCert) {
    const issueDate = findFirstDate(t);
    if (issueDate) return addOneYear(issueDate);
  }

  return findFirstDate(t);
}

// ─── Claude Vision para certificados médicos venezolanos ─────────────────────
async function extractMedicalCertExpiry(pdfBuffer: Buffer): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const pngBuffer = await renderPageAsImage(new Uint8Array(pdfBuffer), 1, {
      scale: 2.0,
      canvasImport: () => import('@napi-rs/canvas'),
    });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: Buffer.from(pngBuffer).toString('base64') } },
        { type: 'text', text: `Extrae las fechas de este certificado de salud venezolano. Responde ÚNICAMENTE con JSON:\n{"fecha_vencimiento": "DD/MM/YYYY", "fecha_expedicion": "DD/MM/YYYY"}\nUsa null si no puedes leer una fecha.` },
      ]}],
    });
    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    const jsonMatch = raw.match(/\{[^}]+\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    const fv: string | null = parsed.fecha_vencimiento ?? null;
    if (!fv) return null;
    const parts = fv.split('/');
    if (parts.length === 3 && parts[2].length === 4) {
      const [d, m, y] = parts;
      return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
    return null;
  } catch (err) {
    console.warn('Claude Vision falló:', err);
    return null;
  }
}

// ─── OCR fallback para PDFs escaneados ───────────────────────────────────────
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

// ─── Descargar un archivo individual desde el GAS ────────────────────────────
async function fetchFileBase64(fileId: string): Promise<string> {
  const url = `${GAS_URL}?action=getFile&fileId=${encodeURIComponent(fileId)}`;
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`GAS getFile status ${res.status}`);
  const body = await res.json() as { base64?: string; error?: string };
  if (body.error) throw new Error(body.error);
  if (!body.base64) throw new Error('No base64 en respuesta');
  return body.base64;
}

// ─── Función principal exportada ─────────────────────────────────────────────
export async function processCompliance(): Promise<ComplianceStore[]> {
  // Paso 1: listar metadatos (rápido, sin base64)
  const listUrl = `${GAS_URL}?action=listCompliance`;
  const listRes = await fetch(listUrl, {
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  });

  if (!listRes.ok) throw new Error(`GAS listCompliance status ${listRes.status}`);

  const body = await listRes.json() as unknown;
  if (!Array.isArray(body)) {
    throw new Error(`GAS no retornó array: ${JSON.stringify(body).slice(0, 200)}`);
  }

  const files = body as GasFileMeta[];
  if (files.length === 0) return [];

  const storeMap = new Map<string, ComplianceStore>();

  // Paso 2: procesar cada archivo individualmente
  for (const file of files) {
    try {
      // Determinar storeId: primero desde el campo storeId del GAS, luego desde el nombre
      const storeId = file.storeId || parseStoreId(file.name);
      if (!storeId || !STORE_NAMES[storeId]) {
        console.warn(`Tienda no reconocida en: ${file.name}`);
        continue;
      }

      // Descargar base64 del archivo individualmente
      const base64 = await fetchFileBase64(file.fileId);
      const buffer = Buffer.from(base64, 'base64');

      let { text: pdfText } = await extractText(new Uint8Array(buffer), { mergePages: true });
      if (!pdfText.trim()) {
        console.log(`PDF escaneado: "${file.name}" — usando OCR`);
        pdfText = await ocrPdfText(buffer);
      }

      const isMedicalCertByName = /certificado\s*medico/i.test(file.name);
      let expiresAt: string;

      if (isMedicalCertByName) {
        const visionExpiry = await extractMedicalCertExpiry(buffer);
        if (visionExpiry) {
          expiresAt = visionExpiry;
        } else {
          const explicit = parseExpiryDate(pdfText);
          if (explicit) {
            expiresAt = explicit;
          } else {
            const normalizedText = normalizeOcrText(pdfText);
            const issueDate = findFirstDate(normalizedText);
            expiresAt = issueDate ? addOneYear(issueDate) : (parseDateFromFilename(file.name) ?? '1970-01-01');
          }
        }
      } else {
        expiresAt = parseExpiryDate(pdfText) ?? parseDateFromFilename(file.name) ?? '1970-01-01';
      }

      const docName = parseDocName(file.name);

      if (!storeMap.has(storeId)) {
        storeMap.set(storeId, { id: storeId, name: STORE_NAMES[storeId], documents: [] });
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
