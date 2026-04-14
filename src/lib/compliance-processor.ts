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
  storeId?: string;
  size?: number;
  // GAS viejo puede incluir base64 — lo ignoramos
  base64?: string;
}

// ─── Extraer store ID del nombre del archivo ──────────────────────────────────
function parseStoreId(filename: string): string | null {
  const match = filename.match(/\bFQ\s?(01|28|88)\b/i);
  if (!match) return null;
  return `FQ${match[1]}`;
}

// ─── Extraer nombre limpio del documento ─────────────────────────────────────
function parseDocName(filename: string): string {
  let name = filename.replace(/\.(pdf|jpg|jpeg|png)$/i, '').trim();
  name = name.replace(/^FQ\s?\d{2}\s*/i, '').trim();
  name = name.replace(/\s*\d{4}[-_]\d{2}[-_]\d{2}\s*$/, '').trim();
  name = name.replace(/\s*\d{1,2}[-\/]\d{1,2}[-\/]\d{4}\s*$/, '').trim();
  name = name.replace(/\s*\d{1,2}\s+\d{4}\s*$/, '').trim();
  return name.slice(0, 60) || filename.slice(0, 60);
}

// ─── Detectar categoría del documento ────────────────────────────────────────
function detectDocType(name: string): DocumentType {
  const n = name.toLowerCase();
  if (/propaganda|publicidad/.test(n))                               return 'publicidad';
  if (/permiso\s*sanitario|sanidad|sanitario/.test(n))               return 'permiso_sanitario';
  if (/conformidad\s*sanitaria/.test(n))                             return 'permiso_sanitario';
  if (/conformidad[_\s]de[_\s]uso|conformidad_de_uso/.test(n))       return 'conformidad_uso';
  if (/registro\s*de\s*contribuyente|licencia\s*de\s*actividad/.test(n)) return 'registro_contribuyente';
  if (/inces/.test(n))                                               return 'inces';
  if (/impuesto|declaraci[oó]n/.test(n))                             return 'impuesto';
  return 'patente';
}

// ─── Extraer fecha del nombre del archivo ─────────────────────────────────────
// Formatos soportados en el nombre:
//   YYYY-MM-DD  →  2026-03-15
//   DD-MM-YYYY  →  15-03-2026
//   DD/MM/YYYY  →  15/03/2026
//   MM YYYY     →  03 2026  (usa último día del mes)
//   YYYY        →  2026     (31 de diciembre)
const MONTHS_ES: Record<string, string> = {
  enero: '01', febrero: '02', marzo: '03', abril: '04',
  mayo: '05', junio: '06', julio: '07', agosto: '08',
  septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
  ene: '01', feb: '02', mar: '03', abr: '04',
  may: '05', jun: '06', jul: '07', ago: '08',
  sep: '09', set: '09', oct: '10', nov: '11', dic: '12',
};

function parseDateFromFilename(filename: string): string | null {
  const name = filename.replace(/\.(pdf|jpg|jpeg|png)$/i, '');

  // YYYY-MM-DD o YYYY_MM_DD
  const iso = name.match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // DD-MM-YYYY o DD/MM/YYYY
  const dmy = name.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;

  // Nombre de mes en español + YYYY  (ej: "marzo 2026", "mar 2026")
  const monthNames = Object.keys(MONTHS_ES).join('|');
  const monthYear = name.toLowerCase().match(new RegExp(`(${monthNames})\\s+(\\d{4})`));
  if (monthYear) {
    const mo = MONTHS_ES[monthYear[1]];
    const yr = parseInt(monthYear[2]);
    const lastDay = new Date(yr, parseInt(mo), 0).getDate();
    return `${yr}-${mo}-${String(lastDay).padStart(2,'0')}`;
  }

  // MM YYYY al final (ej: "03 2026")
  const my = name.match(/(\d{1,2})\s+(\d{4})\s*$/);
  if (my) {
    const mo = parseInt(my[1]);
    const yr = parseInt(my[2]);
    if (mo >= 1 && mo <= 12) {
      const lastDay = new Date(yr, mo, 0).getDate();
      return `${yr}-${String(mo).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    }
  }

  // Solo YYYY al final (ej: "Permiso 2026") → 31 dic de ese año
  const yearOnly = name.match(/\b(202[3-9]|203\d)\b/);
  if (yearOnly) return `${yearOnly[1]}-12-31`;

  return null;
}

// ─── Función principal exportada ─────────────────────────────────────────────
export async function processCompliance(): Promise<ComplianceStore[]> {
  const listUrl = `${GAS_URL}?action=listCompliance`;
  const listRes = await fetch(listUrl, {
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  });

  if (!listRes.ok) throw new Error(`GAS status ${listRes.status}`);

  const body = await listRes.json() as unknown;
  if (!Array.isArray(body)) {
    throw new Error(`GAS no retornó array: ${JSON.stringify(body).slice(0, 200)}`);
  }

  const files = body as GasFileMeta[];
  if (files.length === 0) return [];

  const storeMap = new Map<string, ComplianceStore>();

  for (const file of files) {
    try {
      // Determinar tienda: campo storeId del GAS o extraer del nombre
      const storeId = file.storeId || parseStoreId(file.name);
      if (!storeId || !STORE_NAMES[storeId]) {
        console.warn(`Tienda no reconocida: ${file.name}`);
        continue;
      }

      // Extraer fecha SOLO del nombre del archivo — sin descargar el PDF
      const expiresAt = parseDateFromFilename(file.name) ?? '1970-01-01';
      const docName   = parseDocName(file.name);
      const docType   = detectDocType(file.name);

      if (!storeMap.has(storeId)) {
        storeMap.set(storeId, {
          id: storeId,
          name: STORE_NAMES[storeId],
          documents: [],
        });
      }

      storeMap.get(storeId)!.documents.push({
        id:         file.fileId,
        type:       docType,
        name:       docName,
        expires_at: expiresAt,
        file_url:   file.webViewLink,
      });

    } catch (err) {
      console.error(`Error procesando "${file.name}":`, err);
    }
  }

  return Array.from(storeMap.values());
}
