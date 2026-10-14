import { useState } from 'react';
import { X, PackageCheck, Undo2, StickyNote } from 'lucide-react';
import { useToast } from '../../../../../context/ToastContext';
import { ETIQUETA_ID_ENTREGA, MAX_ID_ENTREGA, MAX_NOTA, MAX_OBSERVACION, normalizarIdEntrega } from '../../../../../../functions/bodega/nucleo.mjs';
import { gestionarTransito, mensajeError } from '../bodegaApi';
import { construirAcciones } from './transitos';

const ACCIONES = {
  ENTREGAR: { titulo: 'Entregar (usado)', icono: PackageCheck, color: 'bg-emerald-600 hover:bg-emerald-700', ayuda: 'Sale definitivamente del tránsito del centro.' },
  DEVOLVER: { titulo: 'Devolver a stock (no usado)', icono: Undo2, color: 'bg-[#2383C2] hover:bg-blue-600', ayuda: 'Sale del tránsito del centro y vuelve al disponible de la Bodega General.' },
  NOTA: { titulo: 'Mantener en tránsito (nota)', icono: StickyNote, color: 'bg-amber-600 hover:bg-amber-700', ayuda: 'No mueve stock: deja una nota de seguimiento con fecha.' },
};
const INPUT = 'h-9 px-2 border border-gray-300 dark:border-gray-600 rounded text-[12px] outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:border-[#2383C2]';

