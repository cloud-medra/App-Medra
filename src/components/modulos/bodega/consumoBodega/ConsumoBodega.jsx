import { Fragment, useMemo, useState } from 'react';
import { BarChart3, Search, FileSpreadsheet, ChevronDown, ChevronRight } from 'lucide-react';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { useColumnasPermitidas } from '../../../../hooks/useColumnasPermitidas';
import { ETIQUETA_ID_ENTREGA } from '../../../../../functions/bodega/nucleo.mjs';
import BuscadorProducto from '../shared/BuscadorProducto';
import { leerEntregas, mensajeError } from '../shared/bodegaApi';
import { exportarExcel } from '../shared/exportar';
import { formatoCantidad } from '../shared/catalogosBodega';
import { hoyISO } from '../shared/documentos/lineasDocumento';
import { fechaHora } from '../shared/transito/transitos';
import { agruparConsumo, primerDiaDelMes } from './consumo';

const PATH_VISTA = '/bodega/consumoBodega';
const COLUMNAS = [
  { key: 'producto', label: 'Centro / producto', fija: true },
  { key: 'codigo', label: 'Código' },
  { key: 'entregas', label: 'Entregas', alinear: 'text-right' },
  { key: 'unidades', label: 'Unidades', alinear: 'text-right' },
];
const INPUT = 'h-9 px-2 border border-gray-300 dark:border-gray-600 rounded text-[12px] bg-white dark:bg-gray-900';

