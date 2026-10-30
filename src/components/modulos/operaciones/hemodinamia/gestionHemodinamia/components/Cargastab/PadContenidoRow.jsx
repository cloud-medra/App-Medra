import React from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { useAutocompleteReferencia } from './useAutocompleteReferencia';
import { CODIGO_SIN_OC } from './cargasHelpers';

export const crearFilaContenidoPadVacia = () => ({
  tempId: crypto.randomUUID(),
  referencia: '',
  codigo: '',
  descriptorAuto: '',
  detalle: '',
  clase: '',
  tipoVinculado: '',
  empresaVinculada: '',
  cantidad: '',
  lote: '',
  vencimiento: ''
});

export const construirItemContenidoPadDesdeFila = (fila, padPadreId, contexto) => ({
  id: crypto.randomUUID(),
  padPadreId,
  numCotizacion: contexto.numCotizacion,
  totalCotizacion: contexto.totalCotizacion,
  referencia: fila.referencia.trim(),
  cantidad: Number(fila.cantidad) || 0,
  lote: fila.lote.trim() || 'P',
  vencimiento: fila.vencimiento || '',
  empresaVinculada: fila.empresaVinculada || '',
  tipoVinculado: fila.tipoVinculado || 'P',
  detalle: fila.detalle || 'P',
  descriptorAuto: fila.descriptorAuto || 'P',
  clase: fila.clase || 'P',
  codigo: CODIGO_SIN_OC,
  precio: 0,
  sinCodigo: false,
  vecesCosto: 1,
  recargoEncontrado: true,
  venta: 0,
  totalItem: 0,
  estadoCarga: 'PAD',
  periodoAnio: contexto.periodoAnio,
  periodoMes: contexto.periodoMes
});

export const PadContenidoRow = ({ fila, onChange, onRemove, puedeEliminar }) => {
  const {
    sugerencias, buscando, mostrarSug, setMostrarSug, containerRef, skipNext
  } = useAutocompleteReferencia(fila.referencia);

  const handleReferenciaChange = (value) => {
    onChange({ ...fila, referencia: value, codigo: '', descriptorAuto: '', detalle: '', clase: '', tipoVinculado: '', empresaVinculada: '' });
  };

  const handleSeleccionar = (item) => {
    skipNext.current = true;
    onChange({
      ...fila,
      referencia: item.referencia || fila.referencia,
      codigo: item.codigo || '',
      descriptorAuto: item.descriptorAuto || '',
      detalle: item.descriptorEmpresa || item.descriptorAuto || '',
      clase: item.clase || '',
      tipoVinculado: item.tipo || '',
      empresaVinculada: item.empresa || ''
    });
    setMostrarSug(false);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 items-end bg-white dark:bg-gray-900/60 rounded border border-slate-200 dark:border-gray-700 p-2">
      <div className="flex flex-col gap-1 relative md:col-span-2" ref={containerRef}>
        <label className="text-[9px] font-bold text-slate-500 dark:text-gray-400 uppercase">Referencia contenido</label>
        <input
          type="text"
          value={fila.referencia}
          onChange={e => handleReferenciaChange(e.target.value)}
          onFocus={() => sugerencias.length > 0 && setMostrarSug(true)}
          autoComplete="off"
          className="h-9 md:h-7 px-2 text-base md:text-[10px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 outline-none focus:ring-1 focus:ring-[#2383C2]"
          placeholder="Buscar referencia..."
        />
        {mostrarSug && (
          <div className="absolute top-full left-0 mt-1 w-56 max-h-40 overflow-y-auto bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded shadow-lg z-30">
            {buscando ? (
              <div className="px-2.5 py-2 text-[10px] text-slate-400 flex items-center gap-1.5">
                <Loader2 size={11} className="animate-spin" /> Buscando...
              </div>
            ) : sugerencias.length === 0 ? (
              <div className="px-2.5 py-2 text-[10px] text-slate-400">Sin coincidencias</div>
            ) : (
              sugerencias.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSeleccionar(item)}
                  className="w-full text-left px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-gray-700/60 border-b border-slate-100 dark:border-gray-700/50 last:border-b-0"
                >
                  <div className="text-[10px] font-semibold text-slate-700 dark:text-gray-200 truncate">{item.referencia}</div>
                  <div className="text-[9px] text-slate-400 dark:text-gray-500 flex items-center gap-1.5">
                    <span className="font-num text-emerald-600 dark:text-emerald-400">{item.codigo || 'S/C'}</span>
                    <span>·</span>
                    <span className="truncate">{item.descriptorAuto || item.empresa}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[9px] font-bold text-slate-500 dark:text-gray-400 uppercase">Cant.</label>
        <input
          type="number"
          value={fila.cantidad}
          onChange={e => onChange({ ...fila, cantidad: e.target.value })}
          className="h-9 md:h-7 px-2 text-base md:text-[10px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 outline-none"
          placeholder="1"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[9px] font-bold text-slate-500 dark:text-gray-400 uppercase">Lote</label>
        <input
          type="text"
          value={fila.lote}
          onChange={e => onChange({ ...fila, lote: e.target.value })}
          className="h-9 md:h-7 px-2 text-base md:text-[10px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 outline-none"
          placeholder="Ej: L-4521"
        />
      </div>

      <div className="flex items-end gap-1.5">
        <div className="flex flex-col gap-1 flex-grow">
          <label className="text-[9px] font-bold text-slate-500 dark:text-gray-400 uppercase">Vencimiento</label>
          <input
            type="date"
            value={fila.vencimiento}
            onChange={e => onChange({ ...fila, vencimiento: e.target.value })}
            className="h-9 md:h-7 px-2 text-base md:text-[10px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 outline-none"
          />
        </div>
        {puedeEliminar && (
          <button
            type="button"
            onClick={onRemove}
            className="h-9 md:h-7 px-2 text-red-500 hover:text-red-700 rounded hover:bg-red-50 dark:hover:bg-red-950/30"
            title="Quitar esta línea"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      <div className="md:col-span-5 text-[9px] text-slate-400 dark:text-gray-500 flex items-center gap-1.5">
        <span className="truncate max-w-[220px]">
          {fila.descriptorAuto || (fila.referencia.trim() ? 'Sin descripción encontrada' : 'Descripción')}
        </span>
        <span>· Precio: $0 (forzado) · Código guardado: "{CODIGO_SIN_OC}" (forzado)</span>
      </div>
    </div>
  );
};

export default PadContenidoRow;