// Entregar, devolver o anotar uno o varios tránsitos (cantidades parciales).
// En la entrega, el ID y la observación son comunes a todos los
// seleccionados, con opción de cambiarlos en cada línea.
//   origen: 'transito' | 'centros' (vista desde la que se actúa).
const GestionTransitoModal = ({ accion, transitos, origen, onCerrar, onHecho }) => {
  const { showToast } = useToast();
  const def = ACCIONES[accion];
  const [comun, setComun] = useState({ idEntrega: '', observacion: '', nota: '' });
  const [porLinea, setPorLinea] = useState(false);
  const [lineas, setLineas] = useState(() => transitos.map((t) => ({ transito: t, cantidad: t.pendiente, idEntrega: '', observacion: '' })));
  const [errores, setErrores] = useState([]);
  const [guardando, setGuardando] = useState(false);

  const cambiarLinea = (i, campo, valor) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));

  const validar = () => {
    const lista = [];
    if (accion === 'NOTA' && !comun.nota.trim()) lista.push('Escribe la nota.');
    lineas.forEach((l) => {
      const n = Number(l.cantidad);
      const nombre = `${l.transito.productoNombre} (${l.transito.centroNombre})`;
      if (accion !== 'NOTA' && (!Number.isInteger(n) || n <= 0 || n > l.transito.pendiente)) lista.push(`${nombre}: la cantidad debe ser entre 1 y ${l.transito.pendiente}.`);
      if (accion === 'ENTREGAR') {
        const { error } = normalizarIdEntrega(String(l.idEntrega || '').trim() || comun.idEntrega);
        if (error) lista.push(`${nombre}: ${error}`);
        if (!(String(l.observacion || '').trim() || comun.observacion.trim())) lista.push(`${nombre}: la observación es obligatoria.`);
      }
    });
    return [...new Set(lista)];
  };

  const enviar = async () => {
    const lista = validar();
    setErrores(lista);
    if (lista.length) return;
    setGuardando(true);
    try {
      await gestionarTransito({ origen, acciones: construirAcciones(accion, lineas, comun) });
      showToast(`${def.titulo}: ${lineas.length} registro(s) actualizado(s).`, 'success');
      onHecho();
    } catch (error) {
      setErrores([mensajeError(error)]);
    } finally {
      setGuardando(false);
    }
  };

  const Icono = def.icono;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label={def.titulo}>
      <div className="w-full max-w-3xl max-h-[92vh] flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 text-[12px]">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
          <div>
            <h3 className="text-[13px] font-bold text-gray-800 dark:text-gray-100 flex items-center gap-1.5"><Icono size={16} /> {def.titulo} · {lineas.length} registro(s)</h3>
            <p className="text-[11px] text-gray-500">{def.ayuda}</p>
          </div>
          <button type="button" onClick={onCerrar} disabled={guardando} aria-label="Cerrar" className="p-1 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"><X size={16} /></button>
        </div>

        <div className="p-4 overflow-auto flex flex-col gap-3">
          {accion === 'ENTREGAR' && (
            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-2">
              <label className="flex flex-col">
                <span className="text-[10px] font-bold uppercase text-gray-500">{ETIQUETA_ID_ENTREGA} * {lineas.length > 1 && '(común)'}</span>
                <input value={comun.idEntrega} onChange={(e) => setComun((c) => ({ ...c, idEntrega: e.target.value }))} maxLength={MAX_ID_ENTREGA} autoFocus className={`${INPUT} font-num uppercase`} />
              </label>
              <label className="flex flex-col">
                <span className="text-[10px] font-bold uppercase text-gray-500">Observación * {lineas.length > 1 && '(común)'}</span>
                <input value={comun.observacion} onChange={(e) => setComun((c) => ({ ...c, observacion: e.target.value }))} maxLength={MAX_OBSERVACION} className={INPUT} />
              </label>
            </div>
          )}
          {accion === 'DEVOLVER' && (
            <label className="flex flex-col">
              <span className="text-[10px] font-bold uppercase text-gray-500">Observación (opcional)</span>
              <input value={comun.observacion} onChange={(e) => setComun((c) => ({ ...c, observacion: e.target.value }))} maxLength={MAX_OBSERVACION} autoFocus className={INPUT} />
            </label>
          )}
          {accion === 'NOTA' && (
            <label className="flex flex-col">
              <span className="text-[10px] font-bold uppercase text-gray-500">Nota de seguimiento *</span>
              <textarea value={comun.nota} onChange={(e) => setComun((c) => ({ ...c, nota: e.target.value }))} maxLength={MAX_NOTA} rows={3} autoFocus className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-[12px] bg-white dark:bg-gray-900" />
            </label>
          )}
          {accion === 'ENTREGAR' && lineas.length > 1 && (
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300">
              <input type="checkbox" checked={porLinea} onChange={(e) => setPorLinea(e.target.checked)} /> Cambiar ID u observación en alguna línea
            </label>
          )}

          <ul className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded">
            {lineas.map((l, i) => (
              <li key={l.transito.id} className="px-2 py-1.5 flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[200px]">
                  <div className="font-semibold">{l.transito.productoNombre}</div>
                  <div className="text-[11px] text-gray-500 font-num">{l.transito.centroNombre} · lote {l.transito.lote || 'S/L'} · pendiente {l.transito.pendiente}</div>
                </div>
                {accion !== 'NOTA' && (
                  <label className="flex items-center gap-1 text-[11px]">Cant.
                    <input type="number" min="1" max={l.transito.pendiente} step="1" inputMode="numeric" value={l.cantidad} onChange={(e) => cambiarLinea(i, 'cantidad', e.target.value)} className={`${INPUT} w-20 font-num`} />
                  </label>
                )}
                {accion === 'ENTREGAR' && porLinea && (
                  <>
                    <input value={l.idEntrega} onChange={(e) => cambiarLinea(i, 'idEntrega', e.target.value)} maxLength={MAX_ID_ENTREGA} placeholder={comun.idEntrega || ETIQUETA_ID_ENTREGA} className={`${INPUT} w-32 font-num uppercase`} aria-label={`${ETIQUETA_ID_ENTREGA} de la línea`} />
                    <input value={l.observacion} onChange={(e) => cambiarLinea(i, 'observacion', e.target.value)} maxLength={MAX_OBSERVACION} placeholder={comun.observacion || 'Observación'} className={`${INPUT} w-48`} aria-label="Observación de la línea" />
                  </>
                )}
              </li>
            ))}
          </ul>

          {errores.length > 0 && <ul className="text-red-600 dark:text-red-400 list-disc pl-5">{errores.map((e) => <li key={e}>{e}</li>)}</ul>}
        </div>

        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} disabled={guardando} className="h-9 px-3 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold">Cancelar</button>
          <button type="button" onClick={enviar} disabled={guardando} className={`h-9 px-4 rounded text-white font-bold flex items-center gap-1.5 disabled:opacity-50 ${def.color}`}>
            <Icono size={14} /> {guardando ? 'Guardando…' : def.titulo}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GestionTransitoModal;
