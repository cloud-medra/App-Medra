import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { RUTA_CODIGOS_BARRA } from '../../../../../functions/bodega/nucleo.mjs';
import { leerVinculo, mensajeError, obtenerProducto } from '../../bodega/shared/bodegaApi';
import { filasDeVinculos, referenciaVisible } from './filasCodigos';
import AccionCodigoModal from './AccionCodigoModal';

// ¿Puede corregir códigos desde el aviso de "código ya vinculado"?
// eslint-disable-next-line react-refresh/only-export-components
export const usePuedeCorregirCodigo = () => {
  const { hasPermission } = useGranularPermission();
  return ['btn_editar', 'btn_mover', 'btn_eliminar'].some((a) => hasPermission(RUTA_CODIGOS_BARRA, 'codigos', a));
};

// Aviso de código ya vinculado, con acceso a corregirlo ahí mismo: se abre
// encima de la pantalla para no perder un ingreso a medio hacer.
//   aviso: el mensaje del servidor (código, referencia y producto).
//   onReasignar: el "Reasignar" que ya existía (null si no corresponde).
const CorregirCodigoModal = ({ clave, aviso, onReasignar = null, onCerrar, onCorregido }) => {
  const { hasPermission } = useGranularPermission();
  const [fila, setFila] = useState(null);
  const [error, setError] = useState('');
  const [accion, setAccion] = useState(null);

  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const vinculo = await leerVinculo(clave);
        const producto = vinculo?.productoId ? await obtenerProducto(vinculo.productoId) : null;
        if (!vigente) return;
        if (vinculo) setFila(filasDeVinculos([vinculo], producto ? [producto] : [])[0]);
        else setError('Ese código ya no está vinculado: puedes volver a intentarlo.');
      } catch (e) {
        if (vigente) setError(mensajeError(e, 'No se pudo leer el código.'));
      }
    })();
    return () => { vigente = false; };
  }, [clave]);

  const boton = (id, etiqueta, permiso) => hasPermission(RUTA_CODIGOS_BARRA, 'codigos', permiso) && (
    <button type="button" onClick={() => setAccion(id)} disabled={!fila} className="h-8 px-3 rounded bg-[#2383C2] text-white text-etiqueta disabled:opacity-50">{etiqueta}</button>
  );

  if (accion) return <AccionCodigoModal accion={accion} fila={fila} onCerrar={() => setAccion(null)} onHecho={onCorregido} />;

  return (
    <div className="font-app text-tinta-principal fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Código ya vinculado">
      <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 text-secundario">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
          <h3 className="text-subtitulo flex items-center gap-1.5"><AlertTriangle size={15} className="text-amber-600" /> Código ya vinculado</h3>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="p-1 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"><X size={16} /></button>
        </div>
        <div className="p-4 flex flex-col gap-2">
          <p>{aviso}</p>
          {fila && <p className="text-tinta-secundaria">Pertenece a la referencia <strong>{referenciaVisible(fila)}</strong> · {fila.nombre}. Corrígelo si quedó mal vinculado.</p>}
          {error && <p className="text-red-600">{error}</p>}
        </div>
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCerrar} className="h-8 px-3 rounded bg-gray-200 dark:bg-gray-700 text-etiqueta">Cerrar</button>
          {onReasignar && <button type="button" onClick={onReasignar} className="h-8 px-3 rounded border border-gray-300 dark:border-gray-600 text-etiqueta">Reasignar</button>}
          {boton('ELIMINAR', 'Eliminar vínculo', 'btn_eliminar')}
          {boton('MOVER', 'Mover', 'btn_mover')}
          {boton('EDITAR', 'Editar código', 'btn_editar')}
        </div>
      </div>
    </div>
  );
};

export default CorregirCodigoModal;
