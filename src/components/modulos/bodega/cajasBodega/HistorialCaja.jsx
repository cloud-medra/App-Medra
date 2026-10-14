import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useToast } from '../../../../context/ToastContext';
import { leerHistorialCaja, mensajeError } from '../shared/bodegaApi';
import { formatoCantidad } from '../shared/catalogosBodega';
import { fechaHora } from '../shared/transito/transitos';
import ResultadoInventario from './ResultadoInventario';
import DetalleReposicion from './DetalleReposicion';

const VentanaDetalle = ({ titulo, onCerrar, children, pie }) => (
  <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label={titulo}>
    <div className="w-full max-w-3xl max-h-[92vh] flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 text-[12px]">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
        <h3 className="text-[13px] font-bold">{titulo}</h3>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="p-1 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"><X size={16} /></button>
      </div>
      <div className="p-4 overflow-auto">{children}</div>
      {pie && <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex flex-wrap justify-end gap-2">{pie}</div>}
    </div>
  </div>
);

const Lista = ({ titulo, items, vacio, texto, onAbrir }) => (
  <div className="flex-1 min-w-[240px]">
    <h4 className="text-[11px] font-bold uppercase text-gray-600 dark:text-gray-300 mb-1">{titulo}</h4>
    {items === null ? <p className="text-gray-400 italic">Cargando…</p> : items.length === 0 ? <p className="text-gray-400 italic">{vacio}</p> : (
      <ul className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded">
        {items.map((i) => (
          <li key={i.id}>
            <button type="button" onClick={() => onAbrir(i)} className="w-full text-left px-2 py-1.5 hover:bg-blue-50 dark:hover:bg-gray-700/40">
              <span className="font-num font-semibold">{fechaHora(i.fecha)}</span> · {i.usuario?.nombre || ''} <span className="text-gray-500">· {texto(i)}</span>
            </button>
          </li>
        ))}
      </ul>
    )}
  </div>
);

// Historial de la caja: últimos inventarios y reposiciones (se lee solo al
// abrirlo; el padre lo remonta con `key` para releerlo). `acciones…` agrega botones (exportar) al detalle de cada uno.
const HistorialCaja = ({ caja, accionesInventario, accionesReposicion }) => {
  const { showToast } = useToast();
  const [inventarios, setInventarios] = useState(null);
  const [reposiciones, setReposiciones] = useState(null);
  const [abierto, setAbierto] = useState(null);

  useEffect(() => {
    let vigente = true;
    Promise.all([leerHistorialCaja(caja.id, 'inventarios'), leerHistorialCaja(caja.id, 'reposiciones')])
      .then(([inv, rep]) => { if (vigente) { setInventarios(inv); setReposiciones(rep); } })
      .catch((e) => { if (vigente) { setInventarios([]); setReposiciones([]); showToast(mensajeError(e, 'No se pudo leer el historial.'), 'error'); } });
    return () => { vigente = false; };
  }, [caja.id, showToast]);

  return (
    <div className="flex flex-wrap gap-3">
      <Lista titulo="Inventarios" items={inventarios} vacio="Sin inventarios." onAbrir={(i) => setAbierto({ tipo: 'inventario', ...i })}
        texto={(i) => `${formatoCantidad(i.resumen?.faltante)} u. faltantes`} />
      <Lista titulo="Reposiciones" items={reposiciones} vacio="Sin reposiciones." onAbrir={(r) => setAbierto({ tipo: 'reposicion', ...r })}
        texto={(r) => `${formatoCantidad(r.totalRepuesto)} u. repuestas · ${formatoCantidad(r.totalPendiente)} pendientes`} />
      {abierto?.tipo === 'inventario' && (
        <VentanaDetalle titulo={`Inventario · ${caja.nombre} · ${fechaHora(abierto.fecha)} · ${abierto.usuario?.nombre || ''}`} onCerrar={() => setAbierto(null)} pie={accionesInventario?.(abierto)}>
          <ResultadoInventario lineas={abierto.lineas || []} />
        </VentanaDetalle>
      )}
      {abierto?.tipo === 'reposicion' && (
        <VentanaDetalle titulo={`Reposición · ${caja.nombre} · ${fechaHora(abierto.fecha)} · ${abierto.usuario?.nombre || ''}`} onCerrar={() => setAbierto(null)} pie={accionesReposicion?.(abierto)}>
          <DetalleReposicion lineas={abierto.lineas || []} />
        </VentanaDetalle>
      )}
    </div>
  );
};

export default HistorialCaja;
