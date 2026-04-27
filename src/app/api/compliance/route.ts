import { NextResponse } from 'next/server';
import type { ComplianceStore, DocumentType } from '@/types/compliance';

export const maxDuration = 60;

const GAS_URL = process.env.COMPLIANCE_GAS_URL!;

// Shape guardada en PropertiesService de GAS por el job en background
interface CachedDoc {
  fileId: string;
  storeId: string;
  storeName: string;
  docType: string;
  docName: string;
  expiresAt: string;
  fileUrl: string;
  folder?: string; // nombre de la sub-carpeta de Drive (vacío = raíz de tienda)
}

// ─── Caché en memoria (L1) — válida dentro de una instancia ───
const MEM_TTL_MS = 5 * 60 * 1000; // 5 minutos
let memCache: { data: ComplianceStore[]; ts: number } | null = null;
let inFlight: Promise<ComplianceStore[]> | null = null;

async function fetchFromGasCache(): Promise<ComplianceStore[]> {
  const cacheRes = await fetch(`${GAS_URL}?action=getCache`, {
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });

  if (!cacheRes.ok) throw new Error(`GAS cache error: ${cacheRes.status}`);

  const body = await cacheRes.json();
  if (!Array.isArray(body)) {
    throw new Error(`GAS devolvió formato inesperado: ${JSON.stringify(body).slice(0, 200)}`);
  }

  const cachedDocs = body as CachedDoc[];
  const storeMap = new Map<string, ComplianceStore>();

  for (const doc of cachedDocs) {
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
      folder: doc.folder ?? '',
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
    inFlight = fetchFromGasCache()
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
