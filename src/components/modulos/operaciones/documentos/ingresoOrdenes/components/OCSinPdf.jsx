import { useDropzone } from 'react-dropzone';
import { Loader2, AlertCircle, RefreshCw, Search, Upload, CheckCircle2, XCircle, X, FileWarning, CalendarSearch, Database } from 'lucide-react';
import PaginacionSimple from '../../../../../ui/PaginacionSimple';
import { ZonaSubidaPdf } from '../../../shared/documentosAdmision/ZonaSubidaPdf';
import { useSubirPdfOC } from '../../../shared/ordenesOC/useSubirPdfOC';
import { TAMANO_MAXIMO_PDF_OC_MB } from '../../../shared/ordenesOC/ordenesOCHelpers';
import { useOCSinPdf } from '../hooks/useOCSinPdf';
import { useUser } from '../../../../../../context/UserContext';
import { useColumnResize } from '../../../../../../hooks/useColumnResize';
import { ThRedimensionable, ColgroupRedimensionable, ThRelleno, TdRelleno } from '../../../../../ui/ThRedimensionable';
import { BotonRestablecerAnchos } from '../../../../../ui/BotonRestablecerAnchos';
import { nombreDeMes } from '../../../../../../utils/ordenarMeses';

// Columnas redimensionables (useColumnResize las recuerda por usuario en
// este navegador). La de PDF tiene el botón de subir.
const COLUMNAS = [
  { key: 'oc', label: 'OC', ancho: 110, min: 60 },
  { key: 'admision', label: 'Admisión', ancho: 110, min: 60 },
  { key: 'paciente', label: 'Paciente', ancho: 220, min: 60 },
  { key: 'empresa', label: 'Empresa', ancho: 220, min: 60 },
  { key: 'fecha', label: 'Fecha', ancho: 110, min: 60 },
  { key: 'pdf', label: 'PDF', ancho: 90, min: 70, th: 'text-center' }
];
const TH = 'px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700';

const fechaCorta = (yyyyMmDd) => {
  const [y, m, d] = String(yyyyMmDd || '').split('-');
  return y && m && d ? `${d}-${m}-${y}` : '-';
};

// Varios valores en una celda: el primero y "+n" (todos en el title).
const Multi = ({ valores, mono = false }) => (
  <span className={mono ? 'font-num' : ''} title={valores.join(' · ')}>
    {valores[0] || '-'}
    {valores.length > 1 && <span className="ml-1 text-[9.5px] text-slate-400 dark:text-gray-500">+{valores.length - 1}</span>}
  </span>
);

// Fila: se puede soltar el PDF encima o elegirlo con "Subir".
const FilaOC = ({ fila, subiendo, deshabilitado, onArchivos }) => {
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: (aceptados, rechazados) => onArchivos([...aceptados, ...rechazados.map(r => r.file)]),
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
    noClick: true,
    noKeyboard: true,
    disabled: deshabilitado
  });
  const celda = 'px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 truncate';
  return (
    <tr
      {...getRootProps()}
      className={`transition ${isDragActive ? 'bg-[#2383C2]/10' : 'hover:bg-slate-50 dark:hover:bg-gray-700/40'}`}
      title={`Suelta aquí el PDF de la OC ${fila.oc}`}
    >
      <td className={`${celda} font-num font-semibold text-[#2383C2]`} title={fila.oc}>
        <input {...getInputProps()} />
        {fila.oc}
      </td>
      <td className={celda} title={fila.admisiones.join(' · ')}><Multi valores={fila.admisiones} /></td>
      <td className={celda} title={fila.pacientes.join(' · ')}><Multi valores={fila.pacientes} /></td>
      <td className={celda} title={fila.empresas.join(' · ')}><Multi valores={fila.empresas} /></td>
      <td className={celda} title={fila.fechas.map(fechaCorta).join(' · ')}><Multi valores={fila.fechas.map(fechaCorta)} /></td>
      <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-center">
        {subiendo ? (
          <span className="inline-flex items-center gap-1 text-[#2383C2] text-[10px]"><Loader2 size={11} className="animate-spin" /> {subiendo.porcentaje}%</span>
        ) : (
          <button
            type="button"
            onClick={open}
            disabled={deshabilitado}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 dark:border-gray-600 text-slate-600 dark:text-gray-300 hover:border-[#2383C2] hover:text-[#2383C2] disabled:opacity-40 disabled:cursor-not-allowed text-[10px]"
          >
            <Upload size={11} /> Subir
          </button>
        )}
      </td>
      <TdRelleno className="border-b border-slate-200/60 dark:border-gray-700/70" />
    </tr>
  );
};

