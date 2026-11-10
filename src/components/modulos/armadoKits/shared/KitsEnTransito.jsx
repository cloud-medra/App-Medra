import { useCallback, useEffect, useState } from 'react';
import { Layers, X } from 'lucide-react';
import { useToast } from '../../../../context/ToastContext';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { ACCIONES_TRANSITO_KIT } from '../../../../../functions/armadoKits/nucleo.mjs';
import { etiquetaModeloKit } from '../../../../../functions/armadoKits/receta.mjs';
import { mensajeError } from '../../bodega/shared/bodegaApi';
import { fechaHora } from '../../bodega/shared/transito/transitos';
import { gestionarTransitoKit, leerKitsEnTransito } from './kitsApi';
import RevisarDevolucionKitModal from './RevisarDevolucionKitModal';

const ACCIONES = {
  RECIBIR: { titulo: 'Recibir kit', boton: 'Recibir', motivo: false, texto: 'El kit queda entregado en el centro. No mueve stock: ya salió de Bodega al armarlo.' },
  RECHAZAR: { titulo: 'Rechazar kit', boton: 'Rechazar', motivo: true, texto: 'El centro no lo recibe: el kit vuelve a estar armado, con su mismo contenido.' },
  ANULAR: { titulo: 'Anular despacho', boton: 'Anular', motivo: true, texto: 'El despacho fue un error: el kit vuelve a estar armado, con su mismo contenido.' },
};
const permisoDe = (accion) => ACCIONES_TRANSITO_KIT[accion].slice(1);
const referenciaDeKit = etiquetaModeloKit;

const AccionKitModal = ({ accion, kit, onCerrar, onHecho }) => {
  const def = ACCIONES[accion];
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const confirmar = async () => {
    if (def.motivo && !texto.trim()) { setError('Escribe el motivo.'); return; }
    setGuardando(true);
    setError('');
    try {
      await gestionarTransitoKit({ accion, kitId: kit.id, ...(def.motivo ? { motivo: texto } : { observacion: texto }) });
      onHecho(`${def.boton}: kit ${kit.codigo}.`);
    } catch (e) {
      setError(mensajeError(e, 'No se pudo guardar.'));
    } finally {
      setGuardando(false);
    }
  };
  return (
    <div className="font-app text-tinta-principal fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label={def.titulo}>
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 text-secundario">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
          <h3 className="text-subtitulo">{def.titulo} {kit.codigo}</h3>
          <button type="button" onClick={onCerrar} disabled={guardando} aria-label="Cerrar" className="p-1 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"><X size={16} /></button>
        </div>
        <div className="p-4 flex flex-col gap-2">
          <p>{referenciaDeKit(kit)} · {kit.totalUnidades} unidades · {kit.despacho?.centroNombre} · salida N° {kit.despacho?.salidaNumero}</p>
          <p className="text-tinta-secundaria">{def.texto}</p>
          <label className="flex flex-col gap-1">
            <span className="text-etiqueta">{def.motivo ? 'Motivo *' : 'Observación (opcional)'}</span>
            <input value={texto} autoFocus maxLength={500} onChange={(e) => setTexto(e.target.value)} className="h-8 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900" />
          </label>
          {error && <p className="text-red-600">{error}</p>}
        </div>
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} disabled={guardando} className="h-8 px-3 rounded bg-gray-200 dark:bg-gray-700 text-etiqueta">Cancelar</button>
          <button type="button" onClick={confirmar} disabled={guardando} className={`h-8 px-3 rounded text-white text-etiqueta disabled:opacity-50 ${accion === 'RECIBIR' ? 'bg-[#2383C2]' : 'bg-red-600'}`}>{guardando ? 'Guardando…' : def.boton}</button>
        </div>
      </div>
    </div>
  );
};

// Kits despachados que aún no se reciben (Bodega > Tránsito). Se mueven
// completos y no usan los registros de tránsito por línea.
const KitsEnTransito = ({ version = 0 }) => {
  const { showToast } = useToast();
  const { hasPermission } = useGranularPermission();
  const [kits, setKits] = useState(null);
  const [accion, setAccion] = useState(null);
  const [revisando, setRevisando] = useState(null);
  const puedeRevisar = hasPermission(...permisoDe('REVISAR_DEVOLUCION'));

  const cargar = useCallback(() => {
    leerKitsEnTransito()
      .then(setKits)
      .catch((e) => { setKits([]); showToast(mensajeError(e, 'No se pudieron leer los kits en tránsito.'), 'error'); });
  }, [showToast]);
  useEffect(() => { cargar(); }, [cargar, version]);

  if (!kits?.length) return null;
  return (
    <div className="font-app text-tinta-principal mb-3 border border-gray-200 dark:border-gray-700 rounded text-secundario">
      <h3 className="px-2 py-1.5 text-etiqueta flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700"><Layers size={13} className="text-[#2383C2]" /> Kits en tránsito ({kits.length})</h3>
      <ul className="divide-y divide-gray-100 dark:divide-gray-700">
        {kits.map((k) => (
          <li key={k.id} className="px-2 py-1.5 flex flex-wrap items-center gap-2">
            <span className="text-etiqueta">{k.codigo}</span>
            <span>{referenciaDeKit(k)}</span>
            <span className="text-tinta-secundaria">{k.totalUnidades} u. · {k.despacho?.centroNombre} · salida N° {k.despacho?.salidaNumero} · {fechaHora(k.despacho?.fecha)} · {k.despacho?.usuario?.nombre}</span>
            <span className="ml-auto flex gap-1.5">
              {Object.entries(ACCIONES).filter(([a]) => hasPermission(...permisoDe(a))).map(([a, def]) => (
                <button key={a} type="button" onClick={() => setAccion({ accion: a, kit: k })} className={`h-7 px-2 rounded text-etiqueta ${a === 'RECIBIR' ? 'bg-[#2383C2] text-white' : 'border border-gray-300 dark:border-gray-600'}`}>{def.boton}</button>
              ))}
              {puedeRevisar && (
                <button type="button" onClick={() => setRevisando(k)} className="h-7 px-2 rounded text-etiqueta border border-[#2383C2] text-[#2383C2]">Revisar devolución</button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {accion && <AccionKitModal {...accion} onCerrar={() => setAccion(null)} onHecho={(m) => { setAccion(null); showToast(m, 'success'); cargar(); }} />}
      {revisando && <RevisarDevolucionKitModal kit={revisando} onCerrar={() => setRevisando(null)} onHecho={(m) => { setRevisando(null); showToast(m, 'success'); cargar(); }} />}
    </div>
  );
};

export default KitsEnTransito;
