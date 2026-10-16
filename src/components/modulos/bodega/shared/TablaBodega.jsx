import { Fragment } from 'react';
import { ThRedimensionable, ColgroupRedimensionable, ThRelleno, TdRelleno } from '../../../ui/ThRedimensionable';
import { TD_BODEGA, TH_BODEGA } from './anchosTablaBodega';

// Tabla de Bodega con el diseño de Gestiones (Implantes): filas de una
// línea, hover con barra lateral azul y columnas redimensionables por
// arrastre (anchos recordados por usuario en el navegador). La usan el
// Maestro / Kardex y los tránsitos (Tránsito y Tránsito por centro).
//
//   const { anchos, handleResize, restablecerAnchos, personalizados } = useAnchosTablaBodega(columnas, 'bodega.maestro'); // ./anchosTablaBodega
//   <TablaBodega columnas={columnas} anchos={anchos} onResize={handleResize}>
//     {filas.map((f) => <FilaBodega key={f.id} columnas={columnas} celdas={{ nombre: <td className={TD_BODEGA}>…</td> }} />)}
//   </TablaBodega>
//
// columnas: [{ key, label, ancho, min, alinear? }] (las visibles, ya
// filtradas por permisos con useColumnasPermitidas).

// encabezado(col): contenido del encabezado (por defecto el label; p. ej.
// un checkbox de "seleccionar todos").
export const TablaBodega = ({ columnas, anchos, onResize, encabezado = (col) => col.label, children }) => {
  const anchoTabla = columnas.reduce((n, c) => n + (anchos[c.key] ?? c.ancho), 0);
  return (
    <table className="text-left text-[11px] border-collapse" style={{ tableLayout: 'fixed', width: anchoTabla, minWidth: '100%' }}>
      <ColgroupRedimensionable columnas={columnas} anchos={anchos} relleno />
      <thead className="bg-gray-100 dark:bg-gray-900 sticky top-0 z-10 select-none">
        <tr className="text-gray-600 dark:text-gray-400 uppercase font-bold text-[10px]">
          {columnas.map((col) => (
            <ThRedimensionable key={col.key} col={col} anchos={anchos} onResize={onResize} title={col.label} className={`${TH_BODEGA} ${col.alinear || ''}`}>
              {encabezado(col)}
            </ThRedimensionable>
          ))}
          <ThRelleno className="border-b border-gray-200 dark:border-gray-700" />
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
};

// Fila con el hover de Gestiones (fondo + barra lateral). celdas: { [key]:
// <td> } y se pintan en el orden de `columnas` (una columna sin celda
// queda vacía). `className` suma estilos de la fila (selección, vencidos…).
export const FilaBodega = ({ columnas, celdas, className = '', ...rest }) => (
  <tr className={`group border-l-2 border-transparent hover:border-[#2383C2] hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors ${className}`} {...rest}>
    {columnas.map((col) => <Fragment key={col.key}>{celdas[col.key] ?? <td className={TD_BODEGA} />}</Fragment>)}
    <TdRelleno className="border-b border-gray-200 dark:border-gray-700/70" />
  </tr>
);

// Fila que ocupa todo el ancho (mensaje "sin datos", desglose expandido…).
export const FilaAnchoCompleto = ({ columnas, className = '', celdaClassName = 'px-2 py-6 text-center text-gray-400 italic', children }) => (
  <tr className={className}>
    <td colSpan={columnas.length + 1} className={celdaClassName}>{children}</td>
  </tr>
);