// Consumo por centro: entregas (movimientos ENTREGA) en un rango de fechas,
// opcionalmente de un centro y/o un producto, agrupadas por centro y
// producto, con el detalle de cada entrega. Exportable a Excel.
const ConsumoBodega = () => {
  const { hasPermission } = useGranularPermission();
  const { columnasVisibles, ver } = useColumnasPermitidas(PATH_VISTA, 'reporte', COLUMNAS);
  const { datos: centros } = useCatalogo('centros');
  const [filtros, setFiltros] = useState(() => ({ desde: primerDiaDelMes(hoyISO()), hasta: hoyISO(), centroId: '', producto: null }));
  const [resultado, setResultado] = useState(null); // { entregas, truncado }
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [abiertos, setAbiertos] = useState(() => new Set());
  const grupos = useMemo(() => agruparConsumo(resultado?.entregas || []), [resultado]);
  const total = grupos.reduce((n, c) => n + c.unidades, 0);

  const consultar = async () => {
    if (!filtros.desde || !filtros.hasta || filtros.desde > filtros.hasta) { setError('Elige un rango de fechas válido.'); return; }
    setCargando(true);
    setError('');
    try {
      setResultado(await leerEntregas({ desde: filtros.desde, hasta: filtros.hasta, centroId: filtros.centroId || null, productoId: filtros.producto?.id || null }));
      setAbiertos(new Set());
    } catch (e) {
      setError(mensajeError(e, 'No se pudo leer el consumo.'));
    } finally {
      setCargando(false);
    }
  };
  const alternar = (clave) => setAbiertos((s) => { const n = new Set(s); if (n.has(clave)) n.delete(clave); else n.add(clave); return n; });

  const exportar = () => exportarExcel(`consumo_bodega_${filtros.desde}_${filtros.hasta}`, [
    {
      nombre: 'Resumen',
      columnas: [
        { titulo: 'Centro', valor: (f) => f.centro },
        { titulo: 'Código', valor: (f) => f.codigo },
        { titulo: 'Producto', valor: (f) => f.producto },
        { titulo: 'Entregas', valor: (f) => f.entregas },
        { titulo: 'Unidades', valor: (f) => f.unidades },
      ],
      filas: grupos.flatMap((c) => c.productos.map((p) => ({ centro: c.centroNombre, codigo: p.codigoMaestro, producto: p.productoNombre, entregas: p.entregas, unidades: p.unidades }))),
    },
    {
      nombre: 'Detalle',
      columnas: [
        { titulo: 'Fecha', valor: (m) => fechaHora(m.fecha) },
        { titulo: 'Centro', valor: (m) => m.centroNombre },
        { titulo: 'Código', valor: (m) => m.codigoMaestro },
        { titulo: 'Producto', valor: (m) => m.productoNombre },
        { titulo: 'Lote', valor: (m) => m.lote },
        { titulo: 'Vencimiento', valor: (m) => m.vencimiento },
        { titulo: 'Cantidad', valor: (m) => m.cantidad },
        { titulo: ETIQUETA_ID_ENTREGA, valor: (m) => m.idEntrega },
        { titulo: 'Observación', valor: (m) => m.observacion },
        { titulo: 'Usuario', valor: (m) => m.usuario?.nombre || '' },
        { titulo: 'N° salida', valor: (m) => m.documentoRef?.numero || '' },
      ],
      filas: resultado?.entregas || [],
    },
  ]);

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden text-[12px]">
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="text-[12px] font-bold text-gray-700 dark:text-gray-100 flex items-center gap-1.5 uppercase"><BarChart3 size={14} className="text-[#2383C2]" /> Consumo por centro (entregas)</h2>
      </div>
      <div className="px-3 py-2 flex flex-wrap items-end gap-2 border-b border-gray-200 dark:border-gray-700">
        <label className="flex flex-col"><span className="text-[10px] font-bold uppercase text-gray-500">Desde</span><input type="date" value={filtros.desde} onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value }))} className={INPUT} /></label>
        <label className="flex flex-col"><span className="text-[10px] font-bold uppercase text-gray-500">Hasta</span><input type="date" value={filtros.hasta} onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value }))} className={INPUT} /></label>
        <label className="flex flex-col"><span className="text-[10px] font-bold uppercase text-gray-500">Centro</span>
          <select value={filtros.centroId} onChange={(e) => setFiltros((f) => ({ ...f, centroId: e.target.value }))} className={`${INPUT} max-w-[220px]`}>
            <option value="">Todos</option>
            {centros.filter((c) => c.nombre).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
        <div className="flex flex-col w-72">
          <span className="text-[10px] font-bold uppercase text-gray-500">Producto</span>
          {filtros.producto ? (
            <button type="button" onClick={() => setFiltros((f) => ({ ...f, producto: null }))} className={`${INPUT} text-left truncate`} title="Quitar filtro de producto">{filtros.producto.nombre} ✕</button>
          ) : <BuscadorProducto onElegir={(p) => setFiltros((f) => ({ ...f, producto: p }))} placeholder="Todos (buscar para filtrar)" />}
        </div>
        <button type="button" onClick={consultar} disabled={cargando} className="h-9 px-3 rounded bg-[#2383C2] text-white font-bold flex items-center gap-1 disabled:opacity-50"><Search size={14} /> {cargando ? 'Consultando…' : 'Consultar'}</button>
        {hasPermission(PATH_VISTA, 'reporte', 'btn_exportar') && (
          <button type="button" onClick={exportar} disabled={!grupos.length} className="h-9 px-3 rounded border border-emerald-600 text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-1 disabled:opacity-40"><FileSpreadsheet size={14} /> Excel</button>
        )}
      </div>
      <div className="flex-1 overflow-auto p-3">
        {error && <p className="text-red-600 mb-2">{error}</p>}
        {resultado?.truncado && <p className="text-amber-700 mb-2">Se muestran las primeras {resultado.entregas.length} entregas: acota el rango para ver todo.</p>}
        {!resultado ? (
          <p className="text-gray-400 italic">Elige el rango y presiona Consultar.</p>
        ) : (
          <table className="w-full text-left border border-gray-200 dark:border-gray-700">
            <thead className="bg-gray-100 dark:bg-gray-900 text-[10px] uppercase text-gray-600 dark:text-gray-400">
              <tr>{columnasVisibles.map((c) => <th key={c.key} className={`px-2 py-1.5 ${c.alinear || ''}`}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {grupos.length === 0 && <tr><td colSpan={columnasVisibles.length} className="px-2 py-6 text-center text-gray-400 italic">Sin entregas en el rango.</td></tr>}
              {grupos.map((c) => (
                <Fragment key={c.centroId}>
                  <tr className="bg-amber-50 dark:bg-amber-950/20 font-bold">
                    <td className="px-2 py-1.5">{c.centroNombre}</td>
                    {ver('codigo') && <td />}
                    {ver('entregas') && <td className="px-2 py-1.5 text-right font-num">{c.productos.reduce((n, p) => n + p.entregas, 0)}</td>}
                    {ver('unidades') && <td className="px-2 py-1.5 text-right font-num">{formatoCantidad(c.unidades)}</td>}
                  </tr>
                  {c.productos.map((p) => {
                    const clave = `${c.centroId}|${p.productoId}`;
                    const detalle = abiertos.has(clave) ? resultado.entregas.filter((m) => m.centroId === c.centroId && m.productoId === p.productoId) : [];
                    return (
                      <Fragment key={clave}>
                        <tr className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer" onClick={() => alternar(clave)}>
                          <td className="px-2 py-1 pl-5">{abiertos.has(clave) ? <ChevronDown size={11} className="inline" /> : <ChevronRight size={11} className="inline" />} {p.productoNombre}</td>
                          {ver('codigo') && <td className="px-2 py-1 font-num text-[#2383C2]">{p.codigoMaestro}</td>}
                          {ver('entregas') && <td className="px-2 py-1 text-right font-num">{p.entregas}</td>}
                          {ver('unidades') && <td className="px-2 py-1 text-right font-num font-bold">{formatoCantidad(p.unidades)}</td>}
                        </tr>
                        {detalle.map((m) => (
                          <tr key={m.id} className="text-[11px] text-gray-600 dark:text-gray-300">
                            <td colSpan={columnasVisibles.length} className="px-2 py-0.5 pl-10">
                              {fechaHora(m.fecha)} · lote {m.lote || 'S/L'} · <strong>{m.cantidad} u.</strong> · {ETIQUETA_ID_ENTREGA} {m.idEntrega || '—'} · {m.observacion} · {m.usuario?.nombre || ''}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
            {grupos.length > 0 && (
              <tfoot className="bg-gray-100 dark:bg-gray-900 font-bold">
                <tr><td colSpan={columnasVisibles.length} className="px-2 py-1.5 text-right">Total: {formatoCantidad(total)} unidad(es) en {resultado.entregas.length} entrega(s)</td></tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  );
};

export default ConsumoBodega;
