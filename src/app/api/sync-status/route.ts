import { NextResponse } from 'next/server';

const CRM_BASE  = 'https://crm-server-main.fullqueso.com';
const CRM_KEY   = process.env.CRM_API_KEY ?? '04242246317734eqC589309E82307354';
const STORES    = ['FQ01', 'FQ28', 'FQ88'] as const;

// Row indices in the 3101-excel excelData matrix (after the 3 header rows)
// Col 1 = Tienda, Col 11 = Precio USD, Col 14 = Total BS, Col 22 = Modo Pago
// We just need the count of rows to know how many orders synced.
// The header block is always: row[0]=title, row[1]=tasa, row[2]=column-names
const HEADER_ROWS = 3;

interface Report3101 {
  success: boolean;
  excelData: unknown[][];
}

async function fetchStore(shop: string, today: string) {
  const url = `${CRM_BASE}/api/v2/report/3101-excel?date=${today}&shopCode=${shop}`;
  const res = await fetch(url, {
    headers: { 'x-api-key': CRM_KEY },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<Report3101>;
}

export async function GET() {
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

  const results = await Promise.allSettled(
    STORES.map(shop => fetchStore(shop, today))
  );

  const data = STORES.map((shop, i) => {
    const result = results[i];
    if (result.status === 'rejected') {
      return { id: shop, status: 'error', orders: 0, totalUsd: 0 };
    }

    const rows = result.value.excelData ?? [];
    // Data rows start after the 3 header rows
    const orderRows = rows.slice(HEADER_ROWS).filter(r => Array.isArray(r) && r.length > 2);
    const orderCount = orderRows.length;

    // Derive totalUsd: col 11 (index 11) has "Precio USD" like "$1.03"
    let totalUsd = 0;
    for (const row of orderRows) {
      const raw = String((row as string[])[13] ?? '').replace(/[$,]/g, '');
      const val = parseFloat(raw);
      if (!isNaN(val)) totalUsd += val;
    }

    const syncStatus =
      orderCount > 0 ? 'sincronizado' : 'sin_actividad';

    return {
      id: shop,
      status: syncStatus,
      orders: orderCount,
      totalUsd: Math.round(totalUsd * 100) / 100,
    };
  });

  return NextResponse.json({ date: today, stores: data });
}
