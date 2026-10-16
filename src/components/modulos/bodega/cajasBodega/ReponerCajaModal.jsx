import { useMemo, useState } from 'react';
import { X, PackagePlus } from 'lucide-react';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { planReposicionCaja } from '../../../../../functions/bodega/nucleo.mjs';
import { reponerCaja, mensajeError } from '../shared/bodegaApi';
import { formatoCantidad } from '../shared/catalogosBodega';
import DetalleReposicion from './DetalleReposicion';
import { productosDeCaja } from './cajas';
import { BotonRestablecerAnchos } from '../../../ui/BotonRestablecerAnchos';
import { TablaBodega, FilaBodega } from '../shared/TablaBodega';
import { TD_BODEGA as TD, useAnchosTablaBodega } from '../shared/anchosTablaBodega';
import { useReferenciaDe } from '../shared/referencias';

// Mismo diseño que el Maestro (TablaBodega): columnas redimensionables.
const COLUMNAS = [
  { key: 'producto', label: 'Producto', ancho: 280, min: 120 },
  { key: 'referencia', label: 'Referencia', ancho: 120, min: 60 },
  { key: 'faltante', label: 'Faltante', alinear: 'text-right', ancho: 80, min: 55 },
  { key: 'disponible', label: 'Disponible bodega', alinear: 'text-right', ancho: 125, min: 70 },
  { key: 'reponer', label: 'A reponer', alinear: 'text-right', ancho: 110, min: 80 },
];

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
  const { anchos, handleResize, restablecerAnchos, personalizados } = useAnchosTablaBodega(COLUMNAS, 'bodega.modal.reponerCaja');
  const referenciaDe = useReferenciaDe();

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
            <div className="flex flex-col gap-1">
              <div className="flex justify-end"><BotonRestablecerAnchos onClick={restablecerAnchos} personalizados={personalizados} /></div>
              <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto">
                <TablaBodega columnas={COLUMNAS} anchos={anchos} onResize={handleResize}>
                  {conFaltante.map((p) => {
                    const disp = disponibles[p.productoId] ?? 0;
                    const referencia = referenciaDe(p.productoId);
                    const celdas = {
                      producto: <td className={`${TD} font-semibold text-gray-800 dark:text-gray-100`} title={p.nombre}>{p.nombre}</td>,
                      referencia: <td className={`${TD} font-num text-gray-700 dark:text-gray-200`} title={referencia ? `${referencia} · ${p.codigoMaestro}` : p.codigoMaestro}>{referencia || '—'}</td>,
                      faltante: <td className={`${TD} text-right font-num font-bold text-red-600`}>{formatoCantidad(p.faltante)}</td>,
                      disponible: <td className={`${TD} text-right font-num ${disp < p.faltante ? 'text-amber-600 font-bold' : ''}`}>{formatoCantidad(disp)}</td>,
                      reponer: (
                        <td className={`${TD} !py-0 text-right`}>
                          <input
                            type="number" min="0" max={Math.min(p.faltante, disp)} step="1" inputMode="numeric"
                            value={cantidades[p.productoId] ?? ''}
                            onChange={(e) => setCantidades((c) => ({ ...c, [p.productoId]: e.target.value }))}
                            disabled={guardando} aria-label={`A reponer de ${p.nombre}`}
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
