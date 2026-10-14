import { useEffect, useState } from 'react';
import { X, History } from 'lucide-react';
import { ETIQUETA_ID_ENTREGA } from '../../../../../../functions/bodega/nucleo.mjs';
import { leerHistorialTransito, mensajeError } from '../bodegaApi';
import { fechaHora } from './transitos';

const ETIQUETAS = { SALIDA: 'Salida a tránsito', ENTREGAR: 'Entrega', DEVOLVER: 'Devolución', NOTA: 'Nota' };
const COLORES = {
  SALIDA: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  ENTREGAR: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  DEVOLVER: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  NOTA: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
};

// Historial de un registro de tránsito (salida, entregas, devoluciones y notas).
const HistorialTransitoModal = ({ transito, onCerrar }) => {
  const [historial, setHistorial] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true;
    leerHistorialTransito(transito.id)
      .then((h) => { if (vigente) setHistorial(h); })
      .catch((e) => { if (vigente) { setError(mensajeError(e)); setHistorial([]); } });
    return () => { vigente = false; };
  }, [transito.id]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Historial del tránsito">
      <div className="w-full max-w-xl max-h-[90vh] flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 text-[12px]">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
          <div>
            <h3 className="text-[13px] font-bold flex items-center gap-1.5"><History size={15} /> Historial</h3>
            <p className="text-[11px] text-gray-500">{transito.productoNombre} · lote {transito.lote || 'S/L'} · {transito.centroNombre} · salida N° {transito.salidaNumero}</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="p-1 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"><X size={16} /></button>
        </div>
        <ol className="p-4 overflow-auto flex flex-col gap-2">
          {error && <li className="text-red-600">{error}</li>}
          {historial === null && <li className="text-gray-400 italic">Cargando…</li>}
          {historial?.map((h) => (
            <li key={h.id} className="border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1.5">
              <div className="flex items-center gap-2">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${COLORES[h.accion] || ''}`}>{ETIQUETAS[h.accion] || h.accion}</span>
                {h.cantidad !== null && h.cantidad !== undefined && <span className="font-num font-bold">{h.cantidad} u.</span>}
                <span className="ml-auto text-[11px] text-gray-500">{fechaHora(h.fecha)} · {h.usuario?.nombre || ''}</span>
              </div>
              {h.idEntrega && <div className="text-[11px]">{ETIQUETA_ID_ENTREGA}: <span className="font-num font-bold">{h.idEntrega}</span></div>}
              {h.observacion && <div className="text-[11px] text-gray-600 dark:text-gray-300">{h.observacion}</div>}
              {h.nota && <div className="text-[11px] text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{h.nota}</div>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
};

export default HistorialTransitoModal;
