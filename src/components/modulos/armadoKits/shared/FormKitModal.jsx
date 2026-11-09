import { useEffect, useMemo, useState } from 'react';
import { Layers, Plus, Trash2, X } from 'lucide-react';
import { useToast } from '../../../../context/ToastContext';
import { useModal } from '../../../../context/ModalContext';
import { FAMILIAS_KIT, hoyChile, referenciaDe } from '../../../../../functions/armadoKits/nucleo.mjs';
import { detalleError, leerLotesDeProducto, mensajeError } from '../../bodega/shared/bodegaApi';
import BuscadorProducto from '../../bodega/shared/BuscadorProducto';
import { TablaBodega, FilaBodega, FilaAnchoCompleto } from '../../bodega/shared/TablaBodega';
import { TD_BODEGA as TD, useAnchosTablaBodega } from '../../bodega/shared/anchosTablaBodega';
import { guardarKit } from './kitsApi';
import { agregarPartes, etiquetaLote, lineasParaGuardar, lotesVisibles, marcarConfirmados, propuestaAgregar, quitarLineaKit, textoParte } from './lineasKit';
import { CeldaVencimiento, Insignia } from './comunes';

const COLUMNAS_LOTES = [
  { key: 'elegir', label: '', ancho: 34, min: 34 },
  { key: 'lote', label: 'Lote', ancho: 170, min: 70 },
  { key: 'vencimiento', label: 'Vencimiento', ancho: 170, min: 90 },
  { key: 'disponible', label: 'Disponible', alinear: 'text-right', ancho: 90, min: 60 },
  { key: 'sugerido', label: '', ancho: 90, min: 60 },
];
const COLUMNAS_LINEAS = [
  { key: 'referencia', label: 'Referencia', ancho: 110, min: 60 },
  { key: 'nombre', label: 'Nombre', ancho: 240, min: 100 },
  { key: 'lote', label: 'Lote', ancho: 100, min: 60 },
  { key: 'vencimiento', label: 'Vencimiento', ancho: 140, min: 90 },
  { key: 'cantidad', label: 'Cantidad', alinear: 'text-right', ancho: 70, min: 55 },
  { key: 'quitar', label: '', ancho: 40, min: 40 },
];

