import { useEffect, useState } from 'react';
import { Package, RefreshCw, Plus } from 'lucide-react';
import { useToast } from '../../../../context/ToastContext';
import { useColumnasPermitidas } from '../../../../hooks/useColumnasPermitidas';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { leerCajas, leerCaja, mensajeError } from '../shared/bodegaApi';
import { formatoCantidad } from '../shared/catalogosBodega';
import { fechaHora } from '../shared/transito/transitos';
import DetalleCaja from './DetalleCaja';
import FormCajaModal from './FormCajaModal';
import { BarraCompletitud } from './comunes';

const PATH_VISTA = '/bodega/cajasBodega';

const COLUMNAS = [
  { key: 'nombre', label: 'Caja', fija: true },
  { key: 'productos', label: 'Productos', alinear: 'text-right' },
  { key: 'completitud', label: '% completitud' },
  { key: 'faltante', label: 'Unidades faltantes', alinear: 'text-right' },
  { key: 'ultimoInventario', label: 'Último inventario' },
];

// Cajas (kits): listado con cantidad de productos y % de completitud
// (stock actual vs. objetivo), y el detalle de cada caja. El listado lee
// solo los documentos de las cajas, nunca su historial.
const CajasBodega = () => {
  const { showToast } = useToast();
  const { hasPermission } = useGranularPermission();
  const { columnasVisibles, ver } = useColumnasPermitidas(PATH_VISTA, 'cajas', COLUMNAS);
  const [cajas, setCajas] = useState(null);
  const [abierta, setAbierta] = useState(null);
  const [creando, setCreando] = useState(false);
  const [version, setVersion] = useState(0);
  const [verInactivas, setVerInactivas] = useState(false);

  useEffect(() => {
    let vigente = true;
    leerCajas()
      .then((lista) => { if (vigente) setCajas(lista); })
      .catch((e) => { if (vigente) { setCajas([]); showToast(mensajeError(e, 'No se pudieron leer las cajas.'), 'error'); } });
    return () => { vigente = false; };
  }, [version, showToast]);
  const recargar = () => { setCajas(null); setVersion((v) => v + 1); };

  // Tras guardar, inventariar o reponer: relee solo la caja abierta (1 lectura).
  const refrescarAbierta = async (id = abierta?.id) => {
    try {
      const caja = await leerCaja(id);
      setAbierta(caja);
      if (caja) setCajas((lista) => (lista || []).map((c) => (c.id === caja.id ? caja : c)));
    } catch (e) {
      showToast(mensajeError(e), 'error');
    }
  };

  const visibles = (cajas || []).filter((c) => verInactivas || c.activa !== false);

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden text-[11px]">
      <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="text-[12px] font-bold text-gray-700 dark:text-gray-100 flex items-center gap-1.5 uppercase"><Package size={14} className="text-[#2383C2]" /> Cajas</h2>
        {!abierta && (
          <div className="flex items-center gap-1.5">
            <label className="flex items-center gap-1 text-gray-600 dark:text-gray-300"><input type="checkbox" checked={verInactivas} onChange={(e) => setVerInactivas(e.target.checked)} /> Ver inactivas</label>
            <button type="button" onClick={recargar} className="h-7 px-2 rounded border border-gray-300 dark:border-gray-600 font-semibold flex items-center gap-1 text-gray-600 dark:text-gray-300"><RefreshCw size={12} /> Actualizar</button>
            {hasPermission(PATH_VISTA, 'cajas', 'btn_guardar') && (
              <button type="button" onClick={() => setCreando(true)} className="h-7 px-2 rounded bg-[#2383C2] text-white font-bold flex items-center gap-1"><Plus size={12} /> Nueva caja</button>
            )}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-auto p-3">
        {abierta ? (
          <DetalleCaja caja={abierta} onVolver={() => setAbierta(null)} onCambio={() => refrescarAbierta()} />
        ) : cajas === null ? (
          <p className="text-gray-400 italic">Cargando…</p>
        ) : (
          <table className="w-full text-left text-[12px] border border-gray-200 dark:border-gray-700">
            <thead className="bg-gray-100 dark:bg-gray-900 text-[10px] uppercase text-gray-600 dark:text-gray-400">
              <tr>{columnasVisibles.map((c) => <th key={c.key} className={`px-2 py-1.5 ${c.alinear || ''}`}>{c.label}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {visibles.length === 0 && <tr><td colSpan={columnasVisibles.length} className="px-2 py-6 text-center text-gray-400 italic">No hay cajas.</td></tr>}
              {visibles.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer" onClick={() => setAbierta(c)}>
                  <td className="px-2 py-1.5 font-semibold text-[#2383C2] underline-offset-2 hover:underline">
                    {c.nombre} {c.activa === false && <span className="ml-1 px-1 rounded bg-gray-200 dark:bg-gray-700 text-[9px] font-bold text-gray-600">INACTIVA</span>}
                  </td>
                  {ver('productos') && <td className="px-2 py-1.5 text-right font-num">{c.cantidadProductos || 0}</td>}
                  {ver('completitud') && <td className="px-2 py-1.5"><BarraCompletitud valor={c.completitud} /></td>}
                  {ver('faltante') && <td className={`px-2 py-1.5 text-right font-num ${c.totalFaltante ? 'font-bold text-red-600 dark:text-red-400' : ''}`}>{formatoCantidad(c.totalFaltante)}</td>}
                  {ver('ultimoInventario') && <td className="px-2 py-1.5 font-num">{c.ultimoInventario?.fecha ? fechaHora(c.ultimoInventario.fecha) : '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {creando && <FormCajaModal onCerrar={() => setCreando(false)} onGuardada={(id) => { setCreando(false); recargar(); refrescarAbierta(id); }} />}
    </div>
  );
};

export default CajasBodega;
