import PaginacionSimple from '../../../../ui/PaginacionSimple';
import { useColumnasPermitidas } from '../../../../../hooks/useColumnasPermitidas';
import Variacion from './Variacion';
import PrecioUnitario from './PrecioUnitario';
import { formatoNumero, formatoMonto, colorDiferencia } from './formato';
import { Encabezado, BarraBusqueda, ContenedorTabla, ZonaScroll, CLASE_TABLA } from './TablaComun';
import { usePaginacion } from './usePaginacion';

const PATH_VISTA = '/administracion/estadisticas'; // = RUTA_VISTA_ESTADISTICAS

// Columnas de la pestaña Códigos (sección 'tabla_codigos' del mapa de
// permisos). El código no se puede ocultar; precio y montos además exigen
// "Ver montos".
const COLUMNAS_CODIGOS = [
  { key: 'codigo', label: 'Código', fija: true },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'cantidad', label: 'Cantidad usada' },
  { key: 'cantidadAnterior', label: 'Cantidad período anterior' },
  { key: 'diferencia', label: 'Diferencia de cantidad' },
  { key: 'variacion', label: 'Variación % de cantidad' },
  { key: 'admisiones', label: 'Admisiones' },
  { key: 'precio', label: 'Precio unitario' },
  { key: 'monto', label: 'Monto del período' },
  { key: 'montoAnterior', label: 'Monto período anterior' },
  { key: 'montoVariacion', label: 'Variación % de monto' }
];

const COLUMNAS_MONTO = ['precio', 'monto', 'montoAnterior', 'montoVariacion'];
// Columnas que se ocultan en el modo "Solo un mes".
const COLUMNAS_COMPARATIVAS = ['cantidadAnterior', 'diferencia', 'variacion', 'montoAnterior', 'montoVariacion'];

