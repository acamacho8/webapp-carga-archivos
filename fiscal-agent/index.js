/**
 * fiscal-agent — Agente local FQ88
 * Corre en el PC de la tienda. Exponer con cloudflared:
 *   cloudflared tunnel --url http://localhost:3500
 */
const http = require('http');
const net  = require('net');

// ─── Config ────────────────────────────────────────────────────────────────
const PORT   = parseInt(process.env.AGENT_PORT   || '3500', 10);
const SECRET = process.env.AGENT_SECRET || '';

const PRINTERS = [
  { id: 1, host: process.env.PRINTER_1_HOST || 'tfhkaprinter-11E8.local' },
  { id: 2, host: process.env.PRINTER_2_HOST || '' },
];

// ─── TCP ping ───────────────────────────────────────────────────────────────
function tcpPing(host, port, timeoutMs = 3000) {
  return new Promise(resolve => {
    if (!host) return resolve({ reachable: false, latency: null, error: 'host not configured' });
    const t0 = Date.now();
    const sock = new net.Socket();
    sock.setTimeout(timeoutMs);
    const done = (ok, err) => {
      sock.destroy();
      resolve({ reachable: ok, latency: ok ? Date.now() - t0 : null, error: err || null });
    };
    sock.on('connect', () => done(true, null));
    sock.on('timeout', () => done(false, 'timeout'));
    sock.on('error',   e  => done(false, e.message));
    sock.connect(port, host);
  });
}

// ─── Auth middleware ────────────────────────────────────────────────────────
function authorized(req) {
  if (!SECRET) return true;
  return req.headers['x-agent-secret'] === SECRET;
}

// ─── Routes ────────────────────────────────────────────────────────────────
async function handleRequest(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (!authorized(req)) {
    res.writeHead(401);
    return res.end(JSON.stringify({ error: 'unauthorized' }));
  }

  const url = new URL(req.url, `http://localhost`);

  // GET /health — canal de comunicación OK
  if (req.method === 'GET' && url.pathname === '/health') {
    const status = {
      ok: true,
      agent: 'fiscal-fq88',
      ts: new Date().toISOString(),
      printers: PRINTERS.map(p => ({
        id: p.id,
        host: p.host || null,
        configured: Boolean(p.host),
      })),
    };
    res.writeHead(200);
    return res.end(JSON.stringify(status));
  }

  // GET /ping/:printer/:port — prueba TCP a un host:puerto específico
  // Ej: /ping/1/9100
  const pingMatch = url.pathname.match(/^\/ping\/(\d+)\/(\d+)$/);
  if (req.method === 'GET' && pingMatch) {
    const printerId = parseInt(pingMatch[1], 10);
    const port      = parseInt(pingMatch[2], 10);
    const printer   = PRINTERS.find(p => p.id === printerId);
    if (!printer || !printer.host) {
      res.writeHead(404);
      return res.end(JSON.stringify({ error: `printer ${printerId} not configured` }));
    }
    const result = await tcpPing(printer.host, port);
    res.writeHead(200);
    return res.end(JSON.stringify({ printer: printerId, host: printer.host, port, ...result }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'not found' }));
}

// ─── Server ─────────────────────────────────────────────────────────────────
const server = http.createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`fiscal-agent corriendo en http://localhost:${PORT}`);
  if (!SECRET) {
    console.warn('[WARN] AGENT_SECRET no configurado — cualquiera puede llamar al agente');
  }
  PRINTERS.forEach(p => {
    if (p.host) console.log(`  Impresora ${p.id}: ${p.host}`);
    else        console.warn(`  [WARN] Impresora ${p.id}: no configurada (PRINTER_${p.id}_HOST)`);
  });
  console.log('\nPasos para exponer con Cloudflare:');
  console.log('  cloudflared tunnel --url http://localhost:' + PORT);
});
