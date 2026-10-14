import { formatoCantidad } from '../shared/catalogosBodega';

const Tabla = ({ titulo, ayuda, columnas, filas, vacio }) => (
  <div>
    <h4 className="text-[11px] font-bold uppercase text-gray-600 dark:text-gray-300">{titulo}</h4>
    <p className="text-[11px] text-gray-500 mb-1">{ayuda}</p>
    <table className="w-full text-left text-[12px] border border-gray-200 dark:border-gray-700">
      <thead className="bg-gray-100 dark:bg-gray-900 text-[10px] uppercase text-gray-600 dark:text-gray-400">
        <tr>{columnas.map((c) => <th key={c.titulo} className={`px-2 py-1.5 ${c.derecha ? 'text-right' : ''}`}>{c.titulo}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
        {filas.length === 0 && <tr><td colSpan={columnas.length} className="px-2 py-3 text-center text-gray-400 italic">{vacio}</td></tr>}
        {filas.map((l) => (
          <tr key={l.productoId}>
            {columnas.map((c) => <td key={c.titulo} className={`px-2 py-1 ${c.derecha ? 'text-right font-num' : ''} ${c.clase?.(l) || ''}`}>{c.valor(l)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const PRODUCTO = { titulo: 'Producto', valor: (l) => l.nombre };

// Los dos detalles de un inventario de caja: consumo vs. el stock actual
// registrado y faltante vs. el stock objetivo.
const ResultadoInventario = ({ lineas }) => (
  <div className="flex flex-col gap-3">
    <Tabla
      titulo="1. Consumo / diferencia vs. stock actual"
      ayuda="Actual registrado − contado: lo que se usó o se perdió desde la última vez (negativo = apareció de más)."
      columnas={[
        PRODUCTO,
        { titulo: 'Actual previo', derecha: true, valor: (l) => formatoCantidad(l.actualPrevio) },
        { titulo: 'Contado', derecha: true, valor: (l) => formatoCantidad(l.contado) },
        { titulo: 'Consumo', derecha: true, valor: (l) => formatoCantidad(l.consumo), clase: (l) => (l.consumo > 0 ? 'font-bold text-amber-600' : l.consumo < 0 ? 'text-emerald-600' : 'text-gray-400') },
      ]}
      filas={lineas}
      vacio="Sin productos."
    />
    <Tabla
      titulo="2. Faltante vs. stock objetivo"
      ayuda="Objetivo − contado: lo que hay que reponer para dejar la caja completa."
      columnas={[
        PRODUCTO,
        { titulo: 'Objetivo', derecha: true, valor: (l) => formatoCantidad(l.objetivo) },
        { titulo: 'Contado', derecha: true, valor: (l) => formatoCantidad(l.contado) },
        { titulo: 'Faltante', derecha: true, valor: (l) => formatoCantidad(l.faltante), clase: (l) => (l.faltante ? 'font-bold text-red-600' : 'text-gray-400') },
      ]}
      filas={lineas.filter((l) => l.faltante > 0)}
      vacio="La caja quedó completa: no falta nada."
    />
  </div>
);

export default ResultadoInventario;
