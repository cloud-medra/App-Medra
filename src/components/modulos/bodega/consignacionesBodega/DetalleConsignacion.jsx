import { useMemo, useState } from 'react';
import { ArrowLeft, FileSpreadsheet, Pencil, AlertTriangle } from 'lucide-react';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { useColumnasPermitidas } from '../../../../hooks/useColumnasPermitidas';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import BuscadorConLimpiar from '../../../ui/BuscadorConLimpiar';
import { exportarExcel } from '../shared/exportar';
import { formatoCantidad } from '../shared/catalogosBodega';
import { estadoVencimiento } from '../shared/vencimientos';
import { fechaHora } from '../shared/transito/transitos';
import { conDatosProducto, filasConsignacion, filtrarFilas, ordenarFilas, textoPorCentro, totalesFilas } from './consignaciones';
import FormConsignacionModal from './FormConsignacionModal';

const PATH_VISTA = '/bodega/consignacionesBodega';
// Columnas (permiso col_<key> en la sección "consignacion").
const COLUMNAS = [
  { key: 'codigo', label: 'Código' },
  { key: 'producto', label: 'Producto', fija: true },
  { key: 'lote', label: 'Lote' },
  { key: 'vencimiento', label: 'Vencimiento' },
  { key: 'consignada', label: 'Consignada (debo tener)', alinear: 'text-right' },
  { key: 'actual', label: 'Stock actual (bodega)', alinear: 'text-right' },
  { key: 'transito', label: 'En tránsito', alinear: 'text-right' },
  { key: 'enCentro', label: 'En otro centro', alinear: 'text-right' },
  { key: 'diferencia', label: 'Diferencia', alinear: 'text-right' },
];

const situacion = (f) => (f.diferencia < 0 ? `Faltan ${-f.diferencia}` : f.diferencia > 0 ? `Sobran ${f.diferencia}` : 'OK');

const Chip = ({ titulo, valor, clase = '' }) => (
  <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700/60 text-[11px]">{titulo}: <strong className={`font-num ${clase}`}>{valor}</strong></span>
);

