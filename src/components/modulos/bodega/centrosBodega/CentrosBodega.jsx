import { useEffect, useMemo, useState } from 'react';
import { Building2, RefreshCw, ArrowLeft, FileSpreadsheet, FileDown } from 'lucide-react';
import { useToast } from '../../../../context/ToastContext';
import { useColumnasPermitidas } from '../../../../hooks/useColumnasPermitidas';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { exportarExcel, exportarPdf } from '../shared/exportar';
import BuscadorConLimpiar from '../../../ui/BuscadorConLimpiar';
import { leerCentroConTransito, leerCentrosConTransito, leerResumenCentro, leerTransitosAbiertos, mensajeError } from '../shared/bodegaApi';
import { aplicarResultadoTransitos } from '../shared/listasLocales';
import { formatoCantidad } from '../shared/catalogosBodega';
import { estadoVencimiento } from '../shared/vencimientos';
import TablaTransitos from '../shared/transito/TablaTransitos';
import { conReferencia, diasEnTransito, filtrarTransitos, fechaHora } from '../shared/transito/transitos';
import { useCatalogo } from '../../../../hooks/useCatalogo';

const PATH_VISTA = '/bodega/centrosBodega';
const COLUMNAS = [
  { key: 'centro', label: 'Centro', fija: true },
  { key: 'productos', label: 'Productos', alinear: 'text-right' },
  { key: 'unidades', label: 'En tránsito', alinear: 'text-right' },
  { key: 'enCentro', label: 'Dejado en centro', alinear: 'text-right' },
  { key: 'antiguo', label: 'Más antiguo (días)', alinear: 'text-right' },
  { key: 'vencimiento', label: 'Próximo vencimiento' },
];

const COLUMNAS_EXPORT = [
  { titulo: 'Referencia', valor: (t) => t.referencia || '' },
  { titulo: 'Producto', valor: (t) => t.productoNombre },
  { titulo: 'Lote', valor: (t) => t.lote || '—' },
  { titulo: 'Vencimiento', valor: (t) => t.vencimiento || '—' },
  { titulo: 'Dueño', valor: (t) => t.propietarioNombre || 'Propio' },
  { titulo: 'Pendiente', valor: (t) => t.pendiente },
  { titulo: 'Dejado en centro', valor: (t) => t.enCentro || 0 },
  { titulo: 'Salida', valor: (t) => t.cantidadSalida },
  { titulo: 'Fecha salida', valor: (t) => fechaHora(t.fechaSalida) },
  { titulo: 'Días', valor: (t) => diasEnTransito(t.fechaSalida) },
  { titulo: 'Solicitante', valor: (t) => t.solicitante },
  { titulo: 'N° salida', valor: (t) => t.salidaNumero },
  { titulo: 'Usuario', valor: (t) => t.usuario?.nombre || '' },
];

// Detalle de un centro: su tránsito por producto y lote, con acciones.
const DetalleCentro = ({ centro, onVolver }) => {
  const { showToast } = useToast();
  const { hasPermission } = useGranularPermission();
  const [transitos, setTransitos] = useState(null);
  const [version, setVersion] = useState(0);
  const [texto, setTexto] = useState('');
  // true si se hizo alguna acción: al volver se relee solo este centro.
  const [huboCambios, setHuboCambios] = useState(false);
  useEffect(() => {
    let vigente = true;
    leerTransitosAbiertos({ centroId: centro.id })
      .then((t) => { if (vigente) setTransitos(t); })
      .catch((e) => { if (vigente) { setTransitos([]); showToast(mensajeError(e), 'error'); } });
    return () => { vigente = false; };
  }, [centro.id, version, showToast]);
  const { datos: productos } = useCatalogo('bodegaProductos');
  const productosPorId = useMemo(() => Object.fromEntries(productos.map((p) => [p.id, p])), [productos]);
  const filtrados = useMemo(() => filtrarTransitos(conReferencia(transitos || [], productosPorId), texto), [transitos, productosPorId, texto]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onVolver(huboCambios)} className="h-7 px-2 rounded border border-gray-300 dark:border-gray-600 font-semibold flex items-center gap-1"><ArrowLeft size={12} /> Centros</button>
        <h3 className="text-[13px] font-bold text-gray-800 dark:text-gray-100">{centro.centroNombre}</h3>
        <span className="text-gray-500">
          {formatoCantidad(filtrados.reduce((n, t) => n + (t.pendiente || 0), 0))} u. en tránsito
          {filtrados.some((t) => t.enCentro) && ` · ${formatoCantidad(filtrados.reduce((n, t) => n + (t.enCentro || 0), 0))} u. dejadas en el centro`} · {filtrados.length} registro(s)
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <BuscadorConLimpiar value={texto} onChange={setTexto} className="w-64" placeholder="Buscar producto, lote…" />
          {hasPermission(PATH_VISTA, 'exportar', 'btn_exportar') && (
            <>
              <button type="button" disabled={!filtrados.length} onClick={() => exportarExcel(`transito_${centro.centroNombre}`, [{ nombre: 'Tránsito', columnas: COLUMNAS_EXPORT, filas: filtrados }])}
                className="h-7 px-2 rounded border border-emerald-600 text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1 disabled:opacity-40"><FileSpreadsheet size={12} /> Excel</button>
              <button type="button" disabled={!filtrados.length} onClick={() => exportarPdf(`transito_${centro.centroNombre}`, { titulo: `Tránsito en ${centro.centroNombre}`, subtitulo: `${filtrados.length} registro(s) · ${filtrados.reduce((n, t) => n + (t.pendiente || 0), 0)} u. en tránsito · ${filtrados.reduce((n, t) => n + (t.enCentro || 0), 0)} u. dejadas en el centro`, columnas: COLUMNAS_EXPORT, filas: filtrados })}
                className="h-7 px-2 rounded border border-red-600 text-red-700 dark:text-red-300 font-semibold flex items-center gap-1 disabled:opacity-40"><FileDown size={12} /> PDF</button>
            </>
          )}
        </div>
      </div>
      {transitos === null
        ? <p className="text-gray-400 italic">Cargando…</p>
        : <TablaTransitos transitos={filtrados} rutaVista={PATH_VISTA} origen="centros" ocultarCentro onCambio={(r) => {
            setHuboCambios(true);
            if (r?.transitos) setTransitos((t) => aplicarResultadoTransitos(t || [], r.transitos));
            else { setTransitos(null); setVersion((v) => v + 1); }
          }} />}
    </div>
  );
};

