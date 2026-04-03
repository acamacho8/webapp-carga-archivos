'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Activity, Server, LifeBuoy, RefreshCw, Trash2, FileDown, Database,
  Eye, EyeOff, Copy, CheckCircle2, Circle, AlertCircle, Wifi, WifiOff,
  Terminal as TerminalIcon, Zap, Clock, Play, XCircle, Loader2,
  ArrowUpFromLine, ShoppingCart,
} from 'lucide-react';
import { twMerge } from 'tailwind-merge';

// ─── Types ───────────────────────────────────────────────────────────────────
type Tab = 'monitor' | 'infra' | 'soporte';
type ServiceStatus = 'ok' | 'warn' | 'down';
type TicketStatus = 'Abierto' | 'En Proceso' | 'Cerrado';

interface MetricPoint { t: string; v: number }
type SyncStatus = 'sincronizado' | 'pendiente' | 'sin_actividad' | 'error';
interface StoreStaff { name: string; role: 'Gerente' | 'Subgerente'; days: number[] }
interface StoreSyncState {
  id: string; name: string; status: SyncStatus;
  lastSync: string | null; orders: number; totalUsd: number; staff: StoreStaff[];
}

// days: 0=Dom 1=Lun 2=Mar 3=Mié 4=Jue 5=Vie 6=Sáb
function onDutyToday(staff: StoreStaff[]): StoreStaff | undefined {
  const today = new Date().getDay();
  return staff.find(s => s.days.includes(today));
}
interface Service { name: string; status: ServiceStatus; latency?: number }
interface Store {
  id: string; name: string; ip: string; port: number;
  printer: string; online: boolean;
}
interface Credential { label: string; value: string }
interface App { name: string; stack: string; version: string; status: 'Activo' | 'Mantenimiento' | 'Beta' }
interface Ticket { id: number; store: string; problem: string; status: TicketStatus; date: string }

// ─── Static data ─────────────────────────────────────────────────────────────
const STORES: Store[] = [
  { id: 'FQ01', name: 'CC Sambil', ip: '192.168.1.10', port: 3001, printer: 'Bixolon SRP-350III', online: true },
  { id: 'FQ28', name: 'El Marqués', ip: '192.168.1.28', port: 3028, printer: 'Epson TM-T88VI', online: true },
  { id: 'FQ88', name: 'Sambil La Candelaria', ip: '192.168.1.88', port: 3088, printer: 'Star TSP143', online: false },
];

const CREDENTIALS: Credential[] = [
  { label: 'MongoDB URI', value: 'mongodb+srv://fq-admin:••••••@cluster0.mongodb.net/fullqueso' },
  { label: 'Firebase API Key', value: 'AIzaSyB••••••••••••••••••••••••••••••••' },
  { label: 'OP3 API Key', value: 'op3_live_sk_••••••••••••••••••••••••••••' },
  { label: 'Vercel Token', value: 'vercel_••••••••••••••••••••••••••••••••••' },
];

const APPS: App[] = [
  { name: 'fq-dashboard-web', stack: 'Next.js 16 / Recharts', version: 'v2.4.1', status: 'Activo' },
  { name: 'fullqueso-mcp', stack: 'TypeScript / MCP SDK', version: 'v1.2.0', status: 'Activo' },
  { name: 'webapp-carga-archivos', stack: 'Next.js 16 / jsPDF', version: 'v0.9.5', status: 'Activo' },
  { name: 'Bot Conciliación', stack: 'Python / Anthropic API', version: 'v0.7.2', status: 'Beta' },
  { name: 'Inventario App', stack: 'React Native / Firebase', version: 'v1.0.0', status: 'Mantenimiento' },
];

const TICKETS: Ticket[] = [
  { id: 1, store: 'FQ88', problem: 'Impresora fiscal no responde', status: 'Abierto', date: '2026-04-02' },
  { id: 2, store: 'FQ28', problem: 'Sync OP3 detenido por timeout', status: 'En Proceso', date: '2026-04-01' },
  { id: 3, store: 'FQ01', problem: 'Error 500 en cierre de caja', status: 'Cerrado', date: '2026-03-30' },
  { id: 4, store: 'FQ01', problem: 'Actualización POS pendiente', status: 'En Proceso', date: '2026-03-29' },
  { id: 5, store: 'FQ88', problem: 'No llegan pedidos Delivery', status: 'Cerrado', date: '2026-03-27' },
];