// Detalle de una empresa consignante: por producto + lote + vencimiento,
// lo consignado (debo tener) contra lo que tengo (en bodega, en tránsito y
// dejado en otro centro), con la diferencia, faltantes y vencimientos
// destacados, edición de la consignación y exportación a Excel.
const DetalleConsignacion = ({ empresa, consignacion, lotes, onVolver, onGuardada }) => {
  const { hasPermission } = useGranularPermission();
  const { columnasVisibles, ver } = useColumnasPermitidas(PATH_VISTA, 'consignacion', COLUMNAS);
  const { datos: productos } = useCatalogo('bodegaProductos');
  const { datos: centros } = useCatalogo('centros');
  const porId = useMemo(() => Object.fromEntries(productos.map((p) => [p.id, p])), [productos]);
  const nombreCentro = useMemo(() => {
    const nombres = Object.fromEntries(centros.map((c) => [c.id, c.nombre]));
    return (id) => nombres[id] || `Centro ${id}`;
  }, [centros]);
  const [filtro, setFiltro] = useState({ texto: '', soloFaltantes: false, soloPorVencer: false });
  const [editando, setEditando] = useState(false);

  const filas = useMemo(() => ordenarFilas(conDatosProducto(filasConsignacion(consignacion, lotes), porId)), [consignacion, lotes, porId]);
  const visibles = useMemo(() => filtrarFilas(filas, filtro), [filas, filtro]);
  const totales = useMemo(() => totalesFilas(filas), [filas]);

  const exportar = () => {
    const ahora = new Date();
    const columnas = [
      { titulo: 'Código', valor: (f) => f.codigoMaestro },
      { titulo: 'Producto', valor: (f) => f.productoNombre },
      { titulo: 'Lote', valor: (f) => f.lote || '' },
      { titulo: 'Vencimiento', valor: (f) => f.vencimiento || '' },
      { titulo: 'Estado vencimiento', valor: (f) => estadoVencimiento(f.vencimiento).etiqueta.replace(/ D$/, ' días') },
      { titulo: 'Cantidad consignada (debo tener)', valor: (f) => f.cantidadConsignada },
      { titulo: 'Stock actual (en bodega)', valor: (f) => f.actual },
      { titulo: 'En tránsito', valor: (f) => f.transito },
      { titulo: 'Tránsito por centro', valor: (f) => textoPorCentro(f.transitoPorCentro, nombreCentro) },
      { titulo: 'En otro centro', valor: (f) => f.enCentro },
      { titulo: 'Centro', valor: (f) => textoPorCentro(f.enCentroPorCentro, nombreCentro) },
      { titulo: 'Diferencia', valor: (f) => f.diferencia },
      { titulo: 'Situación', valor: (f) => `${situacion(f)}${f.registrada ? '' : ' (no registrado en la consignación)'}` },
    ];
    // Fila de totales de lo exportado (respeta los filtros aplicados).
    const t = totalesFilas(visibles);
    const total = {
      codigoMaestro: '', productoNombre: 'TOTAL', cantidadConsignada: t.consignada, actual: t.actual, transito: t.transito,
      enCentro: t.enCentro, diferencia: t.actual + t.transito + t.enCentro - t.consignada, registrada: true,
    };
    exportarExcel(`stock_consignado_${empresa.nombre}`, [{
      nombre: 'Stock consignado',
      encabezado: [
        ['Empresa', empresa.nombre],
        ['Fecha de exportación', ahora.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })],
        ['Faltante (unidades)', t.faltante],
        ...(filtro.texto || filtro.soloFaltantes || filtro.soloPorVencer ? [['Filtro', 'Solo las líneas visibles en pantalla']] : []),
      ],
      columnas,
      filas: [...visibles, total],
    }]);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onVolver} className="h-7 px-2 rounded border border-gray-300 dark:border-gray-600 font-semibold flex items-center gap-1"><ArrowLeft size={12} /> Empresas</button>
        <h3 className="text-[13px] font-bold text-gray-800 dark:text-gray-100">{empresa.nombre}</h3>
        {consignacion?.actualizadoEn && <span className="text-gray-500">Actualizada {fechaHora(consignacion.actualizadoEn)} por {consignacion.actualizadoPor?.nombre || ''}</span>}
        <div className="ml-auto flex items-center gap-1.5">
          {hasPermission(PATH_VISTA, 'consignacion', 'btn_guardar') && (
            <button type="button" onClick={() => setEditando(true)} className="h-7 px-2 rounded bg-[#2383C2] text-white font-bold flex items-center gap-1"><Pencil size={12} /> {consignacion ? 'Editar consignación' : 'Registrar consignación'}</button>
          )}
          {hasPermission(PATH_VISTA, 'consignacion', 'btn_exportar') && (
            <button type="button" disabled={!visibles.length} onClick={exportar} className="h-7 px-2 rounded border border-emerald-600 text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1 disabled:opacity-40"><FileSpreadsheet size={12} /> Exportar a Excel</button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip titulo="Debo tener" valor={formatoCantidad(totales.consignada)} />
        <Chip titulo="En bodega" valor={formatoCantidad(totales.actual)} clase="text-emerald-600 dark:text-emerald-400" />
        <Chip titulo="En tránsito" valor={formatoCantidad(totales.transito)} clase="text-amber-600 dark:text-amber-400" />
        <Chip titulo="En otro centro" valor={formatoCantidad(totales.enCentro)} clase="text-violet-600 dark:text-violet-400" />
        <Chip titulo="Faltante" valor={`${formatoCantidad(totales.faltante)} u. en ${totales.conFaltante} línea(s)`} clase={totales.faltante ? 'text-red-600 dark:text-red-400' : ''} />
        {totales.porVencer > 0 && <Chip titulo="Vencidos o próximos a vencer" valor={totales.porVencer} clase="text-amber-600 dark:text-amber-400" />}
      </div>
      {consignacion?.observacion && <p className="text-[11px] text-gray-500">Observación: {consignacion.observacion}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <BuscadorConLimpiar value={filtro.texto} onChange={(texto) => setFiltro((f) => ({ ...f, texto }))} className="w-64" placeholder="Buscar producto, código, lote…" />
        <label className="flex items-center gap-1 text-gray-600 dark:text-gray-300"><input type="checkbox" checked={filtro.soloFaltantes} onChange={(e) => setFiltro((f) => ({ ...f, soloFaltantes: e.target.checked }))} /> Solo faltantes</label>
        <label className="flex items-center gap-1 text-gray-600 dark:text-gray-300"><input type="checkbox" checked={filtro.soloPorVencer} onChange={(e) => setFiltro((f) => ({ ...f, soloPorVencer: e.target.checked }))} /> Solo vencidos / próximos a vencer</label>
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto">
        <table className="w-full text-left text-[11px] border-collapse">
          <thead className="bg-gray-100 dark:bg-gray-900 text-[10px] uppercase text-gray-600 dark:text-gray-400 sticky top-0">
            <tr>{columnasVisibles.map((c) => <th key={c.key} className={`px-2 py-1.5 ${c.alinear || ''}`}>{c.label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {visibles.length === 0 && (
              <tr><td colSpan={columnasVisibles.length} className="px-2 py-6 text-center text-gray-400 italic">
                {filas.length ? 'Ninguna línea coincide con los filtros.' : 'Sin productos consignados. Registra la consignación o ingresa stock "En consignación".'}
              </td></tr>
            )}
            {visibles.map((f) => {
              const venc = estadoVencimiento(f.vencimiento);
              const faltante = f.diferencia < 0;
              return (
                <tr key={f.loteId} className={faltante ? 'bg-red-50/60 dark:bg-red-950/20' : venc.fila}>
                  {ver('codigo') && <td className="px-2 py-1 font-num text-[#2383C2]">{f.codigoMaestro}</td>}
                  <td className="px-2 py-1 font-semibold text-gray-800 dark:text-gray-100">
                    {f.productoNombre}
                    {!f.registrada && <span className="ml-1 px-1 rounded text-[9px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" title="Hay stock de esta empresa en este lote, pero no está en la consignación registrada">NO REGISTRADO</span>}
                  </td>
                  {ver('lote') && <td className="px-2 py-1 font-num">{f.lote || '—'}</td>}
                  {ver('vencimiento') && <td className="px-2 py-1 font-num whitespace-nowrap">{f.vencimiento || '—'} {venc.etiqueta && <span className={`px-1 rounded text-[9px] font-bold ${venc.badge}`}>{venc.etiqueta}</span>}</td>}
                  {ver('consignada') && <td className="px-2 py-1 text-right font-num font-bold">{formatoCantidad(f.cantidadConsignada)}</td>}
                  {ver('actual') && <td className="px-2 py-1 text-right font-num text-emerald-700 dark:text-emerald-400">{formatoCantidad(f.actual)}</td>}
                  {ver('transito') && (
                    <td className="px-2 py-1 text-right font-num text-amber-600 dark:text-amber-400" title={textoPorCentro(f.transitoPorCentro, nombreCentro)}>
                      {f.transito ? formatoCantidad(f.transito) : '—'}
                    </td>
                  )}
                  {ver('enCentro') && (
                    <td className="px-2 py-1 text-right">
                      {f.enCentro ? (
                        <>
                          <div className="font-num font-bold text-violet-600 dark:text-violet-400">{formatoCantidad(f.enCentro)}</div>
                          <div className="text-[10px] text-gray-500">{textoPorCentro(f.enCentroPorCentro, nombreCentro)}</div>
                        </>
                      ) : '—'}
                    </td>
                  )}
                  {ver('diferencia') && (
                    <td className={`px-2 py-1 text-right font-num font-bold whitespace-nowrap ${faltante ? 'text-red-600 dark:text-red-400' : f.diferencia > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {faltante && <AlertTriangle size={11} className="inline mr-0.5 -mt-0.5" />}
                      {f.diferencia > 0 ? `+${f.diferencia}` : f.diferencia}
                      <div className="text-[9px] font-semibold">{situacion(f)}</div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-500">Diferencia = stock actual + en tránsito + en otro centro − consignada. Negativa (rojo) = faltante: se usó, se perdió o no ha llegado. Los lotes vencidos o que vencen en los próximos 90 días se resaltan.</p>

      {editando && (
        <FormConsignacionModal empresa={empresa} consignacion={consignacion} lotesEmpresa={lotes} onCerrar={() => setEditando(false)}
          onGuardada={(r) => { setEditando(false); onGuardada(r); }} />
      )}
    </div>
  );
};

export default DetalleConsignacion;
