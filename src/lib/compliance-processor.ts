import { extractText, renderPageAsImage } from 'unpdf';
import { createWorker } from 'tesseract.js';
import type { ComplianceStore, DocumentType } from '@/types/compliance';

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

  // ── Detectar "vigente por un año" / "válido por 1 año" ────────────────────
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
        if (m) {
          const issueDate = matchToDate(m);
          if (issueDate) return addOneYear(issueDate);
        }
      }
    }
    const firstDate = findFirstDate(t);
    if (firstDate) return addOneYear(firstDate);
  }

  // ── Buscar fecha explícita de vencimiento ─────────────────────────────────
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

  // ── Detectar rangos de período ────────────────────────────────────────────
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

  // ── Certificados médicos venezolanos: emisión + 1 año (último recurso) ──────
  // La firma del médico puede tapar el año del vencimiento en el scan.
  // Solo llega aquí si no se encontró ninguna fecha explícita de vencimiento arriba.
  const medicalKeywords = ['serologia', 'hepatitis b', 'toxoide tetanico', 'vacunas recibidas', 'tension ocular'];
  const isMedicalCert = medicalKeywords.filter(kw => t.includes(kw)).length >= 2;
  if (isMedicalCert) {
    const issueDate = findFirstDate(t);
    if (issueDate) return addOneYear(issueDate);
  }

  // ── Fallback: primera fecha en el documento ───────────────────────────────
  return findFirstDate(t);
}

// ─── Claude Vision para certificados médicos venezolanos ─────────────────────
// Más fiable que Tesseract cuando la firma cubre el año de vencimiento en el sello.
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
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: Buffer.from(pngBuffer).toString('base64'),
            },
          },
          {
            type: 'text',
            text: `Actúa como un experto en gestión de documentos legales y de salud. Analiza la imagen adjunta de este certificado de salud de Venezuela y extrae la siguiente información de forma estructurada:
Vigencia: Fecha de expedición y, específicamente, la Fecha de Vencimiento indicada en los sellos.

Responde ÚNICAMENTE con un JSON en este formato exacto, sin texto adicional:
{"fecha_vencimiento": "DD/MM/YYYY", "fecha_expedicion": "DD/MM/YYYY"}

Si no puedes leer una fecha con certeza, usa null para ese campo.`,
          },
        ],
      }],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    // Extraer JSON aunque Claude añada texto alrededor
    const jsonMatch = raw.match(/\{[^}]+\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const fv: string | null = parsed.fecha_vencimiento ?? null;
    if (!fv) return null;

    // Parsear DD/MM/YYYY → YYYY-MM-DD
    const parts = fv.split('/');
    if (parts.length === 3 && parts[2].length === 4) {
      const [d, m, y] = parts;
      return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
    return null;
  } catch (err) {
    console.warn('Claude Vision falló para certificado médico:', err);
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

// ─── Función principal exportada ─────────────────────────────────────────────
export async function processCompliance(): Promise<ComplianceStore[]> {
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

      let { text: pdfText } = await extractText(new Uint8Array(buffer), { mergePages: true });
      if (!pdfText.trim()) {
        console.log(`PDF escaneado detectado: "${file.name}" — usando OCR`);
        pdfText = await ocrPdfText(buffer);
      }

      const isMedicalCertByName = /certificado\s*medico/i.test(file.name);

      let expiresAt: string;
      if (isMedicalCertByName) {
        // 1) Claude Vision: lee el sello directamente aunque la firma tape parte del texto
        const visionExpiry = await extractMedicalCertExpiry(buffer);
        if (visionExpiry) {
          expiresAt = visionExpiry;
          console.log(`Certificado médico "${file.name}": Claude Vision → vence ${expiresAt}`);
        } else {
          // 2) Fallback: parsear texto del PDF con regexes
          const explicit = parseExpiryDate(pdfText);
          if (explicit) {
            expiresAt = explicit;
            console.log(`Certificado médico "${file.name}": fecha explícita → vence ${expiresAt}`);
          } else {
            // 3) Último recurso: fecha de emisión + 1 año
            const normalizedText = normalizeOcrText(pdfText);
            const issueDate = findFirstDate(normalizedText);
            expiresAt = issueDate
              ? addOneYear(issueDate)
              : (parseDateFromFilename(file.name) ?? '1970-01-01');
            console.log(`Certificado médico "${file.name}": emisión ${issueDate ?? '?'} → vence ${expiresAt}`);
          }
        }
      } else {
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
