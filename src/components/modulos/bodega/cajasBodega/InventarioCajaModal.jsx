import { useMemo, useState } from 'react';
import { X, ClipboardCheck } from 'lucide-react';
import { resultadoInventarioCaja } from '../../../../../functions/bodega/nucleo.mjs';
import { inventariarCaja, mensajeError } from '../shared/bodegaApi';
import { formatoCantidad } from '../shared/catalogosBodega';
import ResultadoInventario from './ResultadoInventario';
import { productosDeCaja } from './cajas';

// "Hacer inventario": cantidad contada de cada producto de la caja. Al
// confirmar, el stock actual pasa a ser lo contado y se muestra el
// resultado (consumo y faltante). `pie` recibe el inventario guardado
// para agregar acciones (reponer, exportar).
const InventarioCajaModal = ({ caja, onCerrar, onHecho, pie }) => {
  const productos = useMemo(() => productosDeCaja(caja), [caja]);
  const [conteos, setConteos] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);

  const confirmar = async () => {
    const { errores } = resultadoInventarioCaja(caja.productos, conteos);
    if (errores.length) { setError(errores[0] + (errores.length > 1 ? ` (y ${errores.length - 1} más)` : '')); return; }
    setGuardando(true);
    setError('');
    try {
      const r = await inventariarCaja({ cajaId: caja.id, conteos: Object.fromEntries(Object.entries(conteos).map(([k, v]) => [k, Number(v)])) });
      setResultado({ ...r, fecha: new Date() });
      onHecho();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Inventario de la caja">
      <div className="w-full max-w-3xl max-h-[92vh] flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 text-[12px]">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
          <h3 className="text-[13px] font-bold flex items-center gap-1.5"><ClipboardCheck size={15} /> {resultado ? 'Resultado del inventario' : 'Hacer inventario'} · {caja.nombre}</h3>
          <button type="button" onClick={onCerrar} disabled={guardando} aria-label="Cerrar" className="p-1 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"><X size={16} /></button>
        </div>
        <div className="p-4 overflow-auto">
          {resultado ? (
            <ResultadoInventario lineas={resultado.lineas} />
          ) : (
            <table className="w-full text-left text-[12px] border border-gray-200 dark:border-gray-700">
              <thead className="bg-gray-100 dark:bg-gray-900 text-[10px] uppercase text-gray-600 dark:text-gray-400">
                <tr><th className="px-2 py-1.5">Producto</th><th className="px-2 py-1.5 text-right">Objetivo</th><th className="px-2 py-1.5 text-right">Actual registrado</th><th className="px-2 py-1.5 text-right w-32">Contado</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {productos.map((p, i) => (
                  <tr key={p.productoId}>
                    <td className="px-2 py-1">{p.nombre} <span className="font-num text-[11px] text-gray-500">{p.codigoMaestro}</span></td>
                    <td className="px-2 py-1 text-right font-num">{formatoCantidad(p.stockObjetivo)}</td>
                    <td className="px-2 py-1 text-right font-num">{formatoCantidad(p.stockActual)}</td>
                    <td className="px-2 py-1 text-right">
                      <input
                        type="number" min="0" step="1" inputMode="numeric" autoFocus={i === 0}
                        value={conteos[p.productoId] ?? ''}
                        onChange={(e) => setConteos((c) => ({ ...c, [p.productoId]: e.target.value }))}
                        disabled={guardando} aria-label={`Contado de ${p.nombre}`}
                        className="h-7 w-24 px-2 border border-gray-300 dark:border-gray-600 rounded text-right font-num bg-white dark:bg-gray-900 outline-none focus:border-[#2383C2]"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
              <button type="button" onClick={confirmar} disabled={guardando} className="h-9 px-4 rounded bg-[#2383C2] text-white font-bold disabled:opacity-50">{guardando ? 'Guardando…' : 'Confirmar inventario'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default InventarioCajaModal;