const LOG_LINES = [
  '[OP3 Sync] heartbeat OK — latency 42ms',
  '[MongoDB] replica set PRIMARY responded in 12ms',
  '[Vercel] deployment fq-dashboard-web@v2.4.1 healthy',
  '[CRM Cache] hit ratio 94.2% — 1204 entries',
  '[Firebase] listener attached to /tiendas/FQ01',
  '[OP3 Sync] ticket #88214 processed → FQ28',
  '[MongoDB] index scan: 0.8ms — productos collection',
  '[Auth] token refreshed for user admin@fullqueso.com',
  '[OP3 Sync] heartbeat OK — latency 38ms',
  '[Backup] incremental snapshot queued',
  '[Firebase] write acknowledged /pedidos/FQ01/2026-04-02',
  '[CRM Cache] evicted 18 stale entries',
  '[OP3 Sync] FQ88 connection lost — retrying in 5s',
  '[MongoDB] compaction scheduled for 02:00 UTC',
  '[Vercel] edge function cold start: 210ms',
  '[OP3 Sync] FQ88 reconnected after 6s',
  '[Backup] snapshot complete — 48MB uploaded',
];

// ─── Utils ────────────────────────────────────────────────────────────────────
function generatePoints(count = 20, min: number, max: number): MetricPoint[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    t: new Date(now - (count - 1 - i) * 2000).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    v: parseFloat((Math.random() * (max - min) + min).toFixed(1)),
  }));
}

function randomStatus(): ServiceStatus {
  const r = Math.random();
  if (r > 0.85) return 'warn';
  if (r > 0.95) return 'down';
  return 'ok';
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={twMerge('rounded-xl border border-slate-800 bg-[#0f172a] p-4', className)}>
      {children}
    </div>
  );
}

function SectionTitle({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon size={15} className="text-cyan-400" />
      <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</span>
    </div>
  );
}

function StatusDot({ status }: { status: ServiceStatus }) {
  const map: Record<ServiceStatus, string> = {
    ok: 'bg-emerald-400 shadow-emerald-400/60',
    warn: 'bg-yellow-400 shadow-yellow-400/60',
    down: 'bg-red-500 shadow-red-500/60',
  };
  return <span className={twMerge('inline-block h-2 w-2 rounded-full shadow-md', map[status])} />;
}

function TicketBadge({ status }: { status: TicketStatus }) {
  const map: Record<TicketStatus, string> = {
    Abierto: 'bg-red-900/40 text-red-400 border-red-800',
    'En Proceso': 'bg-yellow-900/40 text-yellow-400 border-yellow-800',
    Cerrado: 'bg-emerald-900/40 text-emerald-400 border-emerald-800',
  };
  return (
    <span className={twMerge('rounded-full border px-2 py-0.5 text-[10px] font-semibold', map[status])}>
      {status}
    </span>
  );
}

function AppBadge({ status }: { status: App['status'] }) {
  const map: Record<App['status'], string> = {
    Activo: 'bg-cyan-900/40 text-cyan-400 border-cyan-800',
    Beta: 'bg-purple-900/40 text-purple-400 border-purple-800',
    Mantenimiento: 'bg-slate-700/40 text-slate-400 border-slate-600',
  };
  return (
    <span className={twMerge('rounded-full border px-2 py-0.5 text-[10px] font-semibold', map[status])}>
      {status}
    </span>
  );
}

