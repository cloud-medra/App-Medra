import { useMemo, useRef, useState } from 'react';
import { Plus, Trash2, X, PackagePlus } from 'lucide-react';
import { useToast } from '../../../../context/ToastContext';
import { pendientePorComponente, planReposicion } from '../../../../../functions/armadoKits/nucleo.mjs';
import { buscarModelo, recetaDelModelo } from '../../../../../functions/armadoKits/receta.mjs';
import { detalleError, mensajeError } from '../../bodega/shared/bodegaApi';
import { reponerKit } from './kitsApi';
import { useConfiguracionKits } from './useConfiguracionKits';

const pesos = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CL')}`;
const CAMPO = 'h-8 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 outline-none focus:border-[#2383C2]';

// Registrar reposición: el centro repone, con stock suyo y otro lote, lo que
// usó de un kit cerrado. Por fila: componente, referencia permitida (receta
// vigente del modelo), lote, vencimiento y cantidad; no más de lo pendiente.
// Antes de guardar muestra un resumen (planReposicion, la misma regla del
// servidor) con el valor con que entrará: el de salida de lo usado.
const ReposicionKitModal = ({ familia, kit, onCerrar, onHecho }) => {
  const { showToast } = useToast();
  const { config, cargando } = useConfiguracionKits(familia);
  const modelo = config ? buscarModelo(config, kit.genero, kit.vaina) : null;
  const receta = useMemo(() => (modelo ? recetaDelModelo(config, modelo) : []), [config, modelo]);
  const pendientes = useMemo(() => pendientePorComponente(kit.lineas).filter((c) => c.pendiente > 0), [kit]);
  // Clave estable de cada fila: las iniciales, por componente; las agregadas, con un contador.
  const contador = useRef(0);
  const filaNueva = (componenteId, clave) => {
    const refs = receta.find((c) => c.id === componenteId)?.referencias || [];
    return { clave, componenteId, productoId: refs.length === 1 ? refs[0].productoId : '', lote: '', vencimiento: '', cantidad: '' };
  };
  const [filas, setFilas] = useState(null);
  const lista = filas || (receta.length ? pendientes.map((c) => filaNueva(c.componenteId, `inicial-${c.componenteId}`)) : []);
  const agregarFila = () => { contador.current += 1; setFilas([...lista, filaNueva(pendientes[0]?.componenteId || '', `nueva-${contador.current}`)]); };
  const [observacion, setObservacion] = useState('');
  const [resumen, setResumen] = useState(null);
  const [fechaDistinta, setFechaDistinta] = useState(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cambiar = (clave, campo, valor) => setFilas(lista.map((f) => (f.clave !== clave ? f : {
    ...f, [campo]: valor, ...(campo === 'componenteId' ? { productoId: (receta.find((c) => c.id === valor)?.referencias || []).length === 1 ? receta.find((c) => c.id === valor).referencias[0].productoId : '' } : {}),
  })));
  const items = lista.map(({ componenteId, productoId, lote, vencimiento, cantidad }) => ({ componenteId, productoId, lote, vencimiento, cantidad: Number(cantidad) }));

  const revisar = () => {
    setError('');
    const plan = planReposicion(kit.lineas, items, receta);
    if (plan.errores.length) { setError(plan.errores.join(' ')); return; }
    setResumen(plan.items);
  };
  const guardar = async (confirmarFechaDistinta = false) => {
    setGuardando(true);
    setError('');
    try {
      const r = await reponerKit({ familia, kitId: kit.id, items, observacion, confirmarFechaDistinta });
      showToast(`Reposición ${r.numero} del kit ${r.codigo}: ${r.repuesto} unidad(es). ${r.pendiente ? `Quedan ${r.pendiente} por reponer.` : 'Lo usado quedó repuesto completo.'}`, 'success');
      onHecho();
    } catch (e) {
      if (detalleError(e)?.motivo === 'fecha-distinta') setFechaDistinta(e.message);
      else setError(mensajeError(e, 'No se pudo registrar la reposición.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="font-app text-tinta-principal fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Registrar reposición">
      <div className="w-full max-w-3xl max-h-[92vh] flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 text-secundario">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
          <div>
            <h3 className="text-subtitulo flex items-center gap-1.5"><PackagePlus size={15} /> Registrar reposición · kit {kit.codigo}</h3>
            <p className="text-tinta-secundaria">{kit.despacho?.centroNombre || 'Centro'} repone, con stock suyo, lo que usó del kit. Entra a Bodega como stock nuevo, al valor con que salió lo usado.</p>
          </div>
          <button type="button" onClick={onCerrar} disabled={guardando} aria-label="Cerrar" className="p-1 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"><X size={16} /></button>
        </div>
        <div className="p-4 overflow-auto flex flex-col gap-3">
          <p className="flex flex-wrap gap-2">
            {pendientePorComponente(kit.lineas).filter((c) => c.usado > 0).map((c) => (
              <span key={c.componenteId} className="px-1.5 rounded bg-gray-100 dark:bg-gray-700">{c.componenteNombre}: usado {c.usado} · repuesto {c.repuesto} · <strong>pendiente {c.pendiente}</strong></span>
            ))}
          </p>
          {cargando && <p className="text-tinta-atenuada">Cargando configuración…</p>}
          {!cargando && !modelo && <p className="text-red-600">El modelo {kit.referencia} ya no está en la configuración: no se puede validar la reposición.</p>}
          {!resumen && modelo && (
            <>
              {/* Formulario en grilla (no es una tabla de datos con columnas configurables). */}
              <div className="grid grid-cols-[1.2fr_1.6fr_1fr_1fr_5rem_2rem] gap-1 items-center">
                <span className="text-etiqueta">Componente</span><span className="text-etiqueta">Referencia</span><span className="text-etiqueta">Lote</span><span className="text-etiqueta">Vencimiento</span><span className="text-etiqueta">Cantidad</span><span />
                  {lista.map((f) => (
                    <div key={f.clave} className="contents">
                      <div><select aria-label="Componente" value={f.componenteId} onChange={(e) => cambiar(f.clave, 'componenteId', e.target.value)} className={`${CAMPO} w-full`}>
                        {pendientes.map((c) => <option key={c.componenteId} value={c.componenteId}>{c.componenteNombre}</option>)}
                      </select></div>
                      <div><select aria-label="Referencia" value={f.productoId} onChange={(e) => cambiar(f.clave, 'productoId', e.target.value)} className={`${CAMPO} w-full`}>
                        <option value="">Elegir…</option>
                        {(receta.find((c) => c.id === f.componenteId)?.referencias || []).map((r) => <option key={r.productoId} value={r.productoId}>{r.referencia} {r.nombre}</option>)}
                      </select></div>
                      <div><input aria-label="Lote" value={f.lote} onChange={(e) => cambiar(f.clave, 'lote', e.target.value)} className={`${CAMPO} w-full`} /></div>
                      <div><input aria-label="Vencimiento" type="date" value={f.vencimiento} onChange={(e) => cambiar(f.clave, 'vencimiento', e.target.value)} className={`${CAMPO} w-full`} /></div>
                      <div><input aria-label="Cantidad" type="number" min="1" value={f.cantidad} onChange={(e) => cambiar(f.clave, 'cantidad', e.target.value)} className={`${CAMPO} w-full text-right`} /></div>
                      <div className="text-center">{lista.length > 1 && <button type="button" onClick={() => setFilas(lista.filter((x) => x.clave !== f.clave))} aria-label="Quitar fila" className="text-red-600"><Trash2 size={13} /></button>}</div>
                    </div>
                  ))}
              </div>
              <button type="button" onClick={agregarFila}className="self-start text-etiqueta text-[#2383C2] flex items-center gap-1"><Plus size={12} /> Agregar fila</button>
              <label className="flex flex-col gap-1"><span className="text-etiqueta">Observación (opcional)</span>
                <input value={observacion} maxLength={500} onChange={(e) => setObservacion(e.target.value)} className={CAMPO} />
              </label>
            </>
          )}
          {resumen && (
            <div className="flex flex-col gap-1.5" aria-label="Resumen de la reposición">
              <p className="text-etiqueta">Resumen: entrará a Bodega</p>
              <ul className="list-disc pl-5">
                {resumen.map((i, n) => <li key={n}>{i.componenteNombre}: {i.cantidad} × {i.referencia} lote {i.lote}, vence {i.vencimiento} · {pesos(i.valor)}</li>)}
              </ul>
              <p>Total: {resumen.reduce((s, i) => s + i.cantidad, 0)} unidad(es) · {pesos(resumen.reduce((s, i) => s + i.valor, 0))} (línea "Reposición desde centros").</p>
              {fechaDistinta && <p className="p-2 rounded bg-amber-50 dark:bg-amber-950/30">{fechaDistinta}</p>}
            </div>
          )}
          {error && <p className="text-red-600">{error}</p>}
        </div>
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          {resumen && <button type="button" onClick={() => { setResumen(null); setFechaDistinta(null); }} disabled={guardando} className="h-8 px-3 rounded bg-gray-200 dark:bg-gray-700 text-etiqueta">Volver</button>}
          <button type="button" onClick={onCerrar} disabled={guardando} className="h-8 px-3 rounded bg-gray-200 dark:bg-gray-700 text-etiqueta">Cancelar</button>
          {!resumen
            ? <button type="button" onClick={revisar} disabled={!modelo || !lista.length} className="h-8 px-3 rounded bg-[#2383C2] text-white text-etiqueta disabled:opacity-50">Revisar</button>
            : <button type="button" onClick={() => guardar(Boolean(fechaDistinta))} disabled={guardando} className="h-8 px-3 rounded bg-[#2383C2] text-white text-etiqueta disabled:opacity-50">{guardando ? 'Guardando…' : fechaDistinta ? 'Confirmar fecha y guardar' : 'Confirmar reposición'}</button>}
        </div>
      </div>
    </div>
  );
};

export default ReposicionKitModal;