// Tránsito por centro: cada centro con stock en tránsito o dejado en él
// (productos distintos, unidades, tránsito más antiguo y próximo
// vencimiento) y su detalle con entregar / devolver / dejar en centro /
// nota de a uno o varios.
const CentrosBodega = () => {
  const { showToast } = useToast();
  const { columnasVisibles, ver } = useColumnasPermitidas(PATH_VISTA, 'centros', COLUMNAS);
  const [centros, setCentros] = useState(null);
  const [resumenes, setResumenes] = useState({});
  const [abierto, setAbierto] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    leerCentrosConTransito()
      .then(async (lista) => {
        if (!vigente) return;
        setCentros(lista.sort((a, b) => (a.centroNombre || '').localeCompare(b.centroNombre || '', 'es')));
        const pares = await Promise.all(lista.map(async (c) => [c.id, await leerResumenCentro(c.id).catch(() => null)]));
        if (vigente) setResumenes(Object.fromEntries(pares));
      })
      .catch((e) => { if (vigente) { setCentros([]); showToast(mensajeError(e, 'No se pudo leer el tránsito por centro.'), 'error'); } });
    return () => { vigente = false; };
  }, [version, showToast]);
  const recargar = () => { setCentros(null); setResumenes({}); setVersion((v) => v + 1); };
  // Al volver del detalle: si no se hizo nada no se relee; si hubo
  // acciones se relee solo ese centro (3 lecturas) en vez de todos.
  const volver = async (huboCambios) => {
    const id = abierto.id;
    setAbierto(null);
    if (!huboCambios) return;
    try {
      const [centro, resumen] = await Promise.all([leerCentroConTransito(id), leerResumenCentro(id)]);
      setCentros((lista) => (centro
        ? (lista || []).map((c) => (c.id === id ? centro : c))
        : (lista || []).filter((c) => c.id !== id)));
      setResumenes((r) => ({ ...r, [id]: resumen }));
    } catch {
      recargar();
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden text-[11px]">
      <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="text-[12px] font-bold text-gray-700 dark:text-gray-100 flex items-center gap-1.5 uppercase"><Building2 size={14} className="text-[#2383C2]" /> Tránsito por centro</h2>
        {!abierto && <button type="button" onClick={recargar} className="h-7 px-2 rounded border border-gray-300 dark:border-gray-600 font-semibold flex items-center gap-1 text-gray-600 dark:text-gray-300"><RefreshCw size={12} /> Actualizar</button>}
      </div>
      <div className="flex-1 overflow-auto p-3">
        {abierto ? (
          <DetalleCentro centro={abierto} onVolver={volver} />
        ) : centros === null ? (
          <p className="text-gray-400 italic">Cargando…</p>
        ) : (
          <table className="w-full text-left text-[12px] border border-gray-200 dark:border-gray-700">
            <thead className="bg-gray-100 dark:bg-gray-900 text-[10px] uppercase text-gray-600 dark:text-gray-400">
              <tr>{columnasVisibles.map((c) => <th key={c.key} className={`px-2 py-1.5 ${c.alinear || ''}`}>{c.label}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {centros.length === 0 && <tr><td colSpan={columnasVisibles.length} className="px-2 py-6 text-center text-gray-400 italic">Ningún centro tiene stock en tránsito ni dejado en el centro.</td></tr>}
              {centros.map((c) => {
                const r = resumenes[c.id];
                const dias = r ? diasEnTransito(r.masAntiguo) : null;
                const venc = estadoVencimiento(r?.proximoVencimiento);
                return (
                  <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer" onClick={() => setAbierto(c)}>
                    <td className="px-2 py-1.5 font-semibold text-[#2383C2] underline-offset-2 hover:underline">{c.centroNombre}</td>
                    {ver('productos') && <td className="px-2 py-1.5 text-right font-num">{c.productosDistintos}</td>}
                    {ver('unidades') && <td className="px-2 py-1.5 text-right font-num font-bold text-amber-600 dark:text-amber-400">{formatoCantidad(c.unidades)}</td>}
                    {ver('enCentro') && <td className="px-2 py-1.5 text-right font-num font-bold text-violet-600 dark:text-violet-400">{c.enCentro ? formatoCantidad(c.enCentro) : '—'}</td>}
                    {ver('antiguo') && <td className={`px-2 py-1.5 text-right font-num ${dias > 7 ? 'text-red-600 font-bold' : ''}`}>{r ? (dias ?? '—') : '…'}</td>}
                    {ver('vencimiento') && <td className="px-2 py-1.5 font-num">{r ? (r.proximoVencimiento || '—') : '…'} {venc.etiqueta && <span className={`px-1 rounded text-[9px] font-bold ${venc.badge}`}>{venc.etiqueta}</span>}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default CentrosBodega;
