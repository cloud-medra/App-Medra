import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Layers, Plus, Trash2, X } from 'lucide-react';
import { useToast } from '../../../../context/ToastContext';
import { useModal } from '../../../../context/ModalContext';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { FAMILIAS_KIT, hoyChile } from '../../../../../functions/armadoKits/nucleo.mjs';
import { GENEROS, VAINAS, buscarModelo, faltantesDelModelo, modelosDisponibles, recetaDelModelo } from '../../../../../functions/armadoKits/receta.mjs';
import { detalleError, leerLotesDeProducto, mensajeError } from '../../bodega/shared/bodegaApi';
import { TablaBodega, FilaBodega, FilaAnchoCompleto } from '../../bodega/shared/TablaBodega';
import { TD_BODEGA as TD, useAnchosTablaBodega } from '../../bodega/shared/anchosTablaBodega';
import { guardarKit } from './kitsApi';
import { useConfiguracionKits } from './useConfiguracionKits';
import { agregarPartes, etiquetaLote, lineasParaGuardar, lotesVisibles, marcarConfirmados, propuestaAgregar, quitarLineaKit, textoParte } from './lineasKit';
import { CeldaVencimiento, Insignia } from './comunes';

const COLUMNAS_LOTES = [
  { key: 'elegir', label: '', ancho: 34, min: 34 },
  { key: 'referencia', label: 'Referencia', ancho: 130, min: 70 },
  { key: 'lote', label: 'Lote', ancho: 130, min: 70 },
  { key: 'vencimiento', label: 'Vencimiento', ancho: 160, min: 90 },
  { key: 'disponible', label: 'Disponible', alinear: 'text-right', ancho: 85, min: 60 },
  { key: 'sugerido', label: '', ancho: 100, min: 60 },
];
const COLUMNAS_LINEAS = [
  { key: 'componente', label: 'Componente', ancho: 120, min: 70 },
  { key: 'referencia', label: 'Referencia', ancho: 110, min: 60 },
  { key: 'nombre', label: 'Nombre', ancho: 220, min: 100 },
  { key: 'lote', label: 'Lote', ancho: 100, min: 60 },
  { key: 'vencimiento', label: 'Vencimiento', ancho: 140, min: 90 },
  { key: 'cantidad', label: 'Cantidad', alinear: 'text-right', ancho: 70, min: 55 },
  { key: 'quitar', label: '', ancho: 40, min: 40 },
];

const suma = (lineas) => lineas.reduce((n, l) => n + l.cantidad, 0);

