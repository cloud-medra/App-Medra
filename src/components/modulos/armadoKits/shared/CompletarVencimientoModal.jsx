import { useState } from 'react';
import { AlertTriangle, CalendarPlus, X } from 'lucide-react';
import { useToast } from '../../../../context/ToastContext';
import { detalleError, mensajeError } from '../../bodega/shared/bodegaApi';
import { completarVencimiento } from './kitsApi';
import { etiquetaLote, fechaCorta } from './lineasKit';

const Dato = ({ etiqueta, children }) => (
  <div className="flex gap-2"><dt className="w-20 shrink-0 text-tinta-secundaria">{etiqueta}</dt><dd className="text-etiqueta">{children}</dd></div>
);

// Fecha de una línea sin vencimiento, en tres pasos: se ingresa, se confirma
// viendo producto, lote y fecha y, si ese lote ya existe con otra fecha, se
// pide una confirmación explícita (puede ser un error de digitación). La
// validación y el cambio ocurren en una transacción del servidor.
const CompletarVencimientoModal = ({ familia, kit, linea, onCerrar, onHecho }) => {
  const { showToast } = useToast();
  const [paso, setPaso] = useState('ingreso');
  const [fecha, setFecha] = useState('');
  const [fechasExistentes, setFechasExistentes] = useState([]);
  const [aceptaDistinta, setAceptaDistinta] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const guardar = async (confirmarFechaDistinta) => {
    setGuardando(true);
    setError('');
    try {
      await completarVencimiento({ familia, kitId: kit.id, loteId: linea.loteId, vencimiento: fecha, confirmarFechaDistinta });
      showToast('Fecha de vencimiento guardada.', 'success');
      onHecho();
    } catch (e) {
      const detalle = detalleError(e);
      if (detalle?.motivo === 'fecha-distinta') {
        setFechasExistentes(detalle.fechasExistentes || []);
        setPaso('fechaDistinta');
      } else {
        setError(mensajeError(e, 'No se pudo guardar la fecha.'));
      }
    } finally {
      setGuardando(false);
    }
  };

  const claseSecundario = 'h-8 px-3 rounded bg-gray-200 dark:bg-gray-700 text-etiqueta';
  const clasePrincipal = 'h-8 px-3 rounded bg-[#2383C2] text-white text-etiqueta disabled:opacity-50';

  return (
    <div className="font-app text-tinta-principal fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Completar vencimiento">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 text-secundario">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
          <h3 className="text-subtitulo flex items-center gap-1.5"><CalendarPlus size={15} /> Completar vencimiento</h3>
          <button type="button" onClick={onCerrar} disabled={guardando} aria-label="Cerrar" className="p-1 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"><X size={16} /></button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <dl className="flex flex-col gap-1">
            <Dato etiqueta="Producto">{linea.productoNombre}</Dato>
            <Dato etiqueta="Lote">{etiquetaLote(linea.lote)}</Dato>
            {paso !== 'ingreso' && <Dato etiqueta="Fecha">{fechaCorta(fecha)}</Dato>}
          </dl>
          {paso === 'ingreso' && (
            <label className="flex flex-col gap-1">
              <span className="text-etiqueta">Fecha de vencimiento</span>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-8 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 outline-none focus:border-[#2383C2]" />
            </label>
          )}
          {paso === 'confirmar' && <p>Confirma que estos datos son correctos. El cambio no mueve stock y queda en la auditoría del kit.</p>}
          {paso === 'fechaDistinta' && (
            <div className="flex flex-col gap-2 p-2 rounded bg-amber-50 dark:bg-amber-950/30">
              <p className="flex items-start gap-1.5"><AlertTriangle size={14} className="text-amber-600 shrink-0" /><span>Este lote ya existe en Bodega con otra fecha: <strong>{fechasExistentes.map(fechaCorta).join(', ')}</strong>. Puede ser un error de digitación.</span></p>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={aceptaDistinta} onChange={(e) => setAceptaDistinta(e.target.checked)} /> Revisé la etiqueta y la fecha {fechaCorta(fecha)} es correcta.</label>
            </div>
          )}
          {error && <p className="text-red-600">{error}</p>}
        </div>
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          {paso === 'ingreso' && (
            <>
              <button type="button" onClick={onCerrar} className={claseSecundario}>Cancelar</button>
              <button type="button" onClick={() => setPaso('confirmar')} disabled={!fecha} className={clasePrincipal}>Continuar</button>
            </>
          )}
          {paso === 'confirmar' && (
            <>
              <button type="button" onClick={() => setPaso('ingreso')} disabled={guardando} className={claseSecundario}>Volver</button>
              <button type="button" onClick={() => guardar(false)} disabled={guardando} className={clasePrincipal}>{guardando ? 'Guardando…' : 'Confirmar y guardar'}</button>
            </>
          )}
          {paso === 'fechaDistinta' && (
            <>
              <button type="button" onClick={() => { setAceptaDistinta(false); setPaso('ingreso'); }} disabled={guardando} className={claseSecundario}>Corregir la fecha</button>
              <button type="button" onClick={() => guardar(true)} disabled={guardando || !aceptaDistinta} className={clasePrincipal}>{guardando ? 'Guardando…' : 'Guardar de todas formas'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CompletarVencimientoModal;
