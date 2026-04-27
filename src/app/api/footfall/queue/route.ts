import { NextResponse } from 'next/server';

const PROXY_URL = process.env.FOOTFALL_PROXY_URL;

export async function GET() {
  if (!PROXY_URL) {
    return NextResponse.json({ error: 'FOOTFALL_PROXY_URL no configurado' }, { status: 503 });
  }
  try {
    const res = await fetch(`${PROXY_URL}/queue`, {
      signal: AbortSignal.timeout(10_000),
      next: { revalidate: 0 },
    });
    if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
