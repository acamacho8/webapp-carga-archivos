import { NextResponse } from 'next/server';
import { processCompliance } from '@/lib/compliance-processor';
import type { AlertStatus } from '@/types/compliance';

export const runtime = 'nodejs';
export const maxDuration = 60; // Vercel Hobby máximo

function getAlertStatus(expiresAt: string): AlertStatus {
  const [y, m, d] = expiresAt.split('-').map(Number);
  const expiry = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.floor((expiry.getTime() - today.getTime()) / 86_400_000);
  if (days < 0)   return 'expired';
  if (days <= 15) return 'critical';
  if (days <= 30) return 'warning';
  return 'ok';
}

export async function GET(req: Request) {
  // Vercel inyecta: Authorization: Bearer <CRON_SECRET>
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runAt = new Date().toISOString();

  const stores = await processCompliance();

  const counts: Record<AlertStatus, number> = { expired: 0, critical: 0, warning: 0, ok: 0 };
  const flagged: string[] = [];

  for (const store of stores) {
    for (const doc of store.documents) {
      const status = getAlertStatus(doc.expires_at);
      counts[status]++;
      if (status !== 'ok') {
        const days = Math.floor(
          (new Date(doc.expires_at).getTime() - Date.now()) / 86_400_000
        );
        const label = days < 0
          ? `VENCIDO hace ${Math.abs(days)}d`
          : `vence en ${days}d`;
        flagged.push(`[${store.name}] ${doc.name} — ${label} (${doc.expires_at})`);
      }
    }
  }

  const summary = {
    runAt,
    totalDocuments: stores.reduce((n, s) => n + s.documents.length, 0),
    counts,
    flagged,
  };

  console.log('[CRON compliance-review]', JSON.stringify(summary, null, 2));

  return NextResponse.json({ ok: true, summary });
}
