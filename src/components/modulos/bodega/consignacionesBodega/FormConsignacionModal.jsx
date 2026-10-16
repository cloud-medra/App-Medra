import { useMemo, useState } from 'react';
import { X, Trash2, Handshake, PackagePlus } from 'lucide-react';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { validarConsignacion, MAX_LINEAS_CONSIGNACION, MAX_OBSERVACION, stockTotal } from '../../../../../functions/bodega/nucleo.mjs';
import { guardarConsignacion, mensajeError } from '../shared/bodegaApi';
import BuscadorProducto from '../shared/BuscadorProducto';
import { formatoCantidad } from '../shared/catalogosBodega';
import { BotonRestablecerAnchos } from '../../../ui/BotonRestablecerAnchos';
import { TablaBodega, FilaBodega, FilaAnchoCompleto } from '../shared/TablaBodega';
import { TD_BODEGA as TD, useAnchosTablaBodega } from '../shared/anchosTablaBodega';
import { useReferenciaDe } from '../shared/referencias';

const INPUT = 'h-7 px-1.5 border border-gray-300 dark:border-gray-600 rounded text-[12px] outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:border-[#2383C2] disabled:opacity-50';

// Mismo diseño que el Maestro (TablaBodega): columnas redimensionables.
const COLUMNAS = [
  { key: 'producto', label: 'Producto', ancho: 260, min: 110 },
  { key: 'referencia', label: 'Referencia', ancho: 120, min: 60 },
  { key: 'lote', label: 'Lote', ancho: 130, min: 70 },
  { key: 'vencimiento', label: 'Vencimiento', ancho: 135, min: 110 },
  { key: 'cantidad', label: 'Cantidad consignada', alinear: 'text-right', ancho: 130, min: 80 },
  { key: 'quitar', label: '', ancho: 36, min: 32 },
];

let siguienteKey = 0;
const nuevaKey = () => { siguienteKey += 1; return `c${siguienteKey}`; };

