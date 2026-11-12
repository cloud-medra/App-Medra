import { Search, X } from 'lucide-react';
import { useColumnasPermitidas } from '../../../../hooks/useColumnasPermitidas';
import { useColumnResize } from '../../../../hooks/useColumnResize';
import { ThRedimensionable, ColgroupRedimensionable, ThRelleno, TdRelleno } from '../../../ui/ThRedimensionable';
import { normalizarCodigo } from './useFacturacionOrden';
import { useFiltrosDetalleOrden } from './useFiltrosDetalleOrden';

// Detalle de una orden (Laboratorio y Vacunatorio): buscadores por
// descripción / código / N° documento, columnas redimensionables y totales.

// Granularidad por columna: `col_<key>` en la sección 'detalle_orden' de la vista que
// monta la tabla (`pathVista`; ver useColumnasPermitidas).
const COLUMNAS = [
  { key: 'codigo', label: 'Código', ancho: 110, min: 70 },
  { key: 'descripcion', label: 'Descripción del Artículo', ancho: 320, min: 120 },
  { key: 'cantidad', label: 'Cant.', align: 'text-center', ancho: 70, min: 50 },
  { key: 'precio', label: 'Precio Unit.', align: 'text-right', ancho: 100, min: 70 },
  { key: 'subtotal', label: 'Subtotal', align: 'text-right', ancho: 110, min: 70 },
  { key: 'documento', label: 'N° Documento', ancho: 170, min: 90 },
  { key: 'facturada', label: 'Cant. Facturada', align: 'text-center', ancho: 105, min: 70 },
  { key: 'pendiente', label: 'Cant. Pendiente', align: 'text-center', ancho: 105, min: 70 },
];

const TH = 'px-3 py-1.5 border-r border-slate-200 dark:border-gray-700/80';
const TD = 'px-3 py-1 border-r border-slate-200/50 dark:border-gray-700/50';
const INPUT = 'w-full h-6 pl-7 pr-2 border border-slate-300 dark:border-gray-600 rounded text-secundario outline-none bg-white dark:bg-gray-900 text-tinta-principal focus:border-[#2383C2]';

const Buscador = ({ value, onChange, placeholder }) => (
  <div className="relative w-52">
    <Search className="absolute left-2 top-1.5 text-slate-400 dark:text-gray-500" size={12} />
    <input value={value} onChange={e => onChange(e.target.value)} className={INPUT} placeholder={placeholder} />
  </div>
);

