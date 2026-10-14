import { useMemo, useState } from 'react';
import { X, PackagePlus } from 'lucide-react';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { planReposicionCaja } from '../../../../../functions/bodega/nucleo.mjs';
import { reponerCaja, mensajeError } from '../shared/bodegaApi';
import { formatoCantidad } from '../shared/catalogosBodega';
import DetalleReposicion from './DetalleReposicion';
import { productosDeCaja } from './cajas';

// "Reponer": productos con faltante vs. objetivo, disponible en la Bodega
// General y cantidad a reponer (por defecto el faltante, limitado a lo
// disponible). Puede ser parcial; lo no repuesto queda pendiente. Los lotes
// salen en orden FEFO, igual que las salidas. `pie` recibe la reposición
// guardada para agregar acciones (exportar).
const ReponerCajaModal = ({ caja, onCerrar, onHecho, pie }) => {
  const { datos: maestro } = useCatalogo('bodegaProductos');
  const disponibles = useMemo(() => Object.fromEntries(maestro.map((p) => [p.id, Number(p.disponible) || 0])), [maestro]);
  const conFaltante = useMemo(() => productosDeCaja(caja).filter((p) => p.faltante > 0), [caja]);
  const [cantidades, setCantidades] = useState(() => Object.fromEntries(conFaltante.map((p) => [p.productoId, String(Math.min(p.faltante, disponibles[p.productoId] ?? p.faltante))])));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);

  const confirmar = async () => {
    const { errores } = planReposicionCaja(caja.productos, cantidades, disponibles);
    if (errores.length) { setError(errores.join(' ')); return; }
    setGuardando(true);
    setError('');
    try {
      const r = await reponerCaja({ cajaId: caja.id, cantidades: Object.fromEntries(Object.entries(cantidades).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)])) });
      setResultado({ ...r, fecha: new Date() });
      onHecho();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Reponer caja">
      <div className="w-full max-w-3xl max-h-[92vh] flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 text-[12px]">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
          <h3 className="text-[13px] font-bold flex items-center gap-1.5"><PackagePlus size={15} /> {resultado ? 'Reposición registrada' : 'Reponer desde la Bodega General'} · {caja.nombre}</h3>
          <button type="button" onClick={onCerrar} disabled={guardando} aria-label="Cerrar" className="p-1 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"><X size={16} /></button>
        </div>
        <div className="p-4 overflow-auto">
          {resultado ? (
            <>
              <p className="mb-2 text-gray-600 dark:text-gray-300">Repuestas {formatoCantidad(resultado.totalRepuesto)} u.; quedan {formatoCantidad(resultado.totalPendiente)} u. pendientes.</p>
              <DetalleReposicion lineas={resultado.lineas} />
            </>
          ) : conFaltante.length === 0 ? (
            <p className="text-gray-500 italic">La caja está completa: no hay nada que reponer.</p>
          ) : (
            <table className="w-full text-left text-[12px] border border-gray-200 dark:border-gray-700">
              <thead className="bg-gray-100 dark:bg-gray-900 text-[10px] uppercase text-gray-600 dark:text-gray-400">
                <tr><th className="px-2 py-1.5">Producto</th><th className="px-2 py-1.5 text-right">Faltante</th><th className="px-2 py-1.5 text-right">Disponible bodega</th><th className="px-2 py-1.5 text-right w-32">A reponer</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {conFaltante.map((p) => {
                  const disp = disponibles[p.productoId] ?? 0;
                  return (
                    <tr key={p.productoId}>
                      <td className="px-2 py-1">{p.nombre} <span className="font-num text-[11px] text-gray-500">{p.codigoMaestro}</span></td>
                      <td className="px-2 py-1 text-right font-num font-bold text-red-600">{formatoCantidad(p.faltante)}</td>
                      <td className={`px-2 py-1 text-right font-num ${disp < p.faltante ? 'text-amber-600 font-bold' : ''}`}>{formatoCantidad(disp)}</td>
                      <td className="px-2 py-1 text-right">
                        <input
                          type="number" min="0" max={Math.min(p.faltante, disp)} step="1" inputMode="numeric"
                          value={cantidades[p.productoId] ?? ''}
                          onChange={(e) => setCantidades((c) => ({ ...c, [p.productoId]: e.target.value }))}
                          disabled={guardando} aria-label={`A reponer de ${p.nombre}`}
                          className="h-7 w-24 px-2 border border-gray-300 dark:border-gray-600 rounded text-right font-num bg-white dark:bg-gray-900 outline-none focus:border-[#2383C2]"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {!resultado && conFaltante.length > 0 && <p className="mt-2 text-[11px] text-gray-500">Se descuenta de la Bodega General por lote, el que vence primero (FEFO). Deja en 0 lo que no repongas ahora: queda como pendiente.</p>}
          {error && <p className="mt-2 text-red-600">{error}</p>}
        </div>
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex flex-wrap justify-end gap-2">
          {resultado ? (
            <>
              {pie?.(resultado)}
              <button type="button" onClick={onCerrar} className="h-9 px-3 rounded bg-gray-200 dark:bg-gray-700 font-semibold">Cerrar</button>
            </>
          ) : (
            <>
              <button type="button" onClick={onCerrar} disabled={guardando} className="h-9 px-3 rounded bg-gray-200 dark:bg-gray-700 font-semibold">Cancelar</button>
              <button type="button" onClick={confirmar} disabled={guardando || conFaltante.length === 0} className="h-9 px-4 rounded bg-[#2383C2] text-white font-bold disabled:opacity-50">{guardando ? 'Reponiendo…' : 'Confirmar reposición'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReponerCajaModal;
