import { useMemo, useState } from 'react';
import { FileSpreadsheet, FileDown, Check } from 'lucide-react';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { useColumnasPermitidas } from '../../../../hooks/useColumnasPermitidas';
import { useToast } from '../../../../context/ToastContext';
import BuscadorConLimpiar from '../../../ui/BuscadorConLimpiar';
import { diferenciaLinea, resumenInventario, filtrarComparacion, normalizarClave, NO_CONTADOS } from '../../../../../functions/bodega/nucleo.mjs';
import { registrarConteo, mensajeError } from '../shared/bodegaApi';
import { exportarExcel, exportarPdf } from '../shared/exportar';
import { formatoCantidad } from '../shared/catalogosBodega';
import { formatoPesos } from './formato';

const PATH_VISTA = '/bodega/inventarioBodega';
const COLUMNAS = [
  { key: 'codigo', label: 'Código' },
  { key: 'producto', label: 'Producto', fija: true },
  { key: 'lote', label: 'Lote' },
  { key: 'vencimiento', label: 'Venc.' },
  { key: 'teorico', label: 'Teórico', alinear: 'text-right' },
  { key: 'contado', label: 'Contado', alinear: 'text-right', fija: true },
  { key: 'diferencia', label: 'Dif.', alinear: 'text-right' },
  { key: 'valor', label: 'Valor dif.', alinear: 'text-right' },
  { key: 'contadoPor', label: 'Contado por' },
];
const FILTROS = [['todos', 'Todos'], ['diferencias', 'Solo diferencias'], ['faltantes', 'Faltantes'], ['sobrantes', 'Sobrantes'], ['noContados', 'No contados']];
const Tarjeta = ({ titulo, valor, detalle, clase = '' }) => (
  <div className="px-2.5 py-1.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/60">
    <div className="text-[10px] font-bold uppercase text-gray-500">{titulo}</div>
    <div className={`text-[15px] font-bold font-num ${clase}`}>{valor}</div>
    {detalle && <div className="text-[10px] text-gray-500">{detalle}</div>}
  </div>
);