const DetalleOrdenTabla = ({ pathVista, detalle, facturacion, errorFacturacion, totalOrden }) => {
  const { columnasVisibles, ver } = useColumnasPermitidas(pathVista, 'detalle_orden', COLUMNAS);
  const { anchos, handleResize, anchoTotalTabla } = useColumnResize(columnasVisibles);
  const { filtros, setFiltro, limpiarFiltros, hayFiltros, detalleFiltrado } = useFiltrosDetalleOrden(detalle, facturacion);

  const totalDetalle = detalle.reduce((acc, item) => acc + ((parseFloat(item["Cant."]) || 0) * (parseFloat(item["P.Unitario"]) || 0)), 0);
  const totalUnidades = detalle.reduce((acc, item) => acc + (parseFloat(item["Cant."]) || 0), 0);
  const totalFacturadas = detalle.reduce((acc, item) => acc + (facturacion[normalizarCodigo(item["Cod.Artículo"])]?.cantidadFacturada || 0), 0);


  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="bg-slate-100/70 dark:bg-gray-800/40 p-1.5 flex flex-wrap gap-1.5 items-center border-b border-slate-200 dark:border-gray-700 shrink-0">
        <Buscador value={filtros.descripcion} onChange={v => setFiltro('descripcion', v)} placeholder="Buscar por descripción..." />
        <Buscador value={filtros.codigo} onChange={v => setFiltro('codigo', v)} placeholder="Buscar por código..." />
        <Buscador value={filtros.documento} onChange={v => setFiltro('documento', v)} placeholder="Buscar por N° documento..." />
        {hayFiltros && (
          <button
            type="button"
            onClick={limpiarFiltros}
            className="h-6 px-2 rounded text-secundario flex items-center gap-1 text-tinta-secundaria hover:text-tinta-principal hover:bg-slate-200/70 dark:hover:bg-gray-700 transition"
          >
            <X size={12} /> Limpiar filtros
          </button>
        )}
        {hayFiltros && (
          <span className="text-pequeno text-tinta-secundaria ml-auto">
            {detalleFiltrado.length} de {detalle.length} líneas
          </span>
        )}
      </div>

      <div className="flex-grow overflow-auto min-h-0">
        <table
          className="text-left text-secundario border-collapse"
          style={{ tableLayout: 'fixed', width: anchoTotalTabla, minWidth: '100%' }}
        >
          <ColgroupRedimensionable columnas={columnasVisibles} anchos={anchos} relleno />
          <thead className="bg-slate-100/90 dark:bg-gray-900 sticky top-0 z-10 shadow-xs">
            <tr className="text-tinta-secundaria uppercase text-pequeno tracking-wider border-b border-slate-200 dark:border-gray-700">
              {columnasVisibles.map(col => (
                <ThRedimensionable key={col.key} col={col} anchos={anchos} onResize={handleResize} className={`${TH} ${col.align || ''}`}>{col.label}</ThRedimensionable>
              ))}
              <ThRelleno />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/60 dark:divide-gray-700/40 bg-white dark:bg-gray-800">
            {detalleFiltrado.length === 0 && (
              <tr>
                <td colSpan={columnasVisibles.length + 1} className="px-4 py-6 text-center text-tinta-atenuada text-normal">
                  {hayFiltros ? 'Ninguna línea coincide con los filtros.' : 'La orden no tiene líneas.'}
                </td>
              </tr>
            )}
            {detalleFiltrado.map((item, i) => {
              const cantidad = parseFloat(item["Cant."]) || 0;
              const precioUnidad = parseFloat(item["P.Unitario"]) || 0;
              const totalLinea = cantidad * precioUnidad;
              const fact = facturacion[normalizarCodigo(item["Cod.Artículo"])];
              const facturada = fact?.cantidadFacturada || 0;
              const pendiente = cantidad - facturada;
              const claseFacturada = fact?.tieneTemporal
                ? 'text-orange-600 dark:text-orange-400'
                : fact?.todosFinales
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-tinta-principal';
              const tituloFacturada = fact?.tieneTemporal
                ? 'Temporal: incluye facturas con diferencia por resolver, sujeto a cambios'
                : fact?.todosFinales ? 'Definitivo: todas las facturas están sin diferencias' : undefined;
              const documentosTitle = fact?.documentos.map(x => `${x.folio} (${x.cantidad}) — ${x.estado || 'Sin estado'}`).join('\n') || '';

              return (
                <tr
                  key={item["Cod.Artículo"] ?? i}
                  className="hover:bg-slate-50/80 dark:hover:bg-gray-700/30 transition-all duration-150 group border-l-2 border-l-transparent hover:border-l-[#2383C2]"
                >
                  {ver('codigo') && (
                    <td className={`${TD} text-pequeno text-tinta-principal truncate`}>
                      {item["Cod.Artículo"] || "N/A"}
                    </td>
                  )}
                  {ver('descripcion') && (
                    <td className={`${TD} text-tinta-principal truncate`} title={item["Artículo"]}>
                      {item["Artículo"] || "Sin Descripción"}
                    </td>
                  )}
                  {ver('cantidad') && (
                    <td className={`${TD} text-tinta-principal text-center`}>
                      {cantidad}
                    </td>
                  )}
                  {ver('precio') && (
                    <td className={`${TD} text-tinta-secundaria text-right whitespace-nowrap text-pequeno`}>
                      ${precioUnidad.toLocaleString('es-CL', { minimumFractionDigits: 0 })}
                    </td>
                  )}
                  {ver('subtotal') && (
                    <td className={`${TD} text-tinta-principal text-right whitespace-nowrap`}>
                      ${totalLinea.toLocaleString('es-CL', { minimumFractionDigits: 0 })}
                    </td>
                  )}
                  {ver('documento') && (
                    <td className={`${TD} text-pequeno text-tinta-secundaria truncate`} title={documentosTitle}>
                      {fact ? fact.documentos.map((x, idx) => (
                        <span key={x.id} className={x.temporal ? 'text-orange-600 dark:text-orange-400' : ''}>
                          {idx > 0 && ', '}{x.folio} ({x.cantidad}){x.temporal && ' ⚠'}
                        </span>
                      )) : '-'}
                    </td>
                  )}
                  {ver('facturada') && (
                    <td className={`${TD} text-center ${claseFacturada}`} title={tituloFacturada}>
                      {facturada}
                    </td>
                  )}
                  {ver('pendiente') && (
                    <td
                      className={`px-3 py-1 border-r border-slate-200/50 dark:border-gray-700/50 text-center ${pendiente < 0 ? 'text-red-600 dark:text-red-400' : pendiente === 0 && facturada > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-tinta-principal'}`}
                      title={pendiente < 0 ? 'Facturado sobre la cantidad de la orden' : undefined}
                    >
                      {pendiente}
                    </td>
                  )}
                  <TdRelleno />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-slate-100 dark:bg-gray-900 border-t border-slate-200 dark:border-gray-700 p-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4 text-pequeno text-tinta-secundaria">
          <span>Líneas: <strong className="text-tinta-principal">{detalle.length}</strong></span>
          <span>Unidades totales: <strong className="text-tinta-principal">{totalUnidades}</strong></span>
          <span>Facturadas: <strong className="text-tinta-principal">{totalFacturadas}</strong></span>
          {errorFacturacion && <span className="text-red-500" title={errorFacturacion.message}>No se pudo cargar la facturación (¿índice pendiente de desplegar?)</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-pequeno text-tinta-secundaria uppercase tracking-wider">Total Orden:</span>
          <span className="text-normal text-[#2383C2] dark:text-[#369BCE] px-2 py-0.5 rounded bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700">
            ${(totalOrden || totalDetalle).toLocaleString('es-CL', { minimumFractionDigits: 0 })}
          </span>
        </div>
      </div>
    </div>
  );
};

export default DetalleOrdenTabla;