// ─── Metric Chart Card ────────────────────────────────────────────────────────
function MetricChart({
  label, unit, color, data, domain,
}: {
  label: string; unit: string; color: string; data: MetricPoint[]; domain: [number, number];
}) {
  const last = data[data.length - 1]?.v ?? 0;
  return (
    <Card>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{label}</span>
        <span className="font-mono text-lg font-bold" style={{ color }}>{last}{unit}</span>
      </div>
      <ResponsiveContainer width="100%" height={80}>
        <AreaChart data={data} margin={{ top: 2, right: 0, left: -28, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="t" hide />
          <YAxis domain={domain} tick={{ fill: '#475569', fontSize: 9 }} />
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }}
            labelStyle={{ color: '#94a3b8' }}
            itemStyle={{ color }}
            formatter={(v: unknown) => [`${v ?? 0}${unit}`, label] as [string, string]}
          />
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#grad-${label})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}

// ─── Tab: Monitor En Vivo ─────────────────────────────────────────────────────
function TabMonitor({ setRealLogs }: { setRealLogs: React.Dispatch<React.SetStateAction<string[]>> }) {
  const [cpu, setCpu] = useState<MetricPoint[]>([]);
  const [ram, setRam] = useState<MetricPoint[]>([]);
  const [disk, setDisk] = useState<MetricPoint[]>([]);
  const [services, setServices] = useState<Service[]>([
    { name: 'OP3 API', status: 'ok' },
    { name: 'MongoDB Cluster', status: 'ok' },
    { name: 'Vercel Deployment', status: 'ok' },
    { name: 'Firebase Legacy', status: 'warn' },
  ]);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // OP3 store sync monitoring — staff config (schedule never changes)
  const STAFF_CONFIG: Record<string, StoreStaff[]> = {
    FQ01: [
      { name: 'Luisa Castañeda', role: 'Gerente',    days: [0, 3, 4, 5, 6] },
      { name: 'Sofía Narváez',   role: 'Subgerente', days: [1, 2] },
    ],
    FQ28: [
      { name: 'José García',  role: 'Gerente',    days: [0, 3, 4, 5, 6] },
      { name: 'María Suárez', role: 'Subgerente', days: [1, 2] },
    ],
    FQ88: [
      { name: 'Clara Cámara',    role: 'Gerente',    days: [0, 1, 5, 6] },
      { name: 'Laury Torrealba', role: 'Subgerente', days: [3, 4] },
    ],
  };
  const STORE_NAMES: Record<string, string> = {
    FQ01: 'CC Sambil', FQ28: 'El Marqués', FQ88: 'Sambil La Candelaria',
  };

  const [syncStores, setSyncStores] = useState<StoreSyncState[]>([
    { id: 'FQ01', name: 'CC Sambil',            status: 'sin_actividad', lastSync: null, orders: 0, totalUsd: 0, staff: STAFF_CONFIG.FQ01 },
    { id: 'FQ28', name: 'El Marqués',           status: 'sin_actividad', lastSync: null, orders: 0, totalUsd: 0, staff: STAFF_CONFIG.FQ28 },
    { id: 'FQ88', name: 'Sambil La Candelaria', status: 'sin_actividad', lastSync: null, orders: 0, totalUsd: 0, staff: STAFF_CONFIG.FQ88 },
  ]);
  const [syncLoading, setSyncLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<string | null>(null);

  const fetchSyncStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/sync-status');
      if (!res.ok) return;
      const data = await res.json();
      setSyncStores(prev => prev.map(s => {
        const live = data.stores.find((d: { id: string }) => d.id === s.id);
        if (!live) return s;
        return {
          ...s,
          name: STORE_NAMES[s.id] ?? s.name,
          status: live.status as SyncStatus,
          orders: live.orders,
          totalUsd: live.totalUsd ?? 0,
          lastSync: live.status === 'sincronizado'
            ? new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true })
            : s.lastSync,
        };
      }));
      // Generate real log lines from sync data
      const newLogs: string[] = data.stores.map((d: { id: string; status: string; orders: number; totalUsd: number }) => {
        const t = new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        if (d.status === 'sincronizado') return `[${t}] [${d.id} Sync] ${d.orders} órdenes — $${d.totalUsd.toFixed(2)} USD`;
        if (d.status === 'error') return `[${t}] [${d.id} Sync] ⚠ Error al conectar con la tienda`;
        return `[${t}] [${d.id} Sync] Sin actividad registrada hoy`;
      });
      setRealLogs(prev => [...newLogs, ...prev].slice(0, 30));
      setLastFetched(new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch {
      // keep previous state on error
    } finally {
      setSyncLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchSyncStatus();
    const id = setInterval(fetchSyncStatus, 2 * 60 * 1000); // refresh every 2 min
    return () => clearInterval(id);
  }, [fetchSyncStatus]);

  const handleForceSyncStore = useCallback((id: string) => {
    setSyncingId(id);
    setTimeout(() => {
      fetchSyncStatus().then(() => setSyncingId(null));
    }, 1500);
  }, [fetchSyncStatus]);

  // CRM nightly job (scheduled 10:00 PM)
  type JobStatus = 'ejecutado' | 'fallido' | 'en_espera' | 'ejecutando';
  const [jobStatus, setJobStatus] = useState<JobStatus>('en_espera');
  const [jobLastRun, setJobLastRun] = useState<string | null>(null);

  useEffect(() => {
    const h = new Date().getHours();
    if (h >= 22) {
      setJobStatus('ejecutado');
      const d = new Date();
      d.setHours(22, 0, 3, 0);
      setJobLastRun(d.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }));
    }
  }, []);
  const [jobMsg, setJobMsg] = useState<string | null>(null);

  const handleRunJob = useCallback(() => {
    setJobStatus('ejecutando');
    setJobMsg(null);
    setTimeout(() => {
      setJobStatus('ejecutado');
      const now = new Date().toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' });
      setJobLastRun(now);
      setJobMsg('✓ CRM Automatizado ejecutado exitosamente');
      setTimeout(() => setJobMsg(null), 4000);
    }, 3500);
  }, []);

  useEffect(() => {
    // Seed initial data client-side only (avoids hydration mismatch)
    setCpu(generatePoints(20, 10, 75));
    setRam(generatePoints(20, 2, 12));
    setDisk(generatePoints(20, 0.5, 30));

    const id = setInterval(() => {
      const tick = new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setCpu(p => [...p.slice(-19), { t: tick, v: parseFloat((Math.random() * 65 + 10).toFixed(1)) }]);
      setRam(p => [...p.slice(-19), { t: tick, v: parseFloat((Math.random() * 10 + 2).toFixed(2)) }]);
      setDisk(p => [...p.slice(-19), { t: tick, v: parseFloat((Math.random() * 29 + 0.5).toFixed(1)) }]);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health-check');
      if (!res.ok) return;
      const data = await res.json();
      setServices(data.services);
    } catch {
      // keep previous state
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const id = setInterval(fetchHealth, 30_000);
    return () => clearInterval(id);
  }, [fetchHealth]);

  const handleAction = useCallback((label: string) => {
    setActionMsg(`✓ ${label} enviado`);
    setTimeout(() => setActionMsg(null), 2500);
  }, []);

  const ACTIONS = [
    { label: 'Restart Sync', Icon: RefreshCw },
    { label: 'Clear CRM Cache', Icon: Trash2 },
    { label: 'Export OP3 Report', Icon: FileDown },
    { label: 'DB Backup', Icon: Database },
  ];

  const serviceIcon = (s: ServiceStatus) =>
    s === 'ok' ? <CheckCircle2 size={14} className="text-emerald-400" /> :
    s === 'warn' ? <AlertCircle size={14} className="text-yellow-400" /> :
    <Circle size={14} className="text-red-500" />;

  return (
    <div className="space-y-5">
      {/* Metrics */}
      <div>
        <SectionTitle icon={Activity} label="Mac mini — Métricas en vivo" />
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricChart label="CPU" unit="%" color="#22D3EE" data={cpu} domain={[0, 100]} />
          <MetricChart label="RAM" unit=" GB" color="#FACC15" data={ram} domain={[0, 16]} />
          <MetricChart label="Disk I/O" unit=" MB/s" color="#a78bfa" data={disk} domain={[0, 50]} />
        </div>
      </div>

      {/* Health Check */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <SectionTitle icon={Wifi} label="Health Check" />
          <Card>
            <div className="space-y-3">
              {services.map(s => (
                <div key={s.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {serviceIcon(s.status)}
                    <span className="text-sm text-slate-300">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {s.latency != null && s.latency > 0 && (
                      <span className="font-mono text-[10px] text-slate-600">{s.latency}ms</span>
                    )}
                    <StatusDot status={s.status} />
                    <span className={twMerge(
                      'font-mono text-xs',
                      s.status === 'ok' ? 'text-emerald-400' :
                      s.status === 'warn' ? 'text-yellow-400' : 'text-red-400'
                    )}>
                      {s.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Quick Actions */}
        <div>
          <SectionTitle icon={Zap} label="Quick Actions" />
          <Card className="flex flex-col gap-2">
            {ACTIONS.map(({ label, Icon }) => (
              <button
                key={label}
                onClick={() => handleAction(label)}
                className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 font-mono text-xs text-slate-300 transition-all hover:border-cyan-500/60 hover:bg-slate-800 hover:text-cyan-400 hover:shadow-[0_0_8px_rgba(34,211,238,0.15)] active:scale-[0.98]"
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
            <AnimatePresence>
              {actionMsg && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-lg border border-emerald-700 bg-emerald-900/30 px-3 py-1.5 font-mono text-xs text-emerald-400"
                >
                  {actionMsg}
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </div>
      </div>

      {/* OP3 Sync Monitor */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowUpFromLine size={15} className="text-cyan-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">OP3 — Sincronización de Cierre de Jornada</span>
          </div>
          <div className="flex items-center gap-2">
            {syncLoading && <Loader2 size={11} className="animate-spin text-slate-500" />}
            {lastFetched && !syncLoading && (
              <span className="font-mono text-[10px] text-slate-600">Actualizado {lastFetched}</span>
            )}
            <button onClick={fetchSyncStatus} className="rounded border border-slate-700 p-1 text-slate-500 hover:text-cyan-400 transition-colors">
              <RefreshCw size={11} />
            </button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {syncStores.map(store => {
            const isSyncing = syncingId === store.id;
            const STATUS_CFG = {
              sincronizado:  { dot: 'bg-emerald-400', badge: 'border-emerald-700 bg-emerald-900/40 text-emerald-400', label: 'SINCRONIZADO'  },
              pendiente:     { dot: 'bg-yellow-400',  badge: 'border-yellow-700 bg-yellow-900/40 text-yellow-400',   label: 'PENDIENTE'     },
              sin_actividad: { dot: 'bg-slate-500',   badge: 'border-slate-600 bg-slate-800 text-slate-400',         label: 'SIN ACTIVIDAD' },
              error:         { dot: 'bg-red-500',     badge: 'border-red-700 bg-red-900/40 text-red-400',            label: 'ERROR'         },
            } as const;
            const statusCfg = STATUS_CFG[store.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.sin_actividad;

            return (
              <Card key={store.id} className="flex flex-col gap-3">
                {/* Store header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-sm font-bold text-yellow-400">{store.id}</span>
                      <span className={twMerge('h-2 w-2 rounded-full', statusCfg.dot, 'shadow-md')} />
                    </div>
                    <div className="text-xs text-slate-400">{store.name}</div>
                  </div>
                  <span className={twMerge('rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold', statusCfg.badge)}>
                    {isSyncing ? 'SINCRONIZANDO…' : statusCfg.label}
                  </span>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide">Órdenes</div>
                    <div className="font-mono text-base font-bold text-cyan-300">
                      {isSyncing ? <Loader2 size={14} className="animate-spin text-cyan-400" /> : store.orders > 0 ? store.orders : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide">Ventas</div>
                    <div className="font-mono text-sm font-bold text-green-400">
                      {store.totalUsd > 0 ? `$${store.totalUsd.toFixed(2)}` : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide">Último Sync</div>
                    <div className="font-mono text-xs text-slate-300">{store.lastSync ?? '—'}</div>
                  </div>
                </div>

                {/* Staff on duty today */}
                <div className="space-y-1.5">
                  {(() => {
                    const duty = onDutyToday(store.staff);
                    return store.staff.map(s => {
                      const isToday = duty?.name === s.name;
                      const DAY_NAMES = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
                      const schedule = s.days.map(d => DAY_NAMES[d]).join(' · ');
                      return (
                        <div key={s.name} className={twMerge(
                          'flex items-center justify-between rounded-lg border px-3 py-1.5',
                          isToday
                            ? 'border-yellow-700/60 bg-yellow-900/20'
                            : 'border-slate-800 bg-slate-900/40'
                        )}>
                          <div>
                            <div className="flex items-center gap-1.5">
                              {isToday && <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />}
                              <span className={twMerge('text-xs font-semibold', isToday ? 'text-yellow-300' : 'text-slate-300')}>
                                {s.name}
                              </span>
                            </div>
                            <div className="font-mono text-[9px] text-slate-500">{schedule}</div>
                          </div>
                          <div className="text-right">
                            <span className={twMerge(
                              'rounded border px-1.5 py-0.5 text-[9px] font-semibold',
                              s.role === 'Gerente'
                                ? 'border-cyan-800 text-cyan-500'
                                : 'border-slate-700 text-slate-500'
                            )}>
                              {s.role}
                            </span>
                            {isToday && (
                              <div className="mt-0.5 text-[9px] font-bold text-yellow-500">HOY CIERRA</div>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Force sync button — only when not yet synced */}
                {store.status !== 'sincronizado' && (
                  <button
                    onClick={() => handleForceSyncStore(store.id)}
                    disabled={isSyncing}
                    className={twMerge(
                      'flex w-full items-center justify-center gap-1.5 rounded-lg border py-1.5 font-mono text-xs font-semibold transition-all',
                      isSyncing
                        ? 'cursor-not-allowed border-slate-700 text-slate-600'
                        : 'border-cyan-700 bg-cyan-900/20 text-cyan-400 hover:bg-cyan-900/40 hover:shadow-[0_0_8px_rgba(34,211,238,0.15)]'
                    )}
                  >
                    {isSyncing
                      ? <><Loader2 size={12} className="animate-spin" />Sincronizando…</>
                      : <><ShoppingCart size={12} />Forzar Sync</>
                    }
                  </button>
                )}
                {store.status === 'sincronizado' && (
                  <div className="flex items-center justify-center gap-1 rounded-lg border border-emerald-800/40 bg-emerald-900/10 py-1.5 text-xs text-emerald-500">
                    <CheckCircle2 size={12} />Jornada cerrada
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* CRM Nightly Job */}
      <div>
        <SectionTitle icon={Clock} label="CRM Automatizado — Tarea Nocturna" />
        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Status block */}
            <div className="flex items-center gap-4">
              <div className={twMerge(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border',
                jobStatus === 'ejecutado'  && 'border-emerald-700 bg-emerald-900/30',
                jobStatus === 'fallido'    && 'border-red-700 bg-red-900/30',
                jobStatus === 'en_espera' && 'border-slate-700 bg-slate-800/50',
                jobStatus === 'ejecutando' && 'border-cyan-700 bg-cyan-900/20',
              )}>
                {jobStatus === 'ejecutado'  && <CheckCircle2 size={22} className="text-emerald-400" />}
                {jobStatus === 'fallido'    && <XCircle size={22} className="text-red-400" />}
                {jobStatus === 'en_espera' && <Clock size={22} className="text-slate-400" />}
                {jobStatus === 'ejecutando' && <Loader2 size={22} className="animate-spin text-cyan-400" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-200">Repositorio CRM</span>
                  <span className={twMerge(
                    'rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold',
                    jobStatus === 'ejecutado'  && 'border-emerald-700 bg-emerald-900/40 text-emerald-400',
                    jobStatus === 'fallido'    && 'border-red-700 bg-red-900/40 text-red-400',
                    jobStatus === 'en_espera' && 'border-slate-600 bg-slate-800 text-slate-400',
                    jobStatus === 'ejecutando' && 'border-cyan-700 bg-cyan-900/40 text-cyan-400',
                  )}>
                    {jobStatus === 'ejecutado'  && 'EJECUTADO'}
                    {jobStatus === 'fallido'    && 'FALLIDO'}
                    {jobStatus === 'en_espera' && 'EN ESPERA'}
                    {jobStatus === 'ejecutando' && 'EJECUTANDO…'}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-3 font-mono text-xs text-slate-500">
                  <span><Clock size={10} className="mr-1 inline" />Programado: 10:00 PM diario</span>
                  {jobLastRun && <span>Último: {jobLastRun}</span>}
                </div>
              </div>
            </div>

            {/* Manual trigger */}
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <button
                onClick={handleRunJob}
                disabled={jobStatus === 'ejecutando'}
                className={twMerge(
                  'flex items-center gap-2 rounded-lg border px-4 py-2 font-mono text-xs font-semibold transition-all active:scale-[0.97]',
                  jobStatus === 'ejecutando'
                    ? 'cursor-not-allowed border-slate-700 text-slate-600'
                    : 'border-yellow-600 bg-yellow-400/10 text-yellow-400 hover:bg-yellow-400/20 hover:shadow-[0_0_12px_rgba(250,204,21,0.2)]'
                )}
              >
                {jobStatus === 'ejecutando'
                  ? <><Loader2 size={13} className="animate-spin" /> Ejecutando…</>
                  : <><Play size={13} /> Ejecutar Ahora</>
                }
              </button>
              <AnimatePresence>
                {jobMsg && (
                  <motion.span
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="font-mono text-[10px] text-emerald-400"
                  >
                    {jobMsg}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Tab: Infraestructura y Tiendas ──────────────────────────────────────────
function TabInfra() {
  const [copiedIp, setCopiedIp] = useState<string | null>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>({});

  const handleCopy = useCallback((ip: string) => {
    navigator.clipboard.writeText(ip).catch(() => {});
    setCopiedIp(ip);
    setTimeout(() => setCopiedIp(null), 2000);
  }, []);

  const toggleVisible = useCallback((label: string) => {
    setVisible(prev => ({ ...prev, [label]: !prev[label] }));
  }, []);

  return (
    <div className="space-y-5">
      {/* Store directory */}
      <div>
        <SectionTitle icon={Server} label="Directorio de Tiendas" />
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wide">
                {['Tienda', 'IP Estática', 'Puerto OP3', 'Impresora Fiscal', 'Estado', 'Acciones'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STORES.map((store, i) => (
                <tr key={store.id} className={twMerge('border-b border-slate-800/60 transition-colors hover:bg-slate-800/40', i === STORES.length - 1 && 'border-0')}>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-bold text-yellow-400">{store.id}</span>
                    <span className="ml-2 text-slate-400">{store.name}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-cyan-300">{store.ip}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-300">{store.port}</td>
                  <td className="px-4 py-3 text-xs text-slate-300">{store.printer}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {store.online
                        ? <><Wifi size={12} className="text-emerald-400" /><span className="text-xs text-emerald-400">Online</span></>
                        : <><WifiOff size={12} className="text-red-400" /><span className="text-xs text-red-400">Offline</span></>
                      }
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleCopy(store.ip)}
                      className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 font-mono text-[10px] text-slate-400 transition-all hover:border-cyan-600 hover:text-cyan-400"
                    >
                      {copiedIp === store.ip ? <CheckCircle2 size={11} className="text-emerald-400" /> : <Copy size={11} />}
                      {copiedIp === store.ip ? 'Copiado' : 'Copy IP'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Credentials Vault */}
      <div>
        <SectionTitle icon={Database} label="Vault de Credenciales" />
        <Card className="space-y-3">
          {CREDENTIALS.map(cred => (
            <div key={cred.label} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-2.5">
              <span className="w-36 shrink-0 text-xs font-semibold text-slate-400">{cred.label}</span>
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-cyan-300">
                {visible[cred.label] ? cred.value : '••••••••••••••••••••••••••••••••••••••'}
              </span>
              <button
                onClick={() => toggleVisible(cred.label)}
                className="shrink-0 rounded p-1 text-slate-500 transition-colors hover:text-yellow-400"
              >
                {visible[cred.label] ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          ))}
        </Card>
      </div>

      {/* Apps Index */}
      <div>
        <SectionTitle icon={Zap} label="Apps Index" />
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wide">
                {['App', 'Stack', 'Versión', 'Estado'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {APPS.map((app, i) => (
                <tr key={app.name} className={twMerge('border-b border-slate-800/60 transition-colors hover:bg-slate-800/40', i === APPS.length - 1 && 'border-0')}>
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-cyan-300">{app.name}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{app.stack}</td>
                  <td className="px-4 py-3">
                    <span className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-yellow-400">
                      {app.version}
                    </span>
                  </td>
                  <td className="px-4 py-3"><AppBadge status={app.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

// ─── Tab: Centro de Soporte ───────────────────────────────────────────────────
function TabSoporte({ realLogs }: { realLogs: string[] }) {
  const terminalRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-5">
      {/* Incident log */}
      <div>
        <SectionTitle icon={LifeBuoy} label="Log de Incidencias" />
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wide">
                {['#', 'Tienda', 'Problema', 'Estado', 'Fecha'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TICKETS.map((t, i) => (
                <tr key={t.id} className={twMerge('border-b border-slate-800/60 transition-colors hover:bg-slate-800/40', i === TICKETS.length - 1 && 'border-0')}>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">#{t.id}</td>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-yellow-400">{t.store}</td>
                  <td className="px-4 py-3 text-xs text-slate-300">{t.problem}</td>
                  <td className="px-4 py-3"><TicketBadge status={t.status} /></td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{t.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Terminal Console */}
      <div>
        <SectionTitle icon={TerminalIcon} label="Terminal Console" />
        <Card className="p-0">
          <div className="flex items-center gap-1.5 border-b border-slate-800 px-4 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
            <span className="ml-2 font-mono text-[10px] text-slate-600">fq-system@mac-mini ~ bash</span>
          </div>
          <div
            ref={terminalRef}
            className="h-52 overflow-y-auto bg-black/60 px-4 py-3 font-mono text-xs leading-relaxed text-green-400 scrollbar-thin"
          >
            {realLogs.length === 0
              ? <span className="text-slate-600">Esperando datos del CRM…</span>
              : realLogs.map((line, i) => (
                  <div key={i} className="font-mono text-xs text-emerald-400 leading-5">{line}</div>
                ))
            }
            <div className="mt-1 flex items-center gap-1">
              <span className="text-yellow-400">$</span>
              <span className="animate-pulse text-slate-500">▋</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
  { id: 'monitor', label: 'Monitor En Vivo', Icon: Activity },
  { id: 'infra', label: 'Infraestructura', Icon: Server },
  { id: 'soporte', label: 'Centro de Soporte', Icon: LifeBuoy },
];

export default function TechCenter() {
  const [activeTab, setActiveTab] = useState<Tab>('monitor');
  const [realLogs, setRealLogs] = useState<string[]>([]);

  return (
    <div className="min-h-screen bg-[#020617] px-4 py-6 text-slate-100 sm:px-8 lg:px-12" suppressHydrationWarning>
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.35)]">
            <span className="text-lg font-black text-[#020617]">FQ</span>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              Tech Command Center
              <span className="ml-2 font-mono text-xs font-normal text-cyan-400">v3.0</span>
            </h1>
            <p className="text-xs text-slate-500">Full Queso — Plataforma de Soporte Técnico</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="mt-6 flex gap-1 rounded-xl border border-slate-800 bg-[#0f172a] p-1">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={twMerge(
                'relative flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200',
                activeTab === id
                  ? 'text-slate-900 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              {activeTab === id && (
                <motion.div
                  layoutId="tab-bg"
                  className="absolute inset-0 rounded-lg bg-yellow-400"
                  style={{ boxShadow: '0 0 16px rgba(250,204,21,0.3)' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <Icon size={15} className="relative z-10" />
              <span className="relative z-10 hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {activeTab === 'monitor' && <TabMonitor setRealLogs={setRealLogs} />}
          {activeTab === 'infra' && <TabInfra />}
          {activeTab === 'soporte' && <TabSoporte realLogs={realLogs} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