// Crear un kit o cambiar su contenido, componente por componente según la
// receta del modelo (Configuración Flexibles). Cada paso muestra juntos, por
// FEFO, los lotes de todas las referencias permitidas del componente y no
// deja seguir hasta completar su cantidad exacta. Las confirmaciones (otro
// lote, fuera de FEFO, sin vencimiento) se piden al agregar. El servidor
// vuelve a validar la receta y el stock al guardar.
// `rearmarDe`: kit cerrado que se rearma. El nuevo usa su mismo modelo (género
// y vaina fijos) y el flujo normal por FEFO; solo guarda el vínculo.
const FormKitModal = ({ familia, kit = null, rearmarDe = null, onCerrar, onGuardado }) => {
  const familiaConfig = FAMILIAS_KIT[familia];
  const hoy = hoyChile();
  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { config, cargando: cargandoConfig } = useConfiguracionKits(familia);
  const { datos: productos } = useCatalogo('bodegaProductos');
  const originales = useMemo(() => kit?.lineas || [], [kit]);
  const [genero, setGenero] = useState(kit?.genero || rearmarDe?.genero || '');
  const [vaina, setVaina] = useState(kit?.vaina || rearmarDe?.vaina || '');
  const [paso, setPaso] = useState(kit ? 1 : 0);
  const [lineas, setLineas] = useState(originales);
  const [lotesPorProducto, setLotesPorProducto] = useState({});
  const [loteElegido, setLoteElegido] = useState(null);
  const [cantidad, setCantidad] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const anchosLotes = useAnchosTablaBodega(COLUMNAS_LOTES, 'kits.form.lotes');
  const anchosLineas = useAnchosTablaBodega(COLUMNAS_LINEAS, 'kits.form.lineas');

  const disponibles = useMemo(() => modelosDisponibles(config), [config]);
  const modelo = kit ? buscarModelo(config, kit.genero, kit.vaina) : buscarModelo(config, genero, vaina);
  const modeloUsable = kit ? Boolean(modelo) : disponibles.includes(modelo);
  const receta = useMemo(() => (modelo && modeloUsable ? recetaDelModelo(config, modelo) : []), [config, modelo, modeloUsable]);
  const componente = paso >= 1 && paso <= receta.length ? receta[paso - 1] : null;
  const enRevision = receta.length > 0 && paso === receta.length + 1;

  // Lotes de cada referencia permitida: 1 lectura por producto, una sola vez.
  useEffect(() => {
    if (!componente) return undefined;
    const faltan = componente.referencias.filter((r) => !lotesPorProducto[r.productoId]);
    if (!faltan.length) return undefined;
    let vigente = true;
    Promise.all(faltan.map((r) => leerLotesDeProducto(r.productoId).then((l) => [r.productoId, l])))
      .then((pares) => { if (vigente) setLotesPorProducto((x) => ({ ...x, ...Object.fromEntries(pares) })); })
      .catch((e) => { if (vigente) setError(mensajeError(e, 'No se pudo leer el stock.')); });
    return () => { vigente = false; };
  }, [componente, lotesPorProducto]);

  const productosPorId = useMemo(() => Object.fromEntries(productos.map((p) => [p.id, p])), [productos]);
  const referenciaPorProducto = useMemo(() => Object.fromEntries(receta.flatMap((c) => c.referencias.map((r) => [r.productoId, r]))), [receta]);
  const productoDe = (lote) => productosPorId[lote.productoId] || { id: lote.productoId, nombre: referenciaPorProducto[lote.productoId]?.nombre || '', referencia: referenciaPorProducto[lote.productoId]?.referencia || '' };

  const cargandoLotes = componente ? componente.referencias.some((r) => !lotesPorProducto[r.productoId]) : false;
  const visibles = useMemo(() => (componente ? lotesVisibles(componente.referencias.flatMap((r) => lotesPorProducto[r.productoId] || []), lineas, originales, hoy) : []),
    [componente, lotesPorProducto, lineas, originales, hoy]);
  const lineasComponente = componente ? lineas.filter((l) => l.componenteId === componente.id) : [];
  const lleva = suma(lineasComponente);
  const falta = componente ? componente.cantidad - lleva : 0;
  const stockLibre = visibles.reduce((n, l) => n + l.disponible, 0);
  const seleccionado = visibles.find((l) => l.id === loteElegido) ? loteElegido : visibles[0]?.id || null;
  const incompletos = receta.filter((c) => suma(lineas.filter((l) => l.componenteId === c.id)) !== c.cantidad);

  const confirmar = (titulo, mensaje, confirmText) => new Promise((resolver) => {
    confirmAction(titulo, mensaje, () => resolver(true), { confirmText, onCancel: () => resolver(false) });
  });

  const irA = (n) => { setPaso(n); setLoteElegido(null); setCantidad(''); setError(''); };

  const agregar = async () => {
    setError('');
    const n = Number(cantidad || falta);
    if (!Number.isInteger(n) || n <= 0) { setError('Ingresa una cantidad entera mayor a cero.'); return; }
    if (n > falta) { setError(`${componente.nombre} necesita ${falta} más: no se puede agregar ${n}.`); return; }
    if (!seleccionado) return;
    const p = propuestaAgregar(visibles, seleccionado, n);
    if (p.faltante > 0) { setError(`No hay stock suficiente de ${componente.nombre}: faltan ${p.faltante} entre todas sus referencias.`); return; }
    if (p.completa && !await confirmar('Completar con otro lote', `El lote elegido no alcanza. Se agregará: ${p.partes.map(textoParte).join('; ')}.`, 'Agregar')) return;
    if (p.fueraDeFEFO.length && !await confirmar('Lote fuera de FEFO', `Hay stock que vence antes. Vas a usar: ${p.fueraDeFEFO.map(textoParte).join('; ')}. Quedará marcado en el kit.`, 'Usar este lote')) return;
    if (p.sinVencimiento.length && !await confirmar('Lote sin vencimiento', `Este stock no tiene fecha de vencimiento: ${p.sinVencimiento.map(textoParte).join('; ')}. Quedará marcado en el kit.`, 'Usar igual')) return;
    const datosComponente = { componenteId: componente.id, componenteNombre: componente.nombre, componenteOrden: componente.orden };
    setLineas((actuales) => agregarPartes(actuales, productoDe, p.partes, { fueraDeFEFO: new Set(p.fueraDeFEFO.map((x) => x.lote.id)), extra: datosComponente }));
    setLoteElegido(null);
    setCantidad('');
  };

  const guardar = async (lista = lineas) => {
    setError('');
    if (incompletos.length) { setError(`Faltan componentes por completar: ${incompletos.map((c) => c.nombre).join(', ')}.`); return; }
    setGuardando(true);
    try {
      const r = await guardarKit({ familia, ...(kit ? { kitId: kit.id } : { genero, vaina, referencia: modelo.referencia, ...(rearmarDe ? { rearmadoDe: rearmarDe.id } : {}) }), lineas: lineasParaGuardar(lista) });
      showToast(r.sinCambios ? 'El kit no tuvo cambios.' : (kit ? `Kit ${r.codigo} guardado.` : `Kit creado con ID ${r.codigo}.`), 'success');
      onGuardado(r.id, r);
    } catch (e) {
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
  const claseBoton = 'h-9 px-3 rounded text-etiqueta flex items-center gap-1 disabled:opacity-50';
  const filasLineas = (lista, conQuitar) => lista.map((l) => (
    <FilaBodega key={l.loteId} columnas={COLUMNAS_LINEAS} celdas={{
      componente: <td className={`${TD} text-secundario`}>{l.componenteNombre || '—'}</td>,
      referencia: <td className={`${TD} text-numero-tabla`} title={l.referencia}>{l.referencia || '—'}</td>,
      nombre: <td className={`${TD} text-secundario`} title={l.productoNombre}>{l.productoNombre}</td>,
      lote: <td className={`${TD} text-numero-tabla`}>{etiquetaLote(l.lote)}</td>,
      vencimiento: <td className={`${TD} text-numero-tabla`}><CeldaVencimiento fecha={l.vencimiento} hoy={hoy} /></td>,
      cantidad: <td className={`${TD} text-right text-numero-tabla`}>{l.cantidad}</td>,
      quitar: <td className={`${TD} text-center`}>{conQuitar && <button type="button" onClick={() => setLineas((x) => quitarLineaKit(x, l.loteId))} disabled={guardando} aria-label={`Quitar lote ${etiquetaLote(l.lote)}`} className="text-red-600"><Trash2 size={13} /></button>}</td>,
    }} />
  ));

  return (
    <div className="font-app text-tinta-principal fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label={kit ? 'Editar kit' : rearmarDe ? 'Rearmar kit' : 'Nuevo kit'}>
      <div className="w-full max-w-4xl max-h-[92vh] flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 text-secundario">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
          <div>
            <h3 className="text-subtitulo flex items-center gap-1.5"><Layers size={15} /> {kit ? `Editar kit ${kit.codigo}` : rearmarDe ? `Rearmar ${rearmarDe.codigo} · kit nuevo` : `Nuevo kit · ${familiaConfig.etiqueta}`}</h3>
            {modelo && modeloUsable && <p className="text-tinta-secundaria">{modelo.referencia} - {modelo.nombre} · ID: {kit ? kit.codigo : 'se asignará al guardar'}{rearmarDe ? ` · rearmado de ${rearmarDe.codigo} (solo referencia)` : ''}</p>}
          </div>
          <button type="button" onClick={onCerrar} disabled={guardando} aria-label="Cerrar" className="p-1 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"><X size={16} /></button>
        </div>

        {receta.length > 0 && (
          <ol className="px-4 pt-3 flex flex-wrap gap-1.5">
            {receta.map((c, i) => {
              const n = suma(lineas.filter((l) => l.componenteId === c.id));
              const actual = paso === i + 1;
              return <li key={c.id}><Insignia color={n === c.cantidad ? 'verde' : actual ? 'ambar' : 'gris'}>{i + 1}. {c.nombre} {n}/{c.cantidad}</Insignia></li>;
            })}
            <li><Insignia color={enRevision ? 'ambar' : 'gris'}>Revisión</Insignia></li>
          </ol>
        )}

        <div className="p-4 overflow-auto flex flex-col gap-3">
          {cargandoConfig && <p className="text-tinta-atenuada">Cargando configuración…</p>}

          {!cargandoConfig && paso === 0 && (
            <>
              <div className="flex flex-wrap gap-4">
                <label className="flex flex-col gap-1"><span className="text-etiqueta">Género *</span>
                  <select value={genero} onChange={(e) => setGenero(e.target.value)} disabled={Boolean(rearmarDe)} className={`${claseCampo} w-40`}>
                    <option value="">Seleccionar…</option>
                    {Object.entries(GENEROS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1"><span className="text-etiqueta">Tipo de vaina *</span>
                  <select value={vaina} onChange={(e) => setVaina(e.target.value)} disabled={Boolean(rearmarDe)} className={`${claseCampo} w-40`}>
                    <option value="">Seleccionar…</option>
                    {Object.entries(VAINAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <div className="flex flex-col gap-1"><span className="text-etiqueta">Referencia del kit</span>
                  <span className="h-8 flex items-center">{modeloUsable ? <strong>{modelo.referencia} - {modelo.nombre}</strong> : <span className="text-tinta-secundaria">Se determina con el género y la vaina</span>}</span>
                </div>
              </div>
              {genero && vaina && !modeloUsable && (
                <p className="p-2 rounded bg-amber-50 dark:bg-amber-950/30">
                  {!modelo ? 'No hay un modelo de kit para esa combinación.'
                    : modelo.activo === false ? `El modelo ${modelo.referencia} está inactivo.`
                      : `El modelo ${modelo.referencia} está incompleto: falta configurar ${faltantesDelModelo(config, modelo).join(', ')}.`}
                </p>
              )}
              {!disponibles.length && <p className="text-tinta-secundaria">No hay modelos activos y completos: revisa Configuración Flexibles.</p>}
            </>
          )}

          {componente && (
            <div className="flex flex-col gap-2">
              <p className="text-etiqueta">{componente.nombre}: lleva {lleva} de {componente.cantidad}{falta > 0 ? ` · faltan ${falta}` : ' · completo'}</p>
              {cargandoLotes ? <p className="text-tinta-atenuada">Cargando stock…</p> : (
                <>
                  {falta > stockLibre && <p className="p-2 rounded bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300">Falta stock de {componente.nombre}: se necesitan {falta} y hay {stockLibre} vigente(s) entre {componente.referencias.map((r) => r.referencia).join(', ')}.</p>}
                  {visibles.length > 0 && falta > 0 && (
                    <>
                      <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto max-h-56">
                        <TablaBodega columnas={COLUMNAS_LOTES} anchos={anchosLotes.anchos} onResize={anchosLotes.handleResize}>
                          {visibles.map((l, i) => (
                            <FilaBodega key={l.id} columnas={COLUMNAS_LOTES} className={`cursor-pointer ${i === 0 ? 'bg-emerald-50 dark:bg-emerald-950/30' : ''}`} onClick={() => setLoteElegido(l.id)} celdas={{
                              elegir: <td className={`${TD} text-center`}><input type="radio" name="loteKit" checked={seleccionado === l.id} onChange={() => setLoteElegido(l.id)} aria-label={`Elegir lote ${etiquetaLote(l.lote)}`} /></td>,
                              referencia: <td className={`${TD} text-numero-tabla`} title={productoDe(l).nombre}>{referenciaPorProducto[l.productoId]?.referencia || '—'}</td>,
                              lote: <td className={`${TD} text-numero-tabla`}>{etiquetaLote(l.lote)}</td>,
                              vencimiento: <td className={`${TD} text-numero-tabla`}><CeldaVencimiento fecha={l.vencimiento} hoy={hoy} /></td>,
                              disponible: <td className={`${TD} text-right text-numero-tabla`}>{l.disponible}</td>,
                              sugerido: <td className={TD}>{i === 0 && <Insignia color="verde">Recomendado</Insignia>}</td>,
                            }} />
                          ))}
                        </TablaBodega>
                      </div>
                      <div className="flex items-end gap-2">
                        <label className="flex flex-col gap-1"><span className="text-etiqueta">Cantidad</span>
                          <input type="number" min="1" max={falta} step="1" inputMode="numeric" value={cantidad} placeholder={String(falta)} onChange={(e) => setCantidad(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }} className={`${claseCampo} w-24 text-right text-numero-tabla`} />
                        </label>
                        <button type="button" onClick={agregar} className="h-8 px-3 rounded bg-[#2383C2] text-white text-etiqueta flex items-center gap-1"><Plus size={12} /> Agregar</button>
                      </div>
                    </>
                  )}
                  {!visibles.length && falta > 0 && <p className="text-tinta-secundaria">No hay stock vigente de {componente.referencias.map((r) => r.referencia).join(', ')}.</p>}
                </>
              )}
              {lineasComponente.length > 0 && (
                <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto">
                  <TablaBodega columnas={COLUMNAS_LINEAS} anchos={anchosLineas.anchos} onResize={anchosLineas.handleResize}>{filasLineas(lineasComponente, true)}</TablaBodega>
                </div>
              )}
            </div>
          )}

          {enRevision && (
            <div className="flex flex-col gap-1">
              <span className="text-etiqueta">Revisa el contenido del kit</span>
              <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto">
                <TablaBodega columnas={COLUMNAS_LINEAS} anchos={anchosLineas.anchos} onResize={anchosLineas.handleResize}>
                  {lineas.length === 0 && <FilaAnchoCompleto columnas={COLUMNAS_LINEAS}>Sin insumos.</FilaAnchoCompleto>}
                  {filasLineas([...lineas].sort((a, b) => (a.componenteOrden || 99) - (b.componenteOrden || 99)), false)}
                </TablaBodega>
              </div>
            </div>
          )}
          {kit && !modelo && !cargandoConfig && <p className="text-red-600">El modelo {kit.referencia} ya no está en la configuración: no se puede editar el contenido.</p>}
          {error && <p className="text-red-600">{error}</p>}
        </div>

        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-between gap-2">
          <button type="button" onClick={() => irA(paso - 1)} disabled={guardando || paso === 0 || (kit && paso === 1)} className={`${claseBoton} bg-gray-200 dark:bg-gray-700`}><ChevronLeft size={13} /> Anterior</button>
          <div className="flex gap-2">
            <button type="button" onClick={onCerrar} disabled={guardando} className={`${claseBoton} bg-gray-200 dark:bg-gray-700`}>Cancelar</button>
            {enRevision ? (
              <button type="button" onClick={() => guardar()} disabled={guardando || incompletos.length > 0} className={`${claseBoton} bg-[#2383C2] text-white`}>{guardando ? 'Guardando…' : 'Guardar kit'}</button>
            ) : (
              <button type="button" onClick={() => irA(paso + 1)} disabled={paso === 0 ? !modeloUsable : (!receta.length || falta !== 0)} className={`${claseBoton} bg-[#2383C2] text-white`}>Siguiente <ChevronRight size={13} /></button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FormKitModal;
