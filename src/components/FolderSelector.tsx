"use client";

const TIENDAS = ["FQ01", "FQ28", "FQ88"] as const;
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
] as const;

export type FolderSelection = {
  tienda: string;
  mes: string;
  dia: number;
  mode: 'reporte' | 'cumplimiento';
  tipoDocumento: string;
};

interface FolderSelectorProps {
  value: FolderSelection;
  onChange: (v: FolderSelection) => void;
  onConfirm: () => void;
}

function daysInMonth(mesIndex: number, year: number) {
  return new Date(year, mesIndex + 1, 0).getDate();
}

export default function FolderSelector({ value, onChange, onConfirm }: FolderSelectorProps) {
  const mesIndex = MESES.indexOf(value.mes as (typeof MESES)[number]);
  const maxDias = daysInMonth(mesIndex, new Date().getFullYear());
  const isCumplimiento = value.mode === 'cumplimiento';
  const canConfirm = isCumplimiento ? value.tipoDocumento.trim() !== "" : true;

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* Selector de modo */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo de subida</label>
        <div className="grid grid-cols-2 gap-2">
          {(["reporte", "cumplimiento"] as const).map((m) => (
            <button
              key={m}
              onClick={() => onChange({ ...value, mode: m })}
              className={`py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                value.mode === m
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-200 hover:border-blue-300"
              }`}
            >
              {m === 'reporte' ? 'Reporte diario' : 'Cumplimiento FQ'}
            </button>
          ))}
        </div>
      </div>

      {/* Tienda */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tienda</label>
        <div className="grid grid-cols-3 gap-2">
          {TIENDAS.map((t) => (
            <button
              key={t}
              onClick={() => onChange({ ...value, tienda: t })}
              className={`py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                value.tienda === t
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-200 hover:border-blue-300"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Modo reporte: mes + día */}
      {!isCumplimiento && (
        <>
          {/* Mes */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Mes</label>
            <select
              value={value.mes}
              onChange={(e) => {
                const newMesIdx = MESES.indexOf(e.target.value as (typeof MESES)[number]);
                const max = daysInMonth(newMesIdx, new Date().getFullYear());
                onChange({ ...value, mes: e.target.value, dia: Math.min(value.dia, max) });
              }}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:border-blue-400"
            >
              {MESES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Día */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Día</label>
            <div className="grid grid-cols-7 gap-1 max-h-36 overflow-y-auto">
              {Array.from({ length: maxDias }, (_, i) => i + 1).map((d) => (
                <button
                  key={d}
                  onClick={() => onChange({ ...value, dia: d })}
                  className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    value.dia === d
                      ? "bg-blue-600 text-white"
                      : "bg-gray-50 text-gray-600 hover:bg-blue-50"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Modo cumplimiento: tipo de documento */}
      {isCumplimiento && (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo de documento</label>
          <input
            type="text"
            value={value.tipoDocumento}
            onChange={(e) => onChange({ ...value, tipoDocumento: e.target.value })}
            placeholder="Ej: Permiso Sanitario"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:border-blue-400"
          />
        </div>
      )}

      {/* Ruta resultante */}
      <div className="bg-gray-50 rounded-xl px-4 py-3 text-xs text-gray-500 font-mono">
        {isCumplimiento
          ? `📁 Cumplimiento FQ / ${value.tienda}${value.tipoDocumento.trim() ? ` / ${value.tipoDocumento.trim()}` : ''}`
          : `📁 ${value.tienda} / ${value.mes} / ${String(value.dia).padStart(2, "0")}`
        }
      </div>

      <button
        onClick={onConfirm}
        disabled={!canConfirm}
        className={`w-full py-3 rounded-xl font-semibold transition-colors ${
          canConfirm
            ? "bg-blue-600 text-white hover:bg-blue-700"
            : "bg-gray-200 text-gray-400 cursor-not-allowed"
        }`}
      >
        Continuar →
      </button>
    </div>
  );
}
