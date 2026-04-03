import { NextResponse } from 'next/server';

const CRM_BASE = 'https://crm-server-main.fullqueso.com';
const CRM_KEY  = process.env.CRM_API_KEY ?? '04242246317734eqC589309E82307354';

type ServiceStatus = 'ok' | 'warn' | 'down';

async function ping(
  name: string,
  url: string,
  headers: Record<string, string> = {}
): Promise<{ name: string; status: ServiceStatus; latency: number }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 6_000);
    const res = await fetch(url, {
      headers,
      signal: controller.signal,
      next: { revalidate: 0 },
    });
    clearTimeout(tid);
    const ms = Date.now() - start;
    const ok = res.ok || res.status < 500;
    return { name, status: !ok ? 'down' : ms > 3_000 ? 'warn' : 'ok', latency: ms };
  } catch {
    return { name, status: 'down', latency: Date.now() - start };
  }
}

export async function GET() {
  const today = new Date().toLocaleDateString('en-CA');

  const [crm, vercel, firebase] = await Promise.all([
    ping('OP3 API', `${CRM_BASE}/api/v2/report/3101-excel?date=${today}&shopCode=FQ01`, { 'x-api-key': CRM_KEY }),
    ping('Vercel Deployment', 'https://webapp-carga-archivos.vercel.app/'),
    ping('Firebase Legacy', 'https://firestore.googleapis.com/'),
  ]);

  // MongoDB: inferred from CRM health (same backend)
  const mongo: { name: string; status: ServiceStatus; latency: number } = {
    name: 'MongoDB Cluster',
    status: crm.status,
    latency: 0,
  };

  return NextResponse.json({
    services: [crm, mongo, vercel, firebase],
    ts: new Date().toISOString(),
  });
}
