import { AlertTriangle, X } from 'lucide-react';
import { useModal } from '../../../../context/ModalContext';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { RUTAS } from '../../../../../functions/bodega/nucleo.mjs';
import { accionAvisoMaestro, etiquetaProductoEnlazado } from './productoEnlazado';

// El ítem del maestro clínico ya tiene producto en Bodega (admite uno solo).
// Va encima de la pantalla: quien lo abre conserva lo que estaba ingresando.
//   aviso: { productoId, referencia, codigoMaestro, nombre, activo, mensaje? }
//   codigo: el código escaneado (vacío si no hay).
//   onAgregar(): vincula el código a ese producto (tras confirmar).
//   onAbrir(productoId): abre el producto.
const AvisoMaestroConProducto = ({ aviso, codigo = '', onAgregar, onAbrir, onCerrar }) => {
  const { confirmAction } = useModal();
  const { hasPermission } = useGranularPermission();
  const accion = accionAvisoMaestro({ aviso, codigo, puedeVincular: hasPermission(RUTAS.maestro, 'codigos', 'btn_vincular') });
  const etiqueta = etiquetaProductoEnlazado(aviso);

  const agregar = () => confirmAction(
    'Agregar código',
    `Código ${codigo}. Producto: ${etiqueta} · ${aviso.nombre}.`,
    onAgregar,
    { confirmText: 'Agregar', type: 'primary' },
  );

  return (
    <div className="font-app text-tinta-principal fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Ítem con producto en Bodega">
      <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 text-secundario">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
          <h3 className="text-subtitulo flex items-center gap-1.5"><AlertTriangle size={15} className="text-amber-600" /> Este ítem ya tiene producto</h3>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="p-1 rounded-full text-tinta-atenuada hover:bg-gray-200 dark:hover:bg-gray-700"><X size={16} /></button>
        </div>
        <div className="p-4 flex flex-col gap-2">
          {aviso.productoId ? (
            <p>Este ítem del maestro clínico ya tiene producto en Bodega: <strong>{etiqueta}</strong> · {aviso.nombre}. No se puede crear otro.</p>
          ) : (
            <p>{aviso.mensaje}</p>
          )}
          {aviso.productoId && aviso.activo === false && <p className="text-tinta-secundaria">Ese producto está inactivo.</p>}
          {accion === null && aviso.productoId && codigo && aviso.activo !== false && <p className="text-tinta-secundaria">No tienes permiso para vincular códigos de barra.</p>}
        </div>
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="h-8 px-3 rounded bg-gray-200 dark:bg-gray-700 text-etiqueta">Volver</button>
          {accion === 'AGREGAR' && <button type="button" onClick={agregar} className="h-8 px-3 rounded bg-[#2383C2] text-white text-etiqueta">Agregar este código a {etiqueta}</button>}
          {accion === 'ABRIR' && onAbrir && <button type="button" onClick={() => onAbrir(aviso.productoId)} className="h-8 px-3 rounded bg-[#2383C2] text-white text-etiqueta">Abrir producto</button>}
        </div>
      </div>
    </div>
  );
};

export default AvisoMaestroConProducto;
