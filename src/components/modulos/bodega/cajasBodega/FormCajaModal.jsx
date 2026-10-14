import { useMemo, useState } from 'react';
import { X, Trash2, Package } from 'lucide-react';
import { validarCaja, MAX_NOMBRE_CAJA, MAX_DESCRIPCION_CAJA } from '../../../../../functions/bodega/nucleo.mjs';
import { guardarCaja, mensajeError } from '../shared/bodegaApi';
import BuscadorProducto from '../shared/BuscadorProducto';

const INPUT = 'h-9 px-2 border border-gray-300 dark:border-gray-600 rounded text-[12px] outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:border-[#2383C2] disabled:opacity-60';

// Crear o editar una caja: nombre (único), descripción, activa y sus
// productos (del maestro de Bodega) con su stock objetivo. El stock actual
// se muestra pero no se edita (solo cambia por inventario o reposición).
const FormCajaModal = ({ caja = null, onCerrar, onGuardada }) => {
  const [nombre, setNombre] = useState(caja?.nombre || '');
  const [descripcion, setDescripcion] = useState(caja?.descripcion || '');
  const [activa, setActiva] = useState(caja?.activa !== false);
  const [productos, setProductos] = useState(() => Object.entries(caja?.productos || {})
    .map(([productoId, p]) => ({ productoId, nombre: p.nombre, codigoMaestro: p.codigoMaestro, stockObjetivo: String(p.stockObjetivo), stockActual: p.stockActual || 0 }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const enCaja = useMemo(() => new Set(productos.map((p) => p.productoId)), [productos]);

  const agregar = (p) => setProductos((lista) => [...lista, { productoId: p.id, nombre: p.nombre, codigoMaestro: p.codigoMaestro, stockObjetivo: '1', stockActual: 0 }]);
  const cambiarObjetivo = (productoId, valor) => setProductos((lista) => lista.map((p) => (p.productoId === productoId ? { ...p, stockObjetivo: valor } : p)));
  const quitar = (productoId) => setProductos((lista) => lista.filter((p) => p.productoId !== productoId));

  const guardar = async () => {
    const datos = { id: caja?.id, nombre, descripcion, activa, productos: productos.map((p) => ({ productoId: p.productoId, stockObjetivo: Number(p.stockObjetivo) })) };
    const { errores } = validarCaja(datos);
    if (errores.length) { setError(errores.join(' ')); return; }
    setGuardando(true);
    setError('');
    try {
      const r = await guardarCaja(datos);
      onGuardada(r.id);
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label={caja ? 'Editar caja' : 'Nueva caja'}>
      <div className="w-full max-w-3xl max-h-[92vh] flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 text-[12px]">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
          <h3 className="text-[13px] font-bold flex items-center gap-1.5"><Package size={15} /> {caja ? `Editar caja · ${caja.nombre}` : 'Nueva caja'}</h3>
          <button type="button" onClick={onCerrar} disabled={guardando} aria-label="Cerrar" className="p-1 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"><X size={16} /></button>
        </div>
        <div className="p-4 flex flex-col gap-3 overflow-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="flex flex-col sm:col-span-2">
              <span className="text-[10px] font-bold uppercase text-gray-500">Nombre *</span>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={MAX_NOMBRE_CAJA} disabled={guardando} className={INPUT} placeholder="Ej. Caja de tutores" />
            </label>
            <label className="flex items-center gap-1.5 sm:mt-4">
              <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} disabled={guardando} /> Activa
            </label>
            <label className="flex flex-col sm:col-span-3">
              <span className="text-[10px] font-bold uppercase text-gray-500">Descripción (opcional)</span>
              <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={MAX_DESCRIPCION_CAJA} disabled={guardando} className={INPUT} />
            </label>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-gray-500">Agregar producto del maestro</span>
            <BuscadorProducto onElegir={agregar} deshabilitado={guardando} filtro={(p) => !enCaja.has(p.id)} />
          </div>
          <table className="w-full text-left text-[12px] border border-gray-200 dark:border-gray-700">
            <thead className="bg-gray-100 dark:bg-gray-900 text-[10px] uppercase text-gray-600 dark:text-gray-400">
              <tr>
                <th className="px-2 py-1.5">Producto</th>
                <th className="px-2 py-1.5 w-32 text-right">Stock objetivo</th>
                <th className="px-2 py-1.5 w-24 text-right">Stock actual</th>
                <th className="px-2 py-1.5 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {productos.length === 0 && <tr><td colSpan={4} className="px-2 py-4 text-center text-gray-400 italic">Agrega los productos que lleva la caja.</td></tr>}
              {productos.map((p) => (
                <tr key={p.productoId}>
                  <td className="px-2 py-1">{p.nombre} <span className="font-num text-[11px] text-gray-500">{p.codigoMaestro}</span></td>
                  <td className="px-2 py-1 text-right">
                    <input type="number" min="0" step="1" inputMode="numeric" value={p.stockObjetivo} onChange={(e) => cambiarObjetivo(p.productoId, e.target.value)} disabled={guardando} aria-label={`Stock objetivo de ${p.nombre}`} className={`${INPUT} h-7 w-24 text-right font-num`} />
                  </td>
                  <td className="px-2 py-1 text-right font-num text-gray-500" title="Solo cambia por inventario o reposición">{p.stockActual}</td>
                  <td className="px-2 py-1 text-center">
                    <button type="button" onClick={() => quitar(p.productoId)} disabled={guardando} title="Quitar de la caja" className="p-1 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {error && <p className="text-red-600">{error}</p>}
        </div>
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} disabled={guardando} className="h-9 px-3 rounded bg-gray-200 dark:bg-gray-700 font-semibold">Cancelar</button>
          <button type="button" onClick={guardar} disabled={guardando} className="h-9 px-4 rounded bg-[#2383C2] text-white font-bold disabled:opacity-50">{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  );
};

export default FormCajaModal;
