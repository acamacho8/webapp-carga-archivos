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

  return (
    <div className="flex flex-col gap-5 w-full">
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

      {/* Ruta resultante */}
      <div className="bg-gray-50 rounded-xl px-4 py-3 text-xs text-gray-500 font-mono">
        📁 {value.tienda} / {value.mes} / {String(value.dia).padStart(2, "0")}
      </div>

      <button
        onClick={onConfirm}
        className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
      >
        Continuar →
      </button>
    </div>
  );
}
