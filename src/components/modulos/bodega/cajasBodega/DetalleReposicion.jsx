import { formatoCantidad } from '../shared/catalogosBodega';
import { textoLotes } from './cajas';

// Detalle de una reposición: lo repuesto (con los lotes que salieron de la
// Bodega General) y lo que quedó pendiente.
const DetalleReposicion = ({ lineas }) => (
  <table className="w-full text-left text-[12px] border border-gray-200 dark:border-gray-700">
    <thead className="bg-gray-100 dark:bg-gray-900 text-[10px] uppercase text-gray-600 dark:text-gray-400">
      <tr>
        <th className="px-2 py-1.5">Producto</th>
        <th className="px-2 py-1.5 text-right">Faltante antes</th>
        <th className="px-2 py-1.5 text-right">Repuesto</th>
        <th className="px-2 py-1.5 text-right">Pendiente</th>
        <th className="px-2 py-1.5">Lotes</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
      {lineas.map((l) => (
        <tr key={l.productoId}>
          <td className="px-2 py-1">{l.nombre}</td>
          <td className="px-2 py-1 text-right font-num">{formatoCantidad(l.faltanteAntes)}</td>
          <td className={`px-2 py-1 text-right font-num ${l.cantidad ? 'font-bold text-emerald-600' : 'text-gray-400'}`}>{formatoCantidad(l.cantidad)}</td>
          <td className={`px-2 py-1 text-right font-num ${l.pendiente ? 'font-bold text-red-600' : 'text-gray-400'}`}>{l.pendiente ? formatoCantidad(l.pendiente) : '—'}</td>
          <td className="px-2 py-1 font-num text-[11px] text-gray-500">{textoLotes(l.lotes)}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

export default DetalleReposicion;
