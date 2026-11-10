import { useState } from 'react';
import { ArrowLeft, CalendarPlus, FileText, Pencil, Trash2, PackagePlus, RotateCcw } from 'lucide-react';
import { useToast } from '../../../../context/ToastContext';
import { useModal } from '../../../../context/ModalContext';
import { useColumnasPermitidas } from '../../../../hooks/useColumnasPermitidas';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import {
  FAMILIAS_KIT, ETIQUETAS_ESTADO_KIT, estadoKit, hoyChile, kitEditable, versionKit, kitCerrado, consumoKit, usoDeLinea,
} from '../../../../../functions/armadoKits/nucleo.mjs';
import { mensajeError } from '../../bodega/shared/bodegaApi';
import { fechaHora } from '../../bodega/shared/transito/transitos';
import { BotonRestablecerAnchos } from '../../../ui/BotonRestablecerAnchos';
import { TablaBodega, FilaBodega } from '../../bodega/shared/TablaBodega';
import { TD_BODEGA as TD, useAnchosTablaBodega } from '../../bodega/shared/anchosTablaBodega';
import { eliminarKit } from './kitsApi';
import { etiquetaLote } from './lineasKit';
import { CeldaVencimiento, Insignia, InsigniaEstado } from './comunes';
import { generarPdfKit } from './pdfKit';
import { etiquetaModeloKit } from '../../../../../functions/armadoKits/receta.mjs';
import FormKitModal from './FormKitModal';
import CompletarVencimientoModal from './CompletarVencimientoModal';
import ReposicionKitModal from './ReposicionKitModal';

const pesos = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CL')}`;

const COLUMNAS_DETALLE = [
  { key: 'componente', label: 'Componente', ancho: 120, min: 70 },
  { key: 'referencia', label: 'Referencia', ancho: 130, min: 70 },
  { key: 'nombre', label: 'Nombre', ancho: 300, min: 120 },
  { key: 'lote', label: 'Lote', ancho: 120, min: 60 },
  { key: 'vencimiento', label: 'Vencimiento', ancho: 150, min: 90 },
  { key: 'cantidad', label: 'Cantidad', alinear: 'text-right', ancho: 80, min: 55 },
  // Solo en kits cerrados (entregado o entregado parcial).
  { key: 'usado', label: 'Usado', alinear: 'text-right', ancho: 70, min: 50, soloCerrado: true },
  { key: 'devuelto', label: 'Devuelto', alinear: 'text-right', ancho: 75, min: 50, soloCerrado: true },
  { key: 'repuesto', label: 'Repuesto', alinear: 'text-right', ancho: 75, min: 50, soloCerrado: true },
  { key: 'marcas', label: 'Marcas', ancho: 160, min: 80 },
  { key: 'accion', label: '', fija: true, ancho: 150, min: 110 },
];

