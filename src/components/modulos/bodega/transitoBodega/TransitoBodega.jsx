import { useEffect, useMemo, useState } from 'react';
import { Truck, RefreshCw } from 'lucide-react';
import { useToast } from '../../../../context/ToastContext';
import { aplicarResultadoTransitos } from '../shared/listasLocales';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import BuscadorConLimpiar from '../../../ui/BuscadorConLimpiar';
import { leerTransitosAbiertos, mensajeError } from '../shared/bodegaApi';
import { formatoCantidad } from '../shared/catalogosBodega';
import TablaTransitos from '../shared/transito/TablaTransitos';
import { filtrarTransitos } from '../shared/transito/transitos';

const PATH_VISTA = '/bodega/transitoBodega';

// Todo lo que está en tránsito (en todos los centros), del más antiguo al
// más nuevo, con filtro por centro y buscador. Acciones: entregar, devolver
// o anotar, de a uno o seleccionando varios.
const TransitoBodega = () => {
  const { showToast } = useToast();
  const [transitos, setTransitos] = useState(null);
  const [version, setVersion] = useState(0);
  const [centroId, setCentroId] = useState('');
  const [texto, setTexto] = useState('');

  useEffect(() => {
    let vigente = true;
    leerTransitosAbiertos({ centroId: centroId || null })
      .then((t) => { if (vigente) setTransitos(t); })
      .catch((e) => { if (vigente) { setTransitos([]); showToast(mensajeError(e, 'No se pudo leer el tránsito.'), 'error'); } });
    return () => { vigente = false; };
  }, [centroId, version, showToast]);
  const recargar = () => { setTransitos(null); setVersion((v) => v + 1); };
  // Tras entregar / devolver / anotar se aplica lo que devolvió la función
  // (sin releer la lista); "Actualizar" trae los cambios de otros.
  const alCambiar = (r) => (r?.transitos ? setTransitos((t) => aplicarResultadoTransitos(t || [], r.transitos)) : recargar());

  // Filtro: todos los centros del maestro (también inactivos: pueden tener
  // tránsito de antes).
  const { datos: centros } = useCatalogo('centros');
  const opcionesCentro = useMemo(() => centros.filter((c) => c.nombre).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [centros]);
  const filtrados = useMemo(() => filtrarTransitos(transitos || [], texto), [transitos, texto]);
  const unidades = filtrados.reduce((n, t) => n + (t.pendiente || 0), 0);

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden text-[11px]">
      <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="text-[12px] font-bold text-gray-700 dark:text-gray-100 flex items-center gap-1.5 uppercase"><Truck size={14} className="text-[#2383C2]" /> Tránsito</h2>
        <span className="text-[10px] font-bold text-gray-500 bg-gray-100 dark:bg-gray-700/60 px-2 py-0.5 rounded">{filtrados.length} registro(s) · {formatoCantidad(unidades)} u.</span>
      </div>
      <div className="px-3 py-1.5 flex flex-wrap items-center gap-2 border-b border-gray-200 dark:border-gray-700">
        <BuscadorConLimpiar value={texto} onChange={setTexto} className="w-72" placeholder="Buscar producto, lote, solicitante, N° salida…" />
        <select value={centroId} onChange={(e) => { setCentroId(e.target.value); setTransitos(null); }} className="h-7 px-1.5 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-900" aria-label="Centro">
          <option value="">Todos los centros</option>
          {opcionesCentro.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.estado === 'INACTIVO' ? ' (inactivo)' : ''}</option>)}
        </select>
        <button type="button" onClick={recargar} className="h-7 px-2 rounded border border-gray-300 dark:border-gray-600 font-semibold flex items-center gap-1 text-gray-600 dark:text-gray-300"><RefreshCw size={12} /> Actualizar</button>
      </div>
      <div className="flex-1 overflow-auto p-3">
        {transitos === null
          ? <p className="text-gray-400 italic">Cargando…</p>
          : <TablaTransitos transitos={filtrados} rutaVista={PATH_VISTA} origen="transito" onCambio={alCambiar} />}
      </div>
    </div>
  );
};

export default TransitoBodega;
