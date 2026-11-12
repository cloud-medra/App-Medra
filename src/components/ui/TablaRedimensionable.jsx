import { ThRedimensionable, ColgroupRedimensionable, ThRelleno, TdRelleno } from './ThRedimensionable';

// Tabla de solo lectura con columnas redimensionables por arrastre (sobre
// useColumnResize + ThRedimensionable). La usan las pestañas "Detalle" de
// Implantes, Hemodinamia y Consignación.
//
// `anchos`/`onResize` vienen de useColumnResize en el llamador, así varias
// tablas de una misma pantalla (un bloque por empresa/fecha en Implantes)
// comparten los mismos anchos.
//
// columnas: [{ key, label, ancho, min, align?, celda(fila, contexto),
//              titulo?(fila, contexto), clase?: string | (fila) => string }]
// Cada celda se corta con "..." según el ancho. El tooltip muestra el texto
// completo: `titulo` si la columna lo define, si no el contenido cuando es
// texto o número (las celdas con badges/JSX no llevan tooltip).
//
// pie (opcional): { etiqueta, columna, valor } → fila de total con la
// etiqueta ocupando las columnas anteriores a `columna`.
const ALINEACION = { center: 'text-center', right: 'text-right' };

export const TablaRedimensionable = ({
  columnas,
  filas,
  anchos,
  onResize,
  contexto,
  claveFila = (fila) => fila.id,
  claseFila,
  vacio = 'Sin registros',
  pie
}) => {
  const anchoTotal = columnas.reduce((suma, col) => suma + (anchos[col.key] ?? col.ancho), 0);
  const indicePie = pie ? columnas.findIndex(c => c.key === pie.columna) : -1;
  const restoPie = indicePie >= 0 ? columnas.length - indicePie - 1 : 0;

  return (
    <div className="overflow-auto">
      <table
        className="text-left text-pequeno border-collapse"
        style={{ tableLayout: 'fixed', width: anchoTotal, minWidth: '100%' }}
      >
        <ColgroupRedimensionable columnas={columnas} anchos={anchos} relleno />
        <thead className="bg-slate-50 dark:bg-gray-900/60">
          <tr className="text-pequeno text-tinta-secundaria uppercase">
            {columnas.map(col => (
              <ThRedimensionable
                key={col.key}
                col={col}
                anchos={anchos}
                onResize={onResize}
                title={col.label}
                className={`px-2.5 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 ${ALINEACION[col.align] || ''}`}
              >
                {col.label}
              </ThRedimensionable>
            ))}
            <ThRelleno className="border-b border-slate-200 dark:border-gray-700" />
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 ? (
            <tr>
              <td colSpan={columnas.length + 1} className="px-3 py-4 text-center text-tinta-atenuada">
                {vacio}
              </td>
            </tr>
          ) : (
            filas.map(fila => (
              <tr key={claveFila(fila)} className={claseFila ? claseFila(fila) : undefined}>
                {columnas.map(col => {
                  const contenido = col.celda(fila, contexto);
                  const titulo = col.titulo
                    ? col.titulo(fila, contexto)
                    : (typeof contenido === 'string' || typeof contenido === 'number' ? String(contenido) : undefined);
                  const clase = typeof col.clase === 'function' ? col.clase(fila) : (col.clase || '');
                  return (
                    <td
                      key={col.key}
                      title={titulo || undefined}
                      className={`px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 truncate ${ALINEACION[col.align] || ''} ${clase}`}
                    >
                      {contenido}
                    </td>
                  );
                })}
                <TdRelleno className="border-b border-slate-100 dark:border-gray-700/60" />
              </tr>
            ))
          )}
        </tbody>
        {pie && indicePie > 0 && filas.length > 0 && (
          <tfoot>
            <tr className="bg-slate-50 dark:bg-gray-900/60 text-etiqueta">
              <td colSpan={indicePie} className="px-2.5 py-1.5 border-t border-r border-slate-200 dark:border-gray-700 text-tinta-secundaria text-right truncate">
                {pie.etiqueta}
              </td>
              <td className="px-2.5 py-1.5 border-t border-r border-slate-200 dark:border-gray-700 text-emerald-700 dark:text-emerald-400 truncate" title={String(pie.valor)}>
                {pie.valor}
              </td>
              {restoPie > 0 && <td colSpan={restoPie} className="border-t border-r border-slate-200 dark:border-gray-700" />}
              <TdRelleno className="border-t border-slate-200 dark:border-gray-700" />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
};

export default TablaRedimensionable;
