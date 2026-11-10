import { useState } from 'react';
import { Undo2, X } from 'lucide-react';
import { planDevolucion, RESULTADO_DEVOLUCION, hoyChile } from '../../../../../functions/armadoKits/nucleo.mjs';
import { etiquetaModeloKit } from '../../../../../functions/armadoKits/receta.mjs';
import { mensajeError } from '../../bodega/shared/bodegaApi';
import { gestionarTransitoKit } from './kitsApi';
import { etiquetaLote } from './lineasKit';
import { CeldaVencimiento } from './comunes';

const pesos = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CL')}`;
const CAMPO = 'h-8 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 outline-none focus:border-[#2383C2]';

// Qué hará la revisión según lo que volvió (la misma regla del servidor).
const TEXTO_RESULTADO = {
  [RESULTADO_DEVOLUCION.TODO]: 'Volvió todo: equivale a Rechazar. El kit vuelve a Armado con su mismo contenido, sin mover stock.',
  [RESULTADO_DEVOLUCION.NADA]: 'No volvió nada: equivale a Recibir. El kit queda Entregado y todo cuenta como consumo del centro.',
  [RESULTADO_DEVOLUCION.PARCIAL]: 'Lo devuelto vuelve al stock disponible, al mismo lote y con el valor con que salió ("Retorno desde kits"). Lo usado queda como consumo del centro. El kit queda Entregado parcial.',
};

// Revisar devolución (Bodega > Tránsito): por cada línea del kit se indica
// cuánto volvió; lo usado es el resto. Antes de guardar muestra el resumen.
const RevisarDevolucionKitModal = ({ kit, onCerrar, onHecho }) => {
  const hoy = hoyChile();
  const [devueltos, setDevueltos] = useState(() => Object.fromEntries(kit.lineas.map((l) => [l.loteId, '0'])));
  const [observacion, setObservacion] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const pedido = kit.lineas.map((l) => ({ loteId: l.loteId, devuelto: devueltos[l.loteId] === '' ? NaN : Number(devueltos[l.loteId]) }));
  const plan = planDevolucion(kit.lineas, pedido);

  const revisar = () => {
    setError('');
    if (plan.errores.length) { setError(plan.errores.join(' ')); return; }
    setConfirmando(true);
  };
  const guardar = async () => {
    setGuardando(true);
    setError('');
    try {
      const r = await gestionarTransitoKit({ accion: 'REVISAR_DEVOLUCION', kitId: kit.id, devueltos: pedido, observacion });
      onHecho(r.resultado === RESULTADO_DEVOLUCION.PARCIAL ? `Kit ${kit.codigo}: entregado parcial (${r.usado} usado(s), ${r.devuelto} devuelto(s)).`
        : r.resultado === RESULTADO_DEVOLUCION.TODO ? `Kit ${kit.codigo}: volvió completo y quedó Armado.` : `Kit ${kit.codigo}: entregado.`);
    } catch (e) {
      setError(mensajeError(e, 'No se pudo guardar la revisión.'));
      setConfirmando(false);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="font-app text-tinta-principal fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Revisar devolución">
      <div className="w-full max-w-4xl max-h-[92vh] flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 text-secundario">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
          <div>
            <h3 className="text-subtitulo flex items-center gap-1.5"><Undo2 size={15} /> Revisar devolución · kit {kit.codigo}</h3>
            <p className="text-tinta-secundaria">{etiquetaModeloKit(kit)} · {kit.totalUnidades} unidades · {kit.despacho?.centroNombre} · salida N° {kit.despacho?.salidaNumero}</p>
          </div>
          <button type="button" onClick={onCerrar} disabled={guardando} aria-label="Cerrar" className="p-1 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"><X size={16} /></button>
        </div>
        <div className="p-4 overflow-auto flex flex-col gap-3">
          {/* Formulario en grilla (no es una tabla de datos con columnas configurables). */}
          <div className="grid grid-cols-[1fr_1fr_2fr_0.8fr_1fr_4.5rem_5rem_4.5rem] gap-x-2 gap-y-1 items-center">
            {['Componente', 'Referencia', 'Nombre', 'Lote', 'Vencimiento', 'Cantidad', 'Devuelto', 'Usado'].map((c) => <span key={c} className="text-etiqueta">{c}</span>)}
            {plan.lineas.map((l) => (
              <div key={l.loteId} className="contents">
                <span>{l.componenteNombre || '—'}</span>
                <span className="text-numero-tabla">{l.referencia || '—'}</span>
                <span className="truncate" title={l.productoNombre}>{l.productoNombre}</span>
                <span className="text-numero-tabla">{etiquetaLote(l.lote)}</span>
                <span className="text-numero-tabla"><CeldaVencimiento fecha={l.vencimiento} hoy={hoy} /></span>
                <span className="text-numero-tabla text-right">{l.cantidad}</span>
                <input aria-label={`Devuelto ${l.productoNombre} lote ${etiquetaLote(l.lote)}`} type="number" min="0" max={l.cantidad} value={devueltos[l.loteId]} disabled={confirmando}
                  onChange={(e) => setDevueltos((d) => ({ ...d, [l.loteId]: e.target.value }))} className={`${CAMPO} w-full text-right`} />
                <span className="text-numero-tabla text-right">{Number.isInteger(l.usado) && l.usado >= 0 ? l.usado : '—'}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={confirmando} onClick={() => setDevueltos(Object.fromEntries(kit.lineas.map((l) => [l.loteId, String(l.cantidad)])))} className="text-etiqueta text-[#2383C2]">Volvió todo</button>
            <button type="button" disabled={confirmando} onClick={() => setDevueltos(Object.fromEntries(kit.lineas.map((l) => [l.loteId, '0'])))} className="text-etiqueta text-[#2383C2]">No volvió nada</button>
          </div>
          <label className="flex flex-col gap-1"><span className="text-etiqueta">Observación (opcional)</span>
            <input value={observacion} maxLength={500} disabled={confirmando} onChange={(e) => setObservacion(e.target.value)} className={CAMPO} />
          </label>
          {confirmando && !plan.errores.length && (
            <div className="p-2 rounded bg-gray-50 dark:bg-gray-900 flex flex-col gap-1" aria-label="Resumen de la revisión">
              <p className="text-etiqueta">Resumen</p>
              <p>Devuelto: <strong>{plan.totales.devuelto}</strong> unidad(es) · {pesos(plan.totales.valorDevuelto)} · Usado: <strong>{plan.totales.usado}</strong> unidad(es) · {pesos(plan.totales.valorUsado)}</p>
              <p>{TEXTO_RESULTADO[plan.resultado]}</p>
            </div>
          )}
          {error && <p className="text-red-600">{error}</p>}
        </div>
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          {confirmando && <button type="button" onClick={() => setConfirmando(false)} disabled={guardando} className="h-8 px-3 rounded bg-gray-200 dark:bg-gray-700 text-etiqueta">Volver</button>}
          <button type="button" onClick={onCerrar} disabled={guardando} className="h-8 px-3 rounded bg-gray-200 dark:bg-gray-700 text-etiqueta">Cancelar</button>
          {!confirmando
            ? <button type="button" onClick={revisar} className="h-8 px-3 rounded bg-[#2383C2] text-white text-etiqueta">Revisar</button>
            : <button type="button" onClick={guardar} disabled={guardando} className="h-8 px-3 rounded bg-[#2383C2] text-white text-etiqueta disabled:opacity-50">{guardando ? 'Guardando…' : 'Confirmar'}</button>}
        </div>
      </div>
    </div>
  );
};

export default RevisarDevolucionKitModal;