// Contenido de un kit, con sus acciones. Muestra lo guardado en el kit (no
// vuelve a leer Bodega).
const DetalleKit = ({ kit, familia, onVolver, onCambio, onEliminado, onRearmar, ofrecerPdf = false, onPdfOfrecido }) => {
  const config = FAMILIAS_KIT[familia];
  const ruta = config.ruta;
  const hoy = hoyChile();
  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { hasPermission } = useGranularPermission();
  const cerrado = kitCerrado(kit);
  const { columnasVisibles: columnasPermitidas } = useColumnasPermitidas(ruta, 'kit', COLUMNAS_DETALLE);
  const columnasVisibles = cerrado ? columnasPermitidas : columnasPermitidas.filter((c) => !c.soloCerrado);
  const consumo = cerrado ? consumoKit(kit.lineas) : null;
  const [reponiendo, setReponiendo] = useState(false);
  const puedeReponer = cerrado && consumo.pendiente > 0 && hasPermission(ruta, 'kit', 'btn_registrar_reposicion');
  const puedeRearmar = cerrado && !kit.rearmadoEn && Boolean(onRearmar) && hasPermission(ruta, 'kit', 'btn_rearmar') && hasPermission(ruta, 'kits', 'btn_crear');
  const { anchos, handleResize, restablecerAnchos, personalizados } = useAnchosTablaBodega(columnasVisibles, `kits.${familia}.detalle`);
  const [editando, setEditando] = useState(false);
  const [completando, setCompletando] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const editable = kitEditable(kit);
  const estado = estadoKit(kit);
  const version = versionKit(kit);
  const puedeCompletar = editable && hasPermission(ruta, 'kit', 'btn_completar_vencimiento');
  // Hoja por imprimir: al crear el kit o al cambiar su contenido (la hoja
  // anterior queda desactualizada). Se espera a tener la versión nueva.
  const [avisoPdf, setAvisoPdf] = useState(() => (ofrecerPdf ? { tipo: 'creado', versionMinima: 1 } : null));
  const abrirPdf = () => {
    generarPdfKit({ kit, hoy })
      .catch((e) => showToast(mensajeError(e, 'No se pudo generar el PDF.'), 'error'));
  };
  const cerrarAvisoPdf = () => { setAvisoPdf(null); onPdfOfrecido?.(); };
  const alCambiarContenido = (r) => {
    onCambio();
    if (r && !r.sinCambios) setAvisoPdf({ tipo: 'editado', versionMinima: r.version || version + 1 });
  };

  const eliminar = () => confirmAction(
    'Eliminar kit',
    `Se eliminará el kit ${kit.codigo} y sus ${kit.totalUnidades} unidades volverán al stock de Bodega. Quedará registrado el movimiento.`,
    async () => {
      setEliminando(true);
      try {
        await eliminarKit({ familia, kitId: kit.id });
        showToast(`Kit ${kit.codigo} eliminado. El stock volvió a Bodega.`, 'success');
        onEliminado();
      } catch (e) {
        showToast(mensajeError(e, 'No se pudo eliminar el kit.'), 'error');
      } finally {
        setEliminando(false);
      }
    },
    { confirmText: 'Eliminar', type: 'danger' },
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <button type="button" onClick={onVolver} className="text-etiqueta text-[#2383C2] flex items-center gap-1"><ArrowLeft size={12} /> Volver al listado</button>
          <h3 className="text-titulo-seccion mt-1">{kit.codigo}</h3>
          <p className="text-secundario text-tinta-secundaria">
            {etiquetaModeloKit(kit)} · {kit.cantidadLineas} insumos · {kit.totalUnidades} unidades · Creado {fechaHora(kit.creadoEn)} por {kit.creadoPor?.nombre || '—'}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5">
            <InsigniaEstado estado={estado} etiqueta={ETIQUETAS_ESTADO_KIT[estado]} />
            <span className="text-tinta-secundaria">Contenido versión {version}</span>
            {kit.despacho && <span className="text-tinta-secundaria">· Despachado a {kit.despacho.centroNombre}, salida N° {kit.despacho.salidaNumero}, {fechaHora(kit.despacho.fecha)} por {kit.despacho.usuario?.nombre}</span>}
            {kit.recepcion && <span className="text-tinta-secundaria">· {kit.recepcion.parcial ? 'Devolución revisada' : 'Recibido'} {fechaHora(kit.recepcion.fecha)} por {kit.recepcion.usuario?.nombre}</span>}
            {kit.rearmadoDe && <Insignia color="gris" title="Solo referencia">Rearmado de {kit.rearmadoDe.codigo}</Insignia>}
            {kit.rearmadoEn && <Insignia color="gris" title="Solo referencia">Rearmado en {kit.rearmadoEn.codigo}</Insignia>}
          </p>
          {cerrado && (
            <p className="mt-1 text-secundario" aria-label="Consumo del kit">
              Usado <strong>{consumo.usado}</strong> ({pesos(consumo.valorUsado)})
              {kit.devolucion && <> · Devuelto <strong>{kit.devolucion.devuelto}</strong> ({pesos(kit.devolucion.valorDevuelto)})</>}
              {' '}· Repuesto por el centro <strong>{consumo.repuesto}</strong> ({pesos(consumo.valorRepuesto)})
              {' '}· {consumo.pendiente > 0 ? <Insignia color="ambar">Reposición pendiente: {consumo.pendiente}</Insignia> : consumo.usado > 0 ? <Insignia color="verde">Reposición completa</Insignia> : null}
            </p>
          )}
          {kit.devolucion?.observacion && <p className="text-tinta-secundaria">Observación de la devolución: {kit.devolucion.observacion}</p>}
          {!editable && <p className="mt-1 text-tinta-secundaria">Un kit en tránsito o entregado no se edita ni se elimina.</p>}
          {(kit.reposiciones || []).length > 0 && (
            <ul className="mt-1 text-tinta-secundaria list-disc pl-5" aria-label="Reposiciones del centro">
              {kit.reposiciones.map((r) => (
                <li key={r.numero}>Reposición {r.numero} · {fechaHora(r.fecha)} por {r.usuario?.nombre}: {r.items.map((i) => `${i.cantidad} × ${i.referencia} lote ${i.lote} (vence ${i.vencimiento}, ${pesos(i.valor)})`).join('; ')}{r.observacion ? ` · ${r.observacion}` : ''}</li>
              ))}
            </ul>
          )}
          {kit.lineasSinVencimiento > 0 && (
            <p className="mt-1"><Insignia color="ambar">Este kit contiene {kit.lineasSinVencimiento} insumo(s) sin vencimiento</Insignia></p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={abrirPdf} className="h-7 px-2 rounded border border-gray-300 dark:border-gray-600 text-etiqueta flex items-center gap-1 text-tinta-secundaria"><FileText size={12} /> PDF</button>
          {puedeReponer && (
            <button type="button" onClick={() => setReponiendo(true)} className="h-7 px-2 rounded border border-[#2383C2] text-[#2383C2] text-etiqueta flex items-center gap-1"><PackagePlus size={12} /> Registrar reposición</button>
          )}
          {puedeRearmar && (
            <button type="button" onClick={() => onRearmar(kit)} className="h-7 px-2 rounded bg-[#2383C2] text-white text-etiqueta flex items-center gap-1"><RotateCcw size={12} /> Rearmar</button>
          )}
          {editable && hasPermission(ruta, 'kit', 'btn_editar') && (
            <button type="button" onClick={() => setEditando(true)} className="h-7 px-2 rounded border border-gray-300 dark:border-gray-600 text-etiqueta flex items-center gap-1 text-tinta-secundaria"><Pencil size={12} /> Editar</button>
          )}
          {editable && hasPermission(ruta, 'kit', 'btn_eliminar') && (
            <button type="button" onClick={eliminar} disabled={eliminando} className="h-7 px-2 rounded bg-red-600 text-white text-etiqueta flex items-center gap-1 disabled:opacity-50"><Trash2 size={12} /> {eliminando ? 'Eliminando…' : 'Eliminar'}</button>
          )}
        </div>
      </div>
      <div className="flex justify-end"><BotonRestablecerAnchos onClick={restablecerAnchos} personalizados={personalizados} /></div>
      <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto">
        <TablaBodega columnas={columnasVisibles} anchos={anchos} onResize={handleResize}>
          {kit.lineas.map((l) => (
            <FilaBodega key={l.loteId} columnas={columnasVisibles} celdas={{
              componente: <td className={`${TD} text-secundario`}>{l.componenteNombre || '—'}</td>,
              referencia: <td className={`${TD} text-numero-tabla`} title={l.referencia}>{l.referencia || '—'}</td>,
              nombre: <td className={`${TD} text-etiqueta`} title={l.productoNombre}>{l.productoNombre}</td>,
              lote: <td className={`${TD} text-numero-tabla`}>{etiquetaLote(l.lote)}</td>,
              vencimiento: <td className={`${TD} text-numero-tabla`}><CeldaVencimiento fecha={l.vencimiento} hoy={hoy} /></td>,
              cantidad: <td className={`${TD} text-right text-numero-tabla`}>{l.cantidad}</td>,
              usado: <td className={`${TD} text-right text-numero-tabla`}>{usoDeLinea(l).usado}</td>,
              devuelto: <td className={`${TD} text-right text-numero-tabla`}>{usoDeLinea(l).devuelto}</td>,
              repuesto: <td className={`${TD} text-right text-numero-tabla`}>{usoDeLinea(l).repuesto}</td>,
              marcas: (
                <td className={TD}>
                  <span className="inline-flex gap-1">
                    {l.fueraDeFEFO && <Insignia color="ambar" title="Se eligió un lote que no era el primero en vencer">Fuera de FEFO</Insignia>}
                    {l.vencimientoCompletado && <Insignia color="verde" title="La fecha se completó después de armar el kit">Fecha completada</Insignia>}
                  </span>
                </td>
              ),
              accion: (
                <td className={TD}>
                  {!l.vencimiento && puedeCompletar && (
                    <button type="button" onClick={() => setCompletando(l)} className="text-etiqueta text-[#2383C2] flex items-center gap-1"><CalendarPlus size={12} /> Completar vencimiento</button>
                  )}
                </td>
              ),
            }} />
          ))}
        </TablaBodega>
      </div>
      {editando && <FormKitModal familia={familia} kit={kit} onCerrar={() => setEditando(false)} onGuardado={(_id, r) => { setEditando(false); alCambiarContenido(r); }} />}
      {reponiendo && <ReposicionKitModal familia={familia} kit={kit} onCerrar={() => setReponiendo(false)} onHecho={() => { setReponiendo(false); onCambio(); }} />}
      {completando && <CompletarVencimientoModal familia={familia} kit={kit} linea={completando} onCerrar={() => setCompletando(null)} onHecho={() => { setCompletando(null); alCambiarContenido({ version: version + 1 }); }} />}
      {avisoPdf && (
        <div className="font-app text-tinta-principal fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Hoja del kit">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 text-secundario">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700"><h3 className="text-subtitulo flex items-center gap-1.5"><FileText size={15} /> Hoja del kit {kit.codigo}</h3></div>
            <div className="p-4 flex flex-col gap-2">
              {avisoPdf.tipo === 'creado'
                ? <p>Kit guardado. Imprime su hoja con el código de barras: se escanea en Bodega &gt; Egreso para despacharlo.</p>
                : <p className="p-2 rounded bg-amber-50 dark:bg-amber-950/30">El contenido cambió: la hoja impresa quedó desactualizada y no servirá para despachar. Imprime la versión {avisoPdf.versionMinima} y descarta la anterior.</p>}
            </div>
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button type="button" onClick={cerrarAvisoPdf} className="h-8 px-3 rounded bg-gray-200 dark:bg-gray-700 text-etiqueta">Más tarde</button>
              <button type="button" onClick={() => { abrirPdf(); cerrarAvisoPdf(); }} disabled={version < avisoPdf.versionMinima} className="h-8 px-3 rounded bg-[#2383C2] text-white text-etiqueta disabled:opacity-50">{version < avisoPdf.versionMinima ? 'Actualizando…' : 'Abrir PDF'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DetalleKit;