// Códigos usados en el período: cantidad (los más usados primero por
// defecto), admisiones, precio unitario promedio y monto, con su comparación.
const TablaCodigos = ({ filas, total, conMontos, comparar = true, etiquetaActual, etiquetaAnterior, busqueda, onBuscar, orden, onOrdenar, seleccionada, onSeleccionar }) => {
  const { ver: verColumna } = useColumnasPermitidas(PATH_VISTA, 'tabla_codigos', COLUMNAS_CODIGOS);
  const ver = (key) => verColumna(key) && (conMontos || !COLUMNAS_MONTO.includes(key)) && (comparar || !COLUMNAS_COMPARATIVAS.includes(key));
  const { filasPagina, props: paginacion, mostrar: mostrarPaginacion } = usePaginacion(filas);
  const celda = 'px-3 py-1 border-b border-r last:border-r-0 border-gray-100 dark:border-gray-700/60 text-right tabular-nums whitespace-nowrap';
  const pie = 'px-3 py-1.5 border-t border-r last:border-r-0 border-gray-200 dark:border-gray-700 text-right tabular-nums whitespace-nowrap';
  const columnasVisibles = COLUMNAS_CODIGOS.filter((c) => c.key === 'codigo' || ver(c.key)).length;
  return (
    <ContenedorTabla>
      <BarraBusqueda busqueda={busqueda} onBuscar={onBuscar} placeholder="Buscar código o descripción…" total={filas.length} />
      <ZonaScroll>
        <table className={CLASE_TABLA}>
          <thead className="bg-gray-50 dark:bg-gray-900 text-pequeno text-tinta-secundaria">
            <tr>
              <Encabezado columna="codigo" orden={orden} onOrdenar={onOrdenar} alinear="left">Código</Encabezado>
              {ver('descripcion') && <Encabezado columna="descripcion" orden={orden} onOrdenar={onOrdenar} alinear="left">Descripción</Encabezado>}
              {ver('cantidad') && <Encabezado columna="actual" orden={orden} onOrdenar={onOrdenar} title="Cantidad usada">{etiquetaActual}</Encabezado>}
              {ver('cantidadAnterior') && <Encabezado columna="anterior" orden={orden} onOrdenar={onOrdenar} title="Cantidad usada">{etiquetaAnterior}</Encabezado>}
              {ver('diferencia') && <Encabezado columna="diferencia" orden={orden} onOrdenar={onOrdenar}>Diferencia</Encabezado>}
              {ver('variacion') && <Encabezado columna="variacion" orden={orden} onOrdenar={onOrdenar}>Variación</Encabezado>}
              {ver('admisiones') && <Encabezado columna="admisiones" orden={orden} onOrdenar={onOrdenar}>Admisiones</Encabezado>}
              {ver('precio') && <Encabezado columna="precio" orden={orden} onOrdenar={onOrdenar} title="Precio unitario sin IVA (promedio si varió)">Precio unit.</Encabezado>}
              {ver('monto') && <Encabezado columna="monto" orden={orden} onOrdenar={onOrdenar} title="Cantidad × precio unitario, sin IVA">Monto</Encabezado>}
              {ver('montoAnterior') && <Encabezado columna="montoAnterior" orden={orden} onOrdenar={onOrdenar}>Monto anterior</Encabezado>}
              {ver('montoVariacion') && <Encabezado columna="montoVariacion" orden={orden} onOrdenar={onOrdenar}>Var. monto</Encabezado>}
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr><td colSpan={columnasVisibles} className="py-10 text-center text-tinta-atenuada">{busqueda ? 'Ningún código coincide con la búsqueda.' : 'Sin códigos en este período.'}</td></tr>
            )}
            {filasPagina.map((f) => (
              <tr key={f.clave} onClick={() => onSeleccionar(f)} aria-selected={seleccionada === f.clave}
                className={`cursor-pointer ${seleccionada === f.clave ? 'bg-[#2383C2]/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}>
                <td className="px-3 py-1 border-b border-r last:border-r-0 border-gray-100 dark:border-gray-700/60 text-left whitespace-nowrap">
                  <button type="button" onClick={(e) => { e.stopPropagation(); onSeleccionar(f); }}
                    className={`text-left text-etiqueta hover:text-[#2383C2] focus:outline-none focus-visible:underline ${f.sinCodigo ? 'text-amber-700 dark:text-amber-400 italic' : 'text-tinta-principal'}`}>{f.codigo}</button>
                </td>
                {ver('descripcion') && <td className="px-3 py-1 border-b border-r last:border-r-0 border-gray-100 dark:border-gray-700/60 text-left text-tinta-principal max-w-[300px] truncate" title={f.descripcion}>{f.descripcion || '—'}</td>}
                {ver('cantidad') && <td className={`${celda} text-etiqueta text-tinta-principal`}>{formatoNumero(f.actual)}</td>}
                {ver('cantidadAnterior') && <td className={`${celda} text-tinta-secundaria`}>{formatoNumero(f.anterior)}</td>}
                {ver('diferencia') && <td className={`${celda} ${colorDiferencia(f.diferencia)}`}>{f.diferencia > 0 ? '+' : ''}{formatoNumero(f.diferencia)}</td>}
                {ver('variacion') && <td className={celda}><Variacion diferencia={f.diferencia} variacion={f.variacion} compacto /></td>}
                {ver('admisiones') && <td className={`${celda} text-tinta-secundaria`}>{formatoNumero(f.admisiones)}</td>}
                {ver('precio') && <td className={`${celda} text-tinta-principal`}><PrecioUnitario fila={f} /></td>}
                {ver('monto') && <td className={`${celda} text-etiqueta text-tinta-principal`}>{formatoMonto(f.monto)}</td>}
                {ver('montoAnterior') && <td className={`${celda} text-tinta-secundaria`}>{formatoMonto(f.montoAnterior)}</td>}
                {ver('montoVariacion') && <td className={celda}><Variacion diferencia={f.montoDiferencia} variacion={f.montoVariacion} compacto /></td>}
              </tr>
            ))}
          </tbody>
          {total && (
            <tfoot className="bg-gray-50 dark:bg-gray-900 text-etiqueta text-tinta-principal">
              <tr>
                <td className="px-3 py-1.5 border-t border-r last:border-r-0 border-gray-200 dark:border-gray-700">Total</td>
                {ver('descripcion') && <td className="border-t border-r last:border-r-0 border-gray-200 dark:border-gray-700" />}
                {ver('cantidad') && <td className={pie}>{formatoNumero(total.cantidad)}</td>}
                {ver('cantidadAnterior') && <td className={`${pie} text-tinta-secundaria`}>{formatoNumero(total.cantidadAnterior)}</td>}
                {ver('diferencia') && <td className={pie}>{formatoNumero(total.cantidad - total.cantidadAnterior)}</td>}
                {ver('variacion') && <td className={pie} />}
                {ver('admisiones') && <td className={pie} title="Admisiones distintas del período">{formatoNumero(total.admisiones)}</td>}
                {ver('precio') && <td className={pie} />}
                {ver('monto') && <td className={pie}>{formatoMonto(total.monto)}</td>}
                {ver('montoAnterior') && <td className={`${pie} text-tinta-secundaria`}>{formatoMonto(total.montoAnterior)}</td>}
                {ver('montoVariacion') && <td className={pie} />}
              </tr>
            </tfoot>
          )}
        </table>
      </ZonaScroll>
      {mostrarPaginacion && <PaginacionSimple {...paginacion} />}
    </ContenedorTabla>
  );
};

export default TablaCodigos;