// Comparación por producto y lote: teórico (foto al iniciar), contado y
// diferencia, con filtros, totales y exportación. Con el inventario
// abierto, el contado se puede corregir aquí (reemplaza el valor).
const ComparacionInventario = ({ inventario, lineas, editable, onCambio }) => {
  const { hasPermission } = useGranularPermission();
  const { showToast } = useToast();
  const { columnasVisibles, ver } = useColumnasPermitidas(PATH_VISTA, 'comparacion', COLUMNAS);
  const [filtro, setFiltro] = useState('todos');
  const [texto, setTexto] = useState('');
  const [noContados, setNoContados] = useState(inventario.noContados || 'IGNORAR');
  const [edicion, setEdicion] = useState({}); // { [lineaId]: valor }
  const cerrado = inventario.estado === 'CERRADO';
  const puedeCorregir = editable && hasPermission(PATH_VISTA, 'inventario', 'btn_contar');

  const resumen = useMemo(() => resumenInventario(lineas, noContados), [lineas, noContados]);
  const filas = useMemo(() => {
    const palabras = normalizarClave(texto).split(' ').filter(Boolean);
    return filtrarComparacion(lineas, filtro, noContados)
      .filter((l) => !palabras.length || palabras.every((w) => normalizarClave(`${l.productoNombre} ${l.codigoMaestro} ${l.lote}`).includes(w)))
      .sort((a, b) => a.productoNombre.localeCompare(b.productoNombre, 'es') || String(a.lote).localeCompare(String(b.lote)));
  }, [lineas, filtro, texto, noContados]);

  const corregir = async (l) => {
    const valor = edicion[l.id];
    if (valor === undefined || valor === '') return;
    try {
      await registrarConteo({ inventarioId: inventario.id, modo: 'reemplazar', conteos: [{ productoId: l.productoId, lote: l.lote, vencimiento: l.vencimiento, cantidad: Number(valor) }] });
      setEdicion((e) => { const n = { ...e }; delete n[l.id]; return n; });
      onCambio();
    } catch (error) {
      showToast(mensajeError(error), 'error');
    }
  };

  const columnasExport = [
    { titulo: 'Código', valor: (l) => l.codigoMaestro },
    { titulo: 'Producto', valor: (l) => l.productoNombre },
    { titulo: 'Lote', valor: (l) => l.lote },
    { titulo: 'Vencimiento', valor: (l) => l.vencimiento },
    { titulo: 'Teórico', valor: (l) => l.teorico },
    { titulo: 'Contado', valor: (l) => (l.contado ?? 'No contado') },
    { titulo: 'Diferencia', valor: (l) => diferenciaLinea(l, noContados).diferencia },
    { titulo: 'Valor diferencia', valor: (l) => diferenciaLinea(l, noContados).diferencia * (l.precio || 0) },
    ...(cerrado ? [{ titulo: 'Ajuste aplicado', valor: (l) => l.ajuste ?? '' }] : []),
    { titulo: 'Lote agregado', valor: (l) => (l.agregado ? 'Sí' : '') },
    { titulo: 'Contado por', valor: (l) => l.contadoPor?.nombre || '' },
  ];
  const base = `inventario_${inventario.nombre}`;
  const subtitulo = `${resumen.lineas} líneas · ${resumen.sobrantes} sobrantes · ${resumen.faltantes} faltantes${cerrado ? ` · Motivo: ${inventario.motivoAjuste}` : ''}`;

  return (
    <div className="flex flex-col gap-2 text-[11px]">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Tarjeta titulo="Líneas" valor={resumen.lineas} detalle={`${resumen.contadas} contadas · ${resumen.agregadas} agregadas`} />
        <Tarjeta titulo="No contadas" valor={resumen.noContadas} clase={resumen.noContadas ? 'text-amber-600' : ''} />
        <Tarjeta titulo="Sobrantes" valor={`+${formatoCantidad(resumen.unidadesSobrantes)}`} detalle={`${resumen.sobrantes} línea(s)${resumen.conPrecio ? ` · ${formatoPesos(resumen.valorSobrante)}` : ''}`} clase="text-emerald-600" />
        <Tarjeta titulo="Faltantes" valor={`−${formatoCantidad(resumen.unidadesFaltantes)}`} detalle={`${resumen.faltantes} línea(s)${resumen.conPrecio ? ` · ${formatoPesos(resumen.valorFaltante)}` : ''}`} clase="text-red-600" />
        <Tarjeta titulo="Teórico total" valor={formatoCantidad(resumen.teorico)} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden">
          {FILTROS.map(([v, l]) => (
            <button key={v} type="button" onClick={() => setFiltro(v)} className={`h-7 px-2 font-semibold ${filtro === v ? 'bg-[#2383C2] text-white' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300'}`}>{l}</button>
          ))}
        </div>
        <BuscadorConLimpiar value={texto} onChange={setTexto} className="w-56" placeholder="Buscar producto o lote…" />
        {!cerrado && (
          <label className="flex items-center gap-1 text-gray-600 dark:text-gray-300">No contados:
            <select value={noContados} onChange={(e) => setNoContados(e.target.value)} className="h-7 px-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900">
              {Object.entries(NO_CONTADOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        )}
        {hasPermission(PATH_VISTA, 'inventario', 'btn_exportar') && (
          <div className="ml-auto flex gap-1">
            <button type="button" onClick={() => exportarExcel(base, [{ nombre: 'Comparación', columnas: columnasExport, filas }])} className="h-7 px-2 rounded border border-emerald-600 text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1"><FileSpreadsheet size={12} /> Excel</button>
            <button type="button" onClick={() => exportarPdf(base, { titulo: `Inventario ${inventario.nombre} (${inventario.estado})`, subtitulo, columnas: columnasExport, filas })} className="h-7 px-2 rounded border border-red-600 text-red-700 dark:text-red-300 font-semibold flex items-center gap-1"><FileDown size={12} /> PDF</button>
          </div>
        )}
      </div>
      <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-100 dark:bg-gray-900 text-[10px] uppercase text-gray-600 dark:text-gray-400 sticky top-0">
            <tr>{columnasVisibles.map((c) => <th key={c.key} className={`px-2 py-1.5 ${c.alinear || ''}`}>{c.label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {filas.length === 0 && <tr><td colSpan={columnasVisibles.length} className="px-2 py-6 text-center text-gray-400 italic">Sin líneas con este filtro.</td></tr>}
            {filas.map((l) => {
              const { diferencia } = diferenciaLinea(l, noContados);
              const contada = l.contado !== null && l.contado !== undefined;
              return (
                <tr key={l.id} className={diferencia < 0 ? 'bg-red-50/60 dark:bg-red-950/20' : diferencia > 0 ? 'bg-emerald-50/60 dark:bg-emerald-950/20' : ''}>
                  {ver('codigo') && <td className="px-2 py-1 font-num text-[#2383C2]">{l.codigoMaestro}</td>}
                  <td className="px-2 py-1 font-semibold">{l.productoNombre} {l.agregado && <span className="text-[9px] font-bold px-1 rounded bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">AGREGADO</span>}</td>
                  {ver('lote') && <td className="px-2 py-1 font-num">{l.lote || '—'}</td>}
                  {ver('vencimiento') && <td className="px-2 py-1 font-num">{l.vencimiento || '—'}</td>}
                  {ver('teorico') && <td className="px-2 py-1 text-right font-num">{l.teorico}</td>}
                  <td className="px-2 py-1 text-right">
                    {puedeCorregir ? (
                      <span className="inline-flex items-center gap-1">
                        <input type="number" min="0" step="1" inputMode="numeric" aria-label="Contado"
                          value={edicion[l.id] ?? (contada ? l.contado : '')} placeholder="—"
                          onChange={(e) => setEdicion((ed) => ({ ...ed, [l.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') corregir(l); }}
                          className="w-16 h-7 px-1 text-right font-num border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900" />
                        {edicion[l.id] !== undefined && <button type="button" onClick={() => corregir(l)} title="Guardar corrección" className="p-1 rounded text-emerald-600 hover:bg-emerald-50"><Check size={13} /></button>}
                      </span>
                    ) : <span className="font-num font-bold">{contada ? l.contado : <span className="text-amber-600">No contado</span>}</span>}
                  </td>
                  {ver('diferencia') && <td className={`px-2 py-1 text-right font-num font-bold ${diferencia < 0 ? 'text-red-600' : diferencia > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>{diferencia > 0 ? '+' : ''}{diferencia}{cerrado && l.ajuste !== undefined && l.ajuste !== diferencia ? ` (aj. ${l.ajuste})` : ''}</td>}
                  {ver('valor') && <td className="px-2 py-1 text-right font-num">{l.precio ? formatoPesos(diferencia * l.precio) : '—'}</td>}
                  {ver('contadoPor') && <td className="px-2 py-1">{l.contadoPor?.nombre || ''}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ComparacionInventario;
