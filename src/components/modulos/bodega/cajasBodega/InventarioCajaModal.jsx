import { useMemo, useState } from 'react';
import { X, ClipboardCheck } from 'lucide-react';
import { resultadoInventarioCaja } from '../../../../../functions/bodega/nucleo.mjs';
import { inventariarCaja, mensajeError } from '../shared/bodegaApi';
import { formatoCantidad } from '../shared/catalogosBodega';
import ResultadoInventario from './ResultadoInventario';
import { productosDeCaja } from './cajas';
import { BotonRestablecerAnchos } from '../../../ui/BotonRestablecerAnchos';
import { TablaBodega, FilaBodega } from '../shared/TablaBodega';
import { TD_BODEGA as TD, useAnchosTablaBodega } from '../shared/anchosTablaBodega';
import { useReferenciaDe } from '../shared/referencias';

// Mismo diseño que el Maestro (TablaBodega): columnas redimensionables.
const COLUMNAS = [
  { key: 'producto', label: 'Producto', ancho: 280, min: 120 },
  { key: 'referencia', label: 'Referencia', ancho: 120, min: 60 },
  { key: 'objetivo', label: 'Objetivo', alinear: 'text-right', ancho: 80, min: 55 },
  { key: 'actual', label: 'Actual registrado', alinear: 'text-right', ancho: 120, min: 70 },
  { key: 'contado', label: 'Contado', alinear: 'text-right', ancho: 110, min: 80 },
];

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
  const { anchos, handleResize, restablecerAnchos, personalizados } = useAnchosTablaBodega(COLUMNAS, 'bodega.modal.inventarioCaja');
  const referenciaDe = useReferenciaDe();

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
            <div className="flex flex-col gap-1">
              <div className="flex justify-end"><BotonRestablecerAnchos onClick={restablecerAnchos} personalizados={personalizados} /></div>
              <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto">
                <TablaBodega columnas={COLUMNAS} anchos={anchos} onResize={handleResize}>
                  {productos.map((p, i) => {
                    const referencia = referenciaDe(p.productoId);
                    const celdas = {
                      producto: <td className={`${TD} font-semibold text-gray-800 dark:text-gray-100`} title={p.nombre}>{p.nombre}</td>,
                      referencia: <td className={`${TD} font-num text-gray-700 dark:text-gray-200`} title={referencia ? `${referencia} · ${p.codigoMaestro}` : p.codigoMaestro}>{referencia || '—'}</td>,
                      objetivo: <td className={`${TD} text-right font-num`}>{formatoCantidad(p.stockObjetivo)}</td>,
                      actual: <td className={`${TD} text-right font-num`}>{formatoCantidad(p.stockActual)}</td>,
                      contado: (
                        <td className={`${TD} !py-0 text-right`}>
                          <input
                            type="number" min="0" step="1" inputMode="numeric" autoFocus={i === 0}
                            value={conteos[p.productoId] ?? ''}
                            onChange={(e) => setConteos((c) => ({ ...c, [p.productoId]: e.target.value }))}
                            disabled={guardando} aria-label={`Contado de ${p.nombre}`}
                            className="h-6 px-1.5 border border-gray-300 dark:border-gray-600 rounded text-right font-num bg-white dark:bg-gray-900 outline-none focus:border-[#2383C2] w-full max-w-24"
                          />
                        </td>
                      ),
                    };
                    return <FilaBodega key={p.productoId} columnas={COLUMNAS} celdas={celdas} />;
                  })}
                </TablaBodega>
              </div>
            </div>
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
