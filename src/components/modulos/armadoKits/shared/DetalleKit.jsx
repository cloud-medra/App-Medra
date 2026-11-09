import { useState } from 'react';
import { ArrowLeft, CalendarPlus, Pencil, Trash2 } from 'lucide-react';
import { useToast } from '../../../../context/ToastContext';
import { useModal } from '../../../../context/ModalContext';
import { useColumnasPermitidas } from '../../../../hooks/useColumnasPermitidas';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { FAMILIAS_KIT, hoyChile } from '../../../../../functions/armadoKits/nucleo.mjs';
import { mensajeError } from '../../bodega/shared/bodegaApi';
import { fechaHora } from '../../bodega/shared/transito/transitos';
import { BotonRestablecerAnchos } from '../../../ui/BotonRestablecerAnchos';
import { TablaBodega, FilaBodega } from '../../bodega/shared/TablaBodega';
import { TD_BODEGA as TD, useAnchosTablaBodega } from '../../bodega/shared/anchosTablaBodega';
import { eliminarKit } from './kitsApi';
import { etiquetaLote } from './lineasKit';
import { CeldaVencimiento, Insignia } from './comunes';
import FormKitModal from './FormKitModal';
import CompletarVencimientoModal from './CompletarVencimientoModal';

const COLUMNAS_DETALLE = [
  { key: 'referencia', label: 'Referencia', ancho: 130, min: 70 },
  { key: 'nombre', label: 'Nombre', ancho: 300, min: 120 },
  { key: 'lote', label: 'Lote', ancho: 120, min: 60 },
  { key: 'vencimiento', label: 'Vencimiento', ancho: 150, min: 90 },
  { key: 'cantidad', label: 'Cantidad', alinear: 'text-right', ancho: 80, min: 55 },
  { key: 'marcas', label: 'Marcas', ancho: 160, min: 80 },
  { key: 'accion', label: '', fija: true, ancho: 150, min: 110 },
];

// Contenido de un kit, con sus acciones. Muestra lo guardado en el kit (no
// vuelve a leer Bodega).
const DetalleKit = ({ kit, familia, onVolver, onCambio, onEliminado }) => {
  const config = FAMILIAS_KIT[familia];
  const ruta = config.ruta;
  const hoy = hoyChile();
  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { hasPermission } = useGranularPermission();
  const { columnasVisibles } = useColumnasPermitidas(ruta, 'kit', COLUMNAS_DETALLE);
  const { anchos, handleResize, restablecerAnchos, personalizados } = useAnchosTablaBodega(columnasVisibles, `kits.${familia}.detalle`);
  const [editando, setEditando] = useState(false);
  const [completando, setCompletando] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const puedeCompletar = hasPermission(ruta, 'kit', 'btn_completar_vencimiento');

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
            {config.referencias[kit.referencia]?.etiqueta || kit.referencia} · {kit.cantidadLineas} insumos · {kit.totalUnidades} unidades · Creado {fechaHora(kit.creadoEn)} por {kit.creadoPor?.nombre || '—'}
          </p>
          {kit.lineasSinVencimiento > 0 && (
            <p className="mt-1"><Insignia color="ambar">Este kit contiene {kit.lineasSinVencimiento} insumo(s) sin vencimiento</Insignia></p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {hasPermission(ruta, 'kit', 'btn_editar') && (
            <button type="button" onClick={() => setEditando(true)} className="h-7 px-2 rounded border border-gray-300 dark:border-gray-600 text-etiqueta flex items-center gap-1 text-tinta-secundaria"><Pencil size={12} /> Editar</button>
          )}
          {hasPermission(ruta, 'kit', 'btn_eliminar') && (
            <button type="button" onClick={eliminar} disabled={eliminando} className="h-7 px-2 rounded bg-red-600 text-white text-etiqueta flex items-center gap-1 disabled:opacity-50"><Trash2 size={12} /> {eliminando ? 'Eliminando…' : 'Eliminar'}</button>
          )}
        </div>
      </div>
      <div className="flex justify-end"><BotonRestablecerAnchos onClick={restablecerAnchos} personalizados={personalizados} /></div>
      <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto">
        <TablaBodega columnas={columnasVisibles} anchos={anchos} onResize={handleResize}>
          {kit.lineas.map((l) => (
            <FilaBodega key={l.loteId} columnas={columnasVisibles} celdas={{
              referencia: <td className={`${TD} text-numero-tabla`} title={l.referencia}>{l.referencia || '—'}</td>,
              nombre: <td className={`${TD} text-etiqueta`} title={l.productoNombre}>{l.productoNombre}</td>,
              lote: <td className={`${TD} text-numero-tabla`}>{etiquetaLote(l.lote)}</td>,
              vencimiento: <td className={`${TD} text-numero-tabla`}><CeldaVencimiento fecha={l.vencimiento} hoy={hoy} /></td>,
              cantidad: <td className={`${TD} text-right text-numero-tabla`}>{l.cantidad}</td>,
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
      {editando && <FormKitModal familia={familia} kit={kit} onCerrar={() => setEditando(false)} onGuardado={() => { setEditando(false); onCambio(); }} />}
      {completando && <CompletarVencimientoModal familia={familia} kit={kit} linea={completando} onCerrar={() => setCompletando(null)} onHecho={() => { setCompletando(null); onCambio(); }} />}
    </div>
  );
};

export default DetalleKit;
