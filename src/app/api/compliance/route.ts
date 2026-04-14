import { NextResponse } from 'next/server';
import { processCompliance } from '@/lib/compliance-processor';
import type { ComplianceStore } from '@/types/compliance';

export const runtime = 'nodejs';
export const maxDuration = 60; // Vercel Hobby máximo

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora
let cache: { data: ComplianceStore[]; ts: number } | null = null;
let inFlight: Promise<ComplianceStore[]> | null = null;

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
