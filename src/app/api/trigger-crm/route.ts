import { NextResponse } from 'next/server';

export async function POST() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return NextResponse.json({ error: 'GITHUB_TOKEN no configurado' }, { status: 500 });

  const res = await fetch(
    'https://api.github.com/repos/acamacho8/reportes-crm-automatizado/actions/workflows/main.yml/dispatches',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  );

  if (res.status === 204) return NextResponse.json({ ok: true });
  const text = await res.text();
  return NextResponse.json({ error: text }, { status: res.status });
}
