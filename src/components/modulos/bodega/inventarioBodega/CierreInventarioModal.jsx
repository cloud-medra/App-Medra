import { useMemo, useState } from 'react';
import { X, Lock } from 'lucide-react';
import { resumenInventario, NO_CONTADOS, MAX_OBSERVACION } from '../../../../../functions/bodega/nucleo.mjs';
import { cerrarInventario, mensajeError } from '../shared/bodegaApi';
import { formatoCantidad } from '../shared/catalogosBodega';
import { formatoPesos } from './formato';

const Fila = ({ etiqueta, valor, clase = '' }) => (
  <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700"><span>{etiqueta}</span><span className={`font-num font-bold ${clase}`}>{valor}</span></div>
);

// Resumen y confirmación del cierre con ajuste: líneas, sobrantes,
// faltantes y valor (si hay precio), criterio para los no contados y
// motivo obligatorio. Al confirmar se generan los ajustes y el inventario
// queda cerrado y no editable.
const CierreInventarioModal = ({ inventario, lineas, onCerrar, onHecho }) => {
  const [noContados, setNoContados] = useState('IGNORAR');
  const [motivo, setMotivo] = useState('');
  const [confirmo, setConfirmo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const r = useMemo(() => resumenInventario(lineas, noContados), [lineas, noContados]);

  const cerrar = async () => {
    if (!motivo.trim()) { setError('El motivo del ajuste es obligatorio.'); return; }
    setGuardando(true);
    setError('');
    try {
      const res = await cerrarInventario({ id: inventario.id, motivo, noContados });
      onHecho(res);
    } catch (e) {
      setError(`${mensajeError(e)} Si el cierre se cortó a mitad, vuelve a abrir el inventario y usa "Reanudar cierre": no se duplican ajustes.`);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Cerrar inventario">
      <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 text-[12px]">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
          <h3 className="text-[13px] font-bold flex items-center gap-1.5"><Lock size={15} /> Cerrar inventario con ajuste · {inventario.nombre}</h3>
          <button type="button" onClick={onCerrar} disabled={guardando} aria-label="Cerrar" className="p-1 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"><X size={16} /></button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <label className="flex flex-col">
            <span className="text-[10px] font-bold uppercase text-gray-500">Líneas no contadas ({r.noContadas})</span>
            <select value={noContados} onChange={(e) => setNoContados(e.target.value)} disabled={guardando} className="h-9 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900">
              {Object.entries(NO_CONTADOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <div>
            <Fila etiqueta="Líneas" valor={`${r.lineas} (${r.contadas} contadas, ${r.agregadas} agregadas)`} />
            <Fila etiqueta={`Sobrantes · ${r.sobrantes} línea(s)`} valor={`+${formatoCantidad(r.unidadesSobrantes)} u.${r.conPrecio ? ` · ${formatoPesos(r.valorSobrante)}` : ''}`} clase="text-emerald-600" />
            <Fila etiqueta={`Faltantes · ${r.faltantes} línea(s)`} valor={`−${formatoCantidad(r.unidadesFaltantes)} u.${r.conPrecio ? ` · ${formatoPesos(r.valorFaltante)}` : ''}`} clase="text-red-600" />
            {r.conPrecio && <Fila etiqueta="Diferencia neta (valor)" valor={formatoPesos(r.valorSobrante - r.valorFaltante)} />}
            {!r.conPrecio && <p className="text-[11px] text-gray-500 mt-1">Sin valor: ningún producto tiene precio (se toma del maestro clínico vinculado).</p>}
          </div>
          <label className="flex flex-col">
            <span className="text-[10px] font-bold uppercase text-gray-500">Motivo del ajuste *</span>
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={MAX_OBSERVACION} rows={2} disabled={guardando} className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900" />
          </label>
          <label className="flex items-start gap-1.5 text-[12px]">
            <input type="checkbox" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} disabled={guardando} className="mt-0.5" />
            Entiendo que se generarán {r.sobrantes + r.faltantes} ajuste(s) de stock y que el inventario quedará cerrado y no editable.
          </label>
          {error && <p className="text-red-600">{error}</p>}
        </div>
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} disabled={guardando} className="h-9 px-3 rounded bg-gray-200 dark:bg-gray-700 font-semibold">Cancelar</button>
          <button type="button" onClick={cerrar} disabled={guardando || !confirmo || !motivo.trim()} className="h-9 px-4 rounded bg-red-600 hover:bg-red-700 text-white font-bold disabled:opacity-50">{guardando ? 'Cerrando…' : 'Cerrar y ajustar'}</button>
        </div>
      </div>
    </div>
  );
};

export default CierreInventarioModal;