// Crear un kit o cambiar su contenido. Los lotes se muestran por FEFO con lo
// que queda libre; las confirmaciones (completar con otro lote, lote fuera de
// FEFO, lote sin vencimiento) se piden al agregar. El servidor vuelve a
// comprobar todo dentro de la transacción al guardar.
const FormKitModal = ({ familia, kit = null, onCerrar, onGuardado }) => {
  const config = FAMILIAS_KIT[familia];
  const hoy = hoyChile();
  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const originales = useMemo(() => kit?.lineas || [], [kit]);
  const [referencia, setReferencia] = useState(kit?.referencia || '');
  const [lineas, setLineas] = useState(originales);
  const [producto, setProducto] = useState(null);
  const [lotes, setLotes] = useState(null);
  const [loteElegido, setLoteElegido] = useState(null);
  const [cantidad, setCantidad] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const anchosLotes = useAnchosTablaBodega(COLUMNAS_LOTES, 'kits.form.lotes');
  const anchosLineas = useAnchosTablaBodega(COLUMNAS_LINEAS, 'kits.form.lineas');

  // Una lectura de lotes por cada producto elegido.
  useEffect(() => {
    if (!producto) return undefined;
    let vigente = true;
    leerLotesDeProducto(producto.id)
      .then((lista) => { if (vigente) setLotes(lista); })
      .catch((e) => { if (vigente) { setLotes([]); setError(mensajeError(e, 'No se pudo leer el stock.')); } });
    return () => { vigente = false; };
  }, [producto]);

  const visibles = useMemo(() => (lotes ? lotesVisibles(lotes, lineas, originales, hoy) : []), [lotes, lineas, originales, hoy]);
  // Sin elección, queda seleccionado el sugerido (el primero por FEFO).
  const seleccionado = visibles.find((l) => l.id === loteElegido) ? loteElegido : visibles[0]?.id || null;

  const elegirProducto = (p) => { setProducto(p); setLotes(null); setLoteElegido(null); setCantidad(''); setError(''); };

  const confirmar = (titulo, mensaje, confirmText) => new Promise((resolver) => {
    confirmAction(titulo, mensaje, () => resolver(true), { confirmText, onCancel: () => resolver(false) });
  });

  const agregar = async () => {
    setError('');
    const n = Number(cantidad);
    if (!Number.isInteger(n) || n <= 0) { setError('Ingresa una cantidad entera mayor a cero.'); return; }
    if (!seleccionado) return;
    const p = propuestaAgregar(visibles, seleccionado, n);
    if (p.faltante > 0) { setError(`No hay stock suficiente: faltan ${p.faltante} unidades entre todos los lotes vigentes.`); return; }
    if (p.completa && !await confirmar('Completar con otro lote', `El lote elegido no alcanza. Se agregará: ${p.partes.map(textoParte).join('; ')}.`, 'Agregar')) return;
    if (p.fueraDeFEFO.length && !await confirmar('Lote fuera de FEFO', `Hay stock que vence antes. Vas a usar: ${p.fueraDeFEFO.map(textoParte).join('; ')}. Quedará marcado en el kit.`, 'Usar este lote')) return;
    if (p.sinVencimiento.length && !await confirmar('Lote sin vencimiento', `Este stock no tiene fecha de vencimiento: ${p.sinVencimiento.map(textoParte).join('; ')}. Quedará marcado en el kit.`, 'Usar igual')) return;
    setLineas((actuales) => agregarPartes(actuales, producto, p.partes, { fueraDeFEFO: new Set(p.fueraDeFEFO.map((x) => x.lote.id)) }));
    setProducto(null); setLotes(null); setLoteElegido(null); setCantidad('');
  };

  const guardar = async (lista = lineas) => {
    setError('');
    if (!kit && !referencia) { setError('Selecciona la referencia del kit.'); return; }
    if (!lista.length) { setError('Agrega al menos un insumo.'); return; }
    setGuardando(true);
    try {
      const r = await guardarKit({ familia, ...(kit ? { kitId: kit.id } : { referencia }), lineas: lineasParaGuardar(lista) });
      const aviso = kit ? `Kit ${r.codigo} guardado.` : `Kit creado con ID ${r.codigo}.`;
      showToast(r.sinCambios ? 'El kit no tuvo cambios.' : aviso, 'success');
      onGuardado(r.id);
    } catch (e) {
      // El servidor detecta lo que cambió desde que se agregó la línea.
      const detalle = detalleError(e);
      if (detalle?.motivo === 'fuera-fefo' || detalle?.motivo === 'sin-vencimiento') {
        setGuardando(false);
        if (await confirmar('Confirmar selección', e.message, 'Confirmar y guardar')) {
          const confirmadas = marcarConfirmados(lista, detalle.motivo, detalle.loteIds);
          setLineas(confirmadas);
          await guardar(confirmadas);
        }
        return;
      }
      setError(mensajeError(e, 'No se pudo guardar el kit.'));
    } finally {
      setGuardando(false);
    }
  };

  const claseCampo = 'h-8 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 outline-none focus:border-[#2383C2] disabled:opacity-60';

  return (
    <div className="font-app text-tinta-principal fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label={kit ? 'Editar kit' : 'Nuevo kit'}>
      <div className="w-full max-w-4xl max-h-[92vh] flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 text-secundario">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
          <h3 className="text-subtitulo flex items-center gap-1.5"><Layers size={15} /> {kit ? `Editar kit ${kit.codigo}` : `Nuevo kit · ${config.etiqueta}`}</h3>
          <button type="button" onClick={onCerrar} disabled={guardando} aria-label="Cerrar" className="p-1 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"><X size={16} /></button>
        </div>
        <div className="p-4 overflow-auto flex flex-col gap-3">
          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-etiqueta">Referencia *</span>
              <select value={referencia} disabled={Boolean(kit)} onChange={(e) => setReferencia(e.target.value)} className={`${claseCampo} w-64`}>
                <option value="">Seleccionar…</option>
                {Object.entries(config.referencias).map(([k, r]) => <option key={k} value={k}>{r.etiqueta}</option>)}
              </select>
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-etiqueta">ID del kit</span>
              <span className="h-8 flex items-center text-tinta-secundaria">{kit ? kit.codigo : 'Se asignará al guardar'}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-etiqueta">Agregar insumo</span>
            <BuscadorProducto onElegir={elegirProducto} deshabilitado={guardando} placeholder="Ingresa o busca una referencia…" />
          </div>

          {producto && (
            <div className="flex flex-col gap-2 p-2 rounded border border-gray-200 dark:border-gray-700">
              <p className="text-etiqueta">{referenciaDe(producto) || producto.codigoMaestro} · {producto.nombre}</p>
              {lotes === null ? (
                <p className="text-tinta-atenuada">Cargando stock…</p>
              ) : visibles.length === 0 ? (
                <p className="text-tinta-secundaria">Esta referencia no tiene stock disponible vigente.</p>
              ) : (
                <>
                  <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto max-h-56">
                    <TablaBodega columnas={COLUMNAS_LOTES} anchos={anchosLotes.anchos} onResize={anchosLotes.handleResize}>
                      {visibles.map((l, i) => (
                        <FilaBodega key={l.id} columnas={COLUMNAS_LOTES} className={`cursor-pointer ${i === 0 ? 'bg-emerald-50 dark:bg-emerald-950/30' : ''}`} onClick={() => setLoteElegido(l.id)} celdas={{
                          elegir: <td className={`${TD} text-center`}><input type="radio" name="loteKit" checked={seleccionado === l.id} onChange={() => setLoteElegido(l.id)} aria-label={`Elegir lote ${etiquetaLote(l.lote)}`} /></td>,
                          lote: <td className={`${TD} text-numero-tabla`}>{etiquetaLote(l.lote)}</td>,
                          vencimiento: <td className={`${TD} text-numero-tabla`}><CeldaVencimiento fecha={l.vencimiento} hoy={hoy} /></td>,
                          disponible: <td className={`${TD} text-right text-numero-tabla`}>{l.disponible}</td>,
                          sugerido: <td className={TD}>{i === 0 && <Insignia color="verde">Sugerido</Insignia>}</td>,
                        }} />
                      ))}
                    </TablaBodega>
                  </div>
                  <div className="flex items-end gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-etiqueta">Cantidad</span>
                      <input type="number" min="1" step="1" inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }} className={`${claseCampo} w-24 text-right text-numero-tabla`} />
                    </label>
                    <button type="button" onClick={agregar} className="h-8 px-3 rounded bg-[#2383C2] text-white text-etiqueta flex items-center gap-1"><Plus size={12} /> Agregar al kit</button>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <span className="text-etiqueta">Contenido del kit</span>
            <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto">
              <TablaBodega columnas={COLUMNAS_LINEAS} anchos={anchosLineas.anchos} onResize={anchosLineas.handleResize}>
                {lineas.length === 0 && <FilaAnchoCompleto columnas={COLUMNAS_LINEAS}>Aún no hay insumos.</FilaAnchoCompleto>}
                {lineas.map((l) => (
                  <FilaBodega key={l.loteId} columnas={COLUMNAS_LINEAS} celdas={{
                    referencia: <td className={`${TD} text-numero-tabla`} title={l.referencia}>{l.referencia || '—'}</td>,
                    nombre: <td className={`${TD} text-secundario`} title={l.productoNombre}>{l.productoNombre}</td>,
                    lote: <td className={`${TD} text-numero-tabla`}>{etiquetaLote(l.lote)}</td>,
                    vencimiento: <td className={`${TD} text-numero-tabla`}><CeldaVencimiento fecha={l.vencimiento} hoy={hoy} /></td>,
                    cantidad: <td className={`${TD} text-right text-numero-tabla`}>{l.cantidad}</td>,
                    quitar: <td className={`${TD} text-center`}><button type="button" onClick={() => setLineas((x) => quitarLineaKit(x, l.loteId))} disabled={guardando} aria-label={`Quitar lote ${etiquetaLote(l.lote)}`} className="text-red-600"><Trash2 size={13} /></button></td>,
                  }} />
                ))}
              </TablaBodega>
            </div>
          </div>
          {error && <p className="text-red-600">{error}</p>}
        </div>
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} disabled={guardando} className="h-9 px-3 rounded bg-gray-200 dark:bg-gray-700 text-etiqueta">Cancelar</button>
          <button type="button" onClick={() => guardar()} disabled={guardando} className="h-9 px-4 rounded bg-[#2383C2] text-white text-etiqueta disabled:opacity-50">{guardando ? 'Guardando…' : 'Guardar kit'}</button>
        </div>
      </div>
    </div>
  );
};

export default FormKitModal;
