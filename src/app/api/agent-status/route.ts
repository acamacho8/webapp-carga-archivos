import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const agentUrl    = process.env.FISCAL_AGENT_FQ88_URL   || '';
  const agentSecret = process.env.FISCAL_AGENT_SECRET     || '';

  if (!agentUrl) {
    return NextResponse.json({
      configured: false,
      online: false,
      error: 'FISCAL_AGENT_FQ88_URL no configurada',
    });
  }

  try {
    const res = await fetch(`${agentUrl}/health`, {
      headers: { 'X-Agent-Secret': agentSecret },
      signal: AbortSignal.timeout(5_000),
      cache: 'no-store',
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    return NextResponse.json({ configured: true, online: true, ...data });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'error desconocido';
    return NextResponse.json({ configured: true, online: false, error: message });
  }
}