const SeccionResumen = ({ titulo, items, tono, Icono }) => {
  if (!items.length) return null;
  const tonos = {
    ok: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300',
    aviso: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300',
    error: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
  };
  return (
    <details className={`px-3 py-1.5 border rounded-lg ${tonos[tono]}`} open={tono !== 'ok'}>
      <summary className="cursor-pointer font-semibold inline-flex items-center gap-1.5">
        <Icono size={12} /> {titulo} ({items.length})
      </summary>
      <ul className="mt-1 pl-5 list-disc space-y-0.5 max-h-32 overflow-auto">
        {items.map((it, i) => (
          <li key={`${it.nombre}_${i}`} className="break-all">
            {it.nombre}{it.oc ? <span className="opacity-75"> → OC {it.oc}</span> : null}{it.motivo && tono === 'error' ? <span className="opacity-75">: {it.motivo}</span> : null}
          </li>
        ))}
      </ul>
    </details>
  );
};

const selectClase = 'h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 outline-none focus:border-[#2383C2] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

// Pestaña "OC sin PDF" de Ingreso de Órdenes.
const OCSinPdf = () => {
  const d = useOCSinPdf();
  const { subirParaOC, subiendo } = useSubirPdfOC({ registro: d.registro, onRegistrado: d.onRegistrado });
  const ocupado = Boolean(d.progreso) || d.preparando || Boolean(subiendo);
  const usuario = useUser()?.userData?.uid;
  const { anchos, handleResize, restablecerAnchos, anchoTotalTabla, personalizados } =
    useColumnResize(COLUMNAS, { clave: 'ingresoOrdenes.ocSinPdf', usuario });

  const r = d.resumen;
  return (
    <div className="flex-grow flex flex-col min-h-0 overflow-hidden">
      <div className="shrink-0 max-h-[40%] overflow-y-auto bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 px-3 py-2 space-y-2">
        <ZonaSubidaPdf
          onArchivos={d.subirMasivo}
          deshabilitada={Boolean(subiendo) || d.preparando}
          progreso={d.progreso}
          tamanoMaximoMb={TAMANO_MAXIMO_PDF_OC_MB}
          textoAyuda={d.preparando
            ? 'Cargando el índice de OC...'
            : 'Subida masiva (no necesita mes): arrastra aquí los PDF de OC (OC_12345.pdf) o haz clic para elegirlos'}
        />
        {r && (
          <div className="space-y-1 text-[10px]">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-600 dark:text-gray-300">Resumen de la subida</span>
              <button type="button" onClick={d.cerrarResumen} title="Cerrar resumen" className="p-0.5 rounded text-slate-400 hover:text-slate-600"><X size={12} /></button>
            </div>
            <SeccionResumen titulo="Subidos" items={r.subidos} tono="ok" Icono={CheckCircle2} />
            <SeccionResumen titulo="Ya tenían PDF (omitidos)" items={r.yaTenian} tono="aviso" Icono={FileWarning} />
            <SeccionResumen titulo="OC no encontrada en el índice" items={r.noEncontrada} tono="error" Icono={XCircle} />
            <SeccionResumen titulo="Nombre no reconocido (se espera OC_número.pdf)" items={r.nombreNoReconocido} tono="error" Icono={XCircle} />
            <SeccionResumen titulo="No es PDF" items={r.noPdf} tono="error" Icono={XCircle} />
            <SeccionResumen titulo="Otros errores" items={r.otros} tono="error" Icono={XCircle} />
          </div>
        )}
      </div>

      <div className="shrink-0 bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 flex flex-wrap items-center gap-2 border-b border-gray-200 dark:border-gray-700">
        {d.cargandoPeriodos ? (
          <span className="flex items-center gap-1.5 h-7 text-[11px] text-slate-400 dark:text-gray-500">
            <Loader2 size={12} className="animate-spin" /> Cargando períodos...
          </span>
        ) : d.sinPeriodos ? (
          <span className={`flex items-center gap-1.5 h-7 text-[11px] ${d.errorPeriodos ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-gray-400'}`}>
            <AlertCircle size={12} /> {d.errorPeriodos || 'No hay órdenes importadas.'}
          </span>
        ) : (
          <>
            <select value={d.anio} onChange={(e) => d.setAnio(e.target.value)} disabled={d.cargando} className={selectClase}>
              <option value="">Año</option>
              {d.anios.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={d.mes} onChange={(e) => d.setMes(e.target.value)} disabled={!d.anio || d.cargando} className={selectClase}>
              <option value="">Mes</option>
              {d.meses.map(m => <option key={m} value={m}>{nombreDeMes(m)}</option>)}
            </select>
          </>
        )}
        <label className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={d.busqueda}
            onChange={(e) => d.setBusqueda(e.target.value)}
            disabled={!d.infoCarga}
            placeholder="Buscar en el mes: OC, admisión, paciente o empresa"
            className="h-7 pl-6 pr-2 w-72 disabled:opacity-50 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 outline-none focus:border-[#2383C2]"
          />
        </label>
        {d.infoCarga && (
          <span className="ml-auto flex items-center gap-2 text-[10px] text-slate-500 dark:text-gray-400">
            <span>{d.totalSinPdf} OC sin PDF · {d.infoCarga.gestiones} gestión(es) con OC en el mes</span>
            <span
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-gray-700/60"
              title="Lecturas de Firestore al cargar este mes (gestiones del mes + registro de PDF la primera vez)"
            >
              <Database size={10} /> {d.infoCarga.desdeCache && d.infoCarga.lecturas === 0 ? 'desde caché · 0 lecturas' : `${d.infoCarga.lecturas} lectura(s)`}
            </span>
            <button
              type="button"
              onClick={d.actualizarMes}
              disabled={d.cargando}
              title="Volver a leer este mes desde Firestore"
              className="p-1 rounded border border-slate-300 dark:border-gray-600 hover:bg-slate-100 dark:hover:bg-gray-700/50 disabled:opacity-40"
            >
              <RefreshCw size={10} />
            </button>
          </span>
        )}
        <BotonRestablecerAnchos onClick={restablecerAnchos} personalizados={personalizados} className={d.infoCarga ? '' : 'ml-auto'} />
      </div>

      {/* relative: los <input type="file"> de react-dropzone de cada fila van
          con position:absolute; sin un ancestro posicionado se ubican
          respecto del body y estiran la página principal. */}
      <div className="flex-grow min-h-0 overflow-auto relative">
        <table
          className="text-left text-[11px] border-collapse"
          style={{ tableLayout: 'fixed', width: anchoTotalTabla, minWidth: '100%' }}
        >
          <ColgroupRedimensionable columnas={COLUMNAS} anchos={anchos} relleno />
          <thead className="bg-slate-100 dark:bg-gray-900/80 sticky top-0 z-10">
            <tr className="text-slate-600 dark:text-gray-400 uppercase font-normal text-[10px] tracking-wider">
              {COLUMNAS.map(col => (
                <ThRedimensionable key={col.key} col={col} anchos={anchos} onResize={handleResize} className={`${TH} ${col.th || ''}`} title={col.label}>
                  {col.label}
                </ThRedimensionable>
              ))}
              <ThRelleno className="border-b border-slate-200 dark:border-gray-700" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/60 dark:divide-gray-700/50 bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-200">
            {!d.mesSeleccionado || d.cargando || d.error || d.filasPagina.length === 0 ? (
              <tr>
                <td colSpan={COLUMNAS.length + 1} className="px-4 py-8 text-center text-slate-400 dark:text-gray-500 text-xs">
                  {!d.mesSeleccionado ? (
                    <span className="inline-flex flex-col items-center gap-1.5">
                      <CalendarSearch size={22} className="text-slate-300 dark:text-gray-600" />
                      {d.sinPeriodos ? 'No hay órdenes importadas. Importa el Excel en Importar Detalles OC.' : 'Selecciona año y mes para ver las órdenes sin PDF'}
                    </span>
                  ) : d.cargando ? (
                    <span className="inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Cargando gestiones del mes...</span>
                  ) : d.error ? (
                    <span className="inline-flex items-center gap-2 text-red-600 dark:text-red-400">
                      <AlertCircle size={13} /> {d.error}
                      <button type="button" onClick={d.actualizarMes} className="flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 dark:border-gray-600 text-slate-600 dark:text-gray-300">
                        <RefreshCw size={10} /> Reintentar
                      </button>
                    </span>
                  ) : d.totalSinPdf === 0 ? 'Todas las OC de las gestiones de este mes ya tienen PDF (o aún no tienen OC asignada).' : 'Ninguna OC del mes coincide con la búsqueda.'}
                </td>
              </tr>
            ) : d.filasPagina.map(fila => (
              <FilaOC
                key={fila.oc}
                fila={fila}
                subiendo={subiendo?.oc === fila.oc ? subiendo : null}
                deshabilitado={ocupado}
                onArchivos={(archivos) => subirParaOC(fila.oc, archivos)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <PaginacionSimple pagina={d.pagina} totalPaginas={d.totalPaginas} totalFilas={d.totalFiltradas} setPagina={d.setPagina} />
    </div>
  );
};

export default OCSinPdf;
