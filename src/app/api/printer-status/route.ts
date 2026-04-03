import { NextResponse } from 'next/server';
import net from 'net';

export const runtime = 'nodejs';

const PRINTERS = [
  { id: 'FQ01', printer: 'Bixolon SRP-350III', ip: '192.168.1.10', port: 3001 },
  { id: 'FQ28', printer: 'Epson TM-T88VI',     ip: '192.168.1.28', port: 3028 },
  { id: 'FQ88', printer: 'Star TSP143',         ip: '192.168.1.88', port: 3088 },
] as const;

function checkTcp(
  ip: string,
  port: number,
  timeoutMs = 3_000
): Promise<{ online: boolean; latency: number }> {
  return new Promise(resolve => {
    const start = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    const done = (online: boolean) => {
      socket.destroy();
      resolve({ online, latency: Date.now() - start });
    };

    socket.on('connect', () => done(true));
    socket.on('timeout', () => done(false));
    socket.on('error',   () => done(false));
    socket.connect(port, ip);
  });
}

export async function GET() {
  const results = await Promise.all(
    PRINTERS.map(async p => {
      const { online, latency } = await checkTcp(p.ip, p.port);
      return { id: p.id, printer: p.printer, ip: p.ip, port: p.port, online, latency };
    })
  );

  return NextResponse.json({ printers: results, ts: new Date().toISOString() });
}