// Registrar o editar lo que una empresa dejó en consignación: productos con
// lote, vencimiento (si el producto los maneja) y cantidad consignada (lo
// que debo tener). No mueve stock: el stock entra por Ingreso en
// consignación o Carga inicial con dueño. "Agregar lotes en stock" suma
// como líneas los lotes de la empresa que aún no están registrados.
const FormConsignacionModal = ({ empresa, consignacion, lotesEmpresa = [], onCerrar, onGuardada }) => {
  const { datos: productos } = useCatalogo('bodegaProductos');
  const porId = useMemo(() => Object.fromEntries(productos.map((p) => [p.id, p])), [productos]);
  const [observacion, setObservacion] = useState(consignacion?.observacion || '');
  const [lineas, setLineas] = useState(() => (consignacion?.lineas || []).map((l) => ({
    key: nuevaKey(), productoId: l.productoId, productoNombre: l.productoNombre, codigoMaestro: l.codigoMaestro,
    lote: l.lote || '', vencimiento: l.vencimiento || '', cantidadConsignada: String(l.cantidadConsignada),
  })));
  const [guardando, setGuardando] = useState(false);
  const [errores, setErrores] = useState([]);
  const { anchos, handleResize, restablecerAnchos, personalizados } = useAnchosTablaBodega(COLUMNAS, 'bodega.modal.consignacion');
  const referenciaDe = useReferenciaDe();

  const registrados = new Set((consignacion?.lineas || []).map((l) => l.loteId));
  const sinRegistrar = lotesEmpresa.filter((l) => stockTotal(l) > 0 && !registrados.has(l.id)
    && !lineas.some((x) => x.productoId === l.productoId && (x.lote || '') === (l.lote || '') && (x.vencimiento || '') === (l.vencimiento || '')));

  const agregarProducto = (p) => setLineas((ls) => [...ls, {
    key: nuevaKey(), productoId: p.id, productoNombre: p.nombre, codigoMaestro: p.codigoMaestro, lote: '', vencimiento: '', cantidadConsignada: '1',
  }]);
  const agregarLotesEnStock = () => setLineas((ls) => [...ls, ...sinRegistrar.map((l) => ({
    key: nuevaKey(), productoId: l.productoId, productoNombre: porId[l.productoId]?.nombre || '', codigoMaestro: porId[l.productoId]?.codigoMaestro || '',
    lote: l.lote || '', vencimiento: l.vencimiento || '', cantidadConsignada: String(stockTotal(l)),
  }))]);
  const cambiar = (key, campo, valor) => setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, [campo]: valor } : l)));
  const quitar = (key) => setLineas((ls) => ls.filter((l) => l.key !== key));

  const guardar = async () => {
    const datos = {
      empresaId: empresa.id, observacion,
      lineas: lineas.map(({ productoId, lote, vencimiento, cantidadConsignada }) => ({ productoId, lote, vencimiento, cantidadConsignada: cantidadConsignada === '' ? NaN : Number(cantidadConsignada) })),
    };
    const { errores: lista } = validarConsignacion(datos, porId);
    setErrores(lista);
    if (lista.length) return;
    setGuardando(true);
    try {
      onGuardada(await guardarConsignacion(datos));
    } catch (e) {
      setErrores([mensajeError(e)]);
    } finally {
      setGuardando(false);
    }
  };

  const total = lineas.reduce((n, l) => n + (Number(l.cantidadConsignada) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Consignación">
      <div className="w-full max-w-4xl max-h-[92vh] flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 text-[12px]">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
          <div>
            <h3 className="text-[13px] font-bold flex items-center gap-1.5"><Handshake size={15} /> {consignacion ? 'Editar' : 'Registrar'} consignación · {empresa.nombre}</h3>
            <p className="text-[11px] text-gray-500">Lo que la empresa dejó y debo tener. No mueve stock: el stock consignado entra por Ingreso (marcado &quot;En consignación&quot;) o por Carga inicial con esta empresa como dueña.</p>
          </div>
          <button type="button" onClick={onCerrar} disabled={guardando} aria-label="Cerrar" className="p-1 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"><X size={16} /></button>
        </div>

        <div className="p-4 flex flex-col gap-3 overflow-auto">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
            <div>
              <span className="text-[10px] font-bold uppercase text-gray-500">Agregar producto del maestro</span>
              <BuscadorProducto onElegir={agregarProducto} deshabilitado={guardando} />
            </div>
            {sinRegistrar.length > 0 && (
              <button type="button" onClick={agregarLotesEnStock} disabled={guardando} title="Agrega los lotes de esta empresa que tienen stock y aún no están registrados, con su stock actual como cantidad consignada"
                className="h-9 px-3 rounded border border-violet-600 text-violet-700 dark:text-violet-300 font-semibold flex items-center gap-1.5">
                <PackagePlus size={14} /> Agregar {sinRegistrar.length} lote(s) en stock sin registrar
              </button>
            )}
          </div>

          <div className="flex justify-end -mb-2"><BotonRestablecerAnchos onClick={restablecerAnchos} personalizados={personalizados} /></div>
          <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto">
            <TablaBodega columnas={COLUMNAS} anchos={anchos} onResize={handleResize}>
              {lineas.length === 0 && <FilaAnchoCompleto columnas={COLUMNAS} celdaClassName="px-2 py-4 text-center text-gray-400 italic">Agrega los productos que dejó la empresa.</FilaAnchoCompleto>}
              {lineas.map((l) => {
                const p = porId[l.productoId];
                const nombre = l.productoNombre || p?.nombre;
                const referencia = referenciaDe(l.productoId);
                const codigo = l.codigoMaestro || p?.codigoMaestro;
                const celdas = {
                  producto: <td className={`${TD} font-semibold text-gray-800 dark:text-gray-100`} title={nombre}>{nombre}</td>,
                  referencia: <td className={`${TD} font-num text-gray-700 dark:text-gray-200`} title={referencia ? `${referencia} · ${codigo}` : codigo}>{referencia || '—'}</td>,
                  lote: (
                    <td className={`${TD} !py-0`}>
                      {p?.manejaLote === false
                        ? <span className="text-gray-400">No maneja lote</span>
                        : <input value={l.lote} onChange={(e) => cambiar(l.key, 'lote', e.target.value.toUpperCase())} maxLength={40} disabled={guardando} aria-label="Lote" className={`${INPUT} !h-6 w-full font-num uppercase`} />}
                    </td>
                  ),
                  vencimiento: (
                    <td className={`${TD} !py-0`}>
                      {p?.manejaVencimiento === false
                        ? <span className="text-gray-400">No maneja venc.</span>
                        : <input type="date" value={l.vencimiento} onChange={(e) => cambiar(l.key, 'vencimiento', e.target.value)} disabled={guardando} aria-label="Vencimiento" className={`${INPUT} !h-6 w-full font-num`} />}
                    </td>
                  ),
                  cantidad: (
                    <td className={`${TD} !py-0 text-right`}>
                      <input type="number" min="0" step="1" inputMode="numeric" value={l.cantidadConsignada} onChange={(e) => cambiar(l.key, 'cantidadConsignada', e.target.value)} disabled={guardando} aria-label="Cantidad consignada" className={`${INPUT} !h-6 w-full max-w-24 text-right font-num`} />
                    </td>
                  ),
                  quitar: (
                    <td className={`${TD} !py-0 text-center`}>
                      <button type="button" onClick={() => quitar(l.key)} disabled={guardando} title="Quitar línea" className="p-0.5 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"><Trash2 size={13} /></button>
                    </td>
                  ),
                };
                return <FilaBodega key={l.key} columnas={COLUMNAS} celdas={celdas} />;
              })}
            </TablaBodega>
          </div>
          <p className="text-[11px] text-gray-500">{lineas.length} línea(s) · {formatoCantidad(total)} u. consignadas · máx. {MAX_LINEAS_CONSIGNACION} líneas.</p>

          <label className="flex flex-col">
            <span className="text-[10px] font-bold uppercase text-gray-500">Observación (opcional)</span>
            <input value={observacion} onChange={(e) => setObservacion(e.target.value)} maxLength={MAX_OBSERVACION} disabled={guardando} className={`${INPUT} h-9`} placeholder="Ej. Contrato de consignación 2026" />
          </label>
          {errores.length > 0 && <ul className="text-red-600 dark:text-red-400 list-disc pl-5">{errores.map((e) => <li key={e}>{e}</li>)}</ul>}
        </div>

        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} disabled={guardando} className="h-9 px-3 rounded bg-gray-200 dark:bg-gray-700 font-semibold">Cancelar</button>
          <button type="button" onClick={guardar} disabled={guardando} className="h-9 px-4 rounded bg-[#2383C2] text-white font-bold disabled:opacity-50">{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  );
};

export default FormConsignacionModal;
