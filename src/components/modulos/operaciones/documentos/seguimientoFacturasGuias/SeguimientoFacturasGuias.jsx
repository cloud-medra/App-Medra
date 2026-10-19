import { useEffect, useState } from 'react';
import { Receipt, Truck, Loader2, AlertTriangle, CalendarSearch, ArrowLeft, Search, FileSpreadsheet, Sigma, CalendarRange } from 'lucide-react';
import { useGranularPermission } from '../../../../../hooks/useGranularPermission';
import PaginacionSimple from '../../../../ui/PaginacionSimple';
import { useDocumentosSistemaPeriodo } from '../hooks/useDocumentosSistemaPeriodo';
import { useSeguimientoFiltros } from './hooks/useSeguimientoFiltros';
import { useMesesConPendientes } from './hooks/useMesesConPendientes';
import { useUser } from '../../../../../context/UserContext';
import { useColumnResize } from '../../../../../hooks/useColumnResize';
import { ThRedimensionable, ColgroupRedimensionable, ThRelleno, TdRelleno } from '../../../../ui/ThRedimensionable';
import { BotonRestablecerAnchos } from '../../../../ui/BotonRestablecerAnchos';
import { nombreDeMes } from '../../../../../utils/ordenarMeses';
import { useToast } from '../../../../../context/ToastContext';
import { COLUMNAS, formatearMonedaCLP } from './utils/columnasSeguimiento';
import { exportarSeguimientoExcel } from './utils/exportarSeguimientoExcel';
import { filtroPendienteFactura } from '../resumenFacturacion/resumenFacturacionService';
import ResumenMensual from './ResumenMensual';

const PATH_VISTA = '/documentos/seguimientoFacturasGuias';

// Objetos estables a nivel de módulo (no se recrean en cada render) — se
// pasan tal cual a useDocumentosSistemaPeriodo(filtroServidor). NUMERO_GUIA
// se guarda siempre como texto recortado (nunca number) — ver CAMPOS_TEXTO
// en parsearFilaDetalleOC.js — así que 'in' cubre tanto vacío como el caso
// de una guía cargada literalmente como "0". Facturas muestra lo contrario
// de criterioFacturado (estado "Pendiente factura" o sin N° de factura), el
// mismo criterio del Resumen Mensual.
const CRITERIOS = {
  facturas: {
    id: 'facturas',
    label: 'Seguimiento de Facturas',
    Icon: Receipt,
    filtro: filtroPendienteFactura,
    // El selector de mes muestra solo meses con filas (useMesesConPendientes)
    // y la tabla no carga hasta elegir uno (no se lee el año completo).
    filtrarMeses: true,
    requiereMes: true,
    mensajeVacio: 'No hay registros pendientes de factura para los filtros seleccionados.'
  },
  guias: {
    id: 'guias',
    label: 'Seguimiento de Guías',
    Icon: Truck,
    filtro: { campo: 'numero_guia', operador: 'in', valor: ['', '0'] },
    mensajeVacio: 'No hay registros con despacho pendiente para los filtros seleccionados.'
  }
};

// Resumen Mensual no es un criterio de lista: tiene su propia pantalla.
const RESUMEN = { id: 'resumen', label: 'Resumen Mensual', Icon: CalendarRange };
const TARJETAS = [...Object.values(CRITERIOS), RESUMEN];

const TH = 'px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700';
const TD = 'px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 truncate';

const plural = (n, uno, varios) => `${n.toLocaleString('es-CL')} ${n === 1 ? uno : varios}`;

// Total de Monto OC de TODAS las filas filtradas (año + mes + empresa +
// búsqueda), no solo la página. Avisa solo si hay filas duplicadas de
// verdad (misma OC, código, lote, admisión, fecha y monto).
const ResumenTotal = ({ resumen }) => {
  const { total, registros, duplicados, filasDuplicadas, totalSinDuplicados } = resumen;
  const ej = duplicados[0];
  return (
    <div className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <div role="status" aria-label="Total Monto OC" className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#2383C2]/40 bg-[#2383C2]/5">
        <Sigma size={16} className="text-[#2383C2]" />
        <div className="leading-tight">
          <div className="text-[9.5px] uppercase tracking-wider text-slate-500 dark:text-gray-400">Total Monto OC</div>
          <div data-testid="total-monto-oc" className="text-[15px] font-bold font-num text-slate-800 dark:text-gray-100">{formatearMonedaCLP(total)}</div>
        </div>
        <div className="pl-3 ml-1 border-l border-slate-200 dark:border-gray-700 leading-tight">
          <div className="text-[9.5px] uppercase tracking-wider text-slate-500 dark:text-gray-400">Registros</div>
          <div data-testid="total-registros" className="text-[15px] font-bold font-num text-slate-800 dark:text-gray-100">{registros.toLocaleString('es-CL')}</div>
        </div>
      </div>
      {duplicados.length > 0 && (
        <div role="alert" className="flex items-start gap-1.5 text-[10.5px] text-amber-700 dark:text-amber-400 max-w-xl">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <span>
            {plural(filasDuplicadas, 'fila parece importada dos veces', 'filas parecen importadas dos veces')}: misma OC, código, lote, admisión, fecha y monto
            {' '}(ej. OC {ej.oc || '-'}, código {ej.codigo || '-'}, lote {ej.lote || '-'}, admisión {ej.admision || '-'}, {ej.fecha}: {ej.filas} filas de {formatearMonedaCLP(ej.monto)}).
            {' '}Sin esas copias el total sería <b className="font-num">{formatearMonedaCLP(totalSinDuplicados)}</b>.
          </span>
        </div>
      )}
    </div>
  );
};

const SelectorTipoSeguimiento = ({ onElegir }) => (
  <div className="flex-grow flex flex-col items-center justify-center gap-4 p-6">
    <span className="text-[11px] font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide">
      ¿Qué querés revisar?
    </span>
    <div className="flex flex-wrap items-center justify-center gap-3">
      {TARJETAS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onElegir(id)}
          className="w-52 flex flex-col items-center gap-2 px-5 py-6 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg shadow-sm hover:border-[#2383C2] hover:shadow-md transition"
        >
          <Icon size={24} className="text-[#2383C2]" />
          <span className="text-[12px] font-semibold text-slate-700 dark:text-gray-100">{label}</span>
        </button>
      ))}
    </div>
  </div>
);

const SeguimientoFacturasGuias = () => {
  const { hasPermission } = useGranularPermission();
  const { showToast } = useToast();
  const [exportando, setExportando] = useState(false);
  const [tipoId, setTipoId] = useState(null);
  const criterio = tipoId ? CRITERIOS[tipoId] : null;
  const vista = tipoId === RESUMEN.id ? RESUMEN : criterio;

  const {
    anio, setAnio, anios, cargandoAnios,
    mes, setMes, meses: mesesMarcador, cargandoMeses: cargandoMarcadores,
    filas, cargandoFilas, huboTope
  } = useDocumentosSistemaPeriodo(criterio?.filtro, { requiereMes: !!criterio?.requiereMes, activo: !!criterio });
  const faltaMes = !!criterio?.requiereMes && !mes;

  const {
    empresa, setEmpresa, opcionesEmpresas,
    busqueda, setBusqueda,
    filasFiltradas, filasPagina, totalFilas, resumen,
    pagina, setPagina, totalPaginas
  } = useSeguimientoFiltros(filas);
  const { meses, cargando: cargandoConteos } = useMesesConPendientes({
    anio, meses: mesesMarcador, cargandoMeses: cargandoMarcadores, filtro: criterio?.filtrarMeses ? criterio.filtro : null
  });
  const cargandoMeses = cargandoMarcadores || cargandoConteos;
  const sinMeses = !!anio && !cargandoMeses && meses.length === 0;

  // Si el mes elegido ya no está entre los disponibles, queda sin mes: la
  // tabla vuelve al mensaje, sin cargar nada.
  useEffect(() => {
    if (cargandoMeses || !mes || meses.includes(mes)) return;
    setMes('');
  }, [cargandoMeses, mes, meses, setMes]);

  const usuario = useUser()?.userData?.uid;
  const { anchos, handleResize, restablecerAnchos, anchoTotalTabla, personalizados } =
    useColumnResize(COLUMNAS, { clave: 'seguimientoFacturasGuias', usuario });

  const exportar = async () => {
    if (filasFiltradas.length === 0) return;
    setExportando(true);
    try {
      const periodo = [anio, mes, empresa].filter(Boolean).join('_').replace(/[^\w-]+/g, '-');
      await exportarSeguimientoExcel(filasFiltradas, {
        total: resumen.total,
        nombreArchivo: `seguimiento_${tipoId}_${periodo}.xlsx`
      });
    } catch (err) {
      console.error('Error al exportar a Excel:', err);
      showToast('No se pudo exportar a Excel', 'error');
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-lg shadow-sm overflow-hidden font-sans text-[11px]">
      <header className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 px-3 py-2 flex items-center gap-2">
        {vista && (
          <button
            onClick={() => setTipoId(null)}
            className="p-1 rounded-md border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-700/50 transition"
            title="Volver"
          >
            <ArrowLeft size={13} />
          </button>
        )}
        {vista ? <vista.Icon size={16} className="text-[#2383C2]" /> : <Receipt size={16} className="text-[#2383C2]" />}
        <span className="text-[12px] font-normal text-slate-800 dark:text-gray-100 tracking-wide uppercase">
          {vista ? vista.label : 'Seguimiento de Facturas y Guías'}
        </span>
      </header>

      {!vista ? (
        <SelectorTipoSeguimiento onElegir={setTipoId} />
      ) : vista === RESUMEN ? (
        <ResumenMensual />
      ) : (
        <>
          {hasPermission(PATH_VISTA, 'barra_filtros') && (
            <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 flex flex-wrap items-center gap-2 border-b border-gray-200 dark:border-gray-700">
              <select
                value={anio}
                onChange={(e) => setAnio(e.target.value)}
                aria-label="Año"
                disabled={cargandoAnios}
                className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 outline-none focus:border-[#2383C2] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">{cargandoAnios ? 'Cargando años...' : 'Año'}</option>
                {anios.map((yyyy) => (
                  <option key={yyyy} value={yyyy}>{yyyy}</option>
                ))}
              </select>

              <select
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                aria-label="Mes"
                disabled={!anio || cargandoMeses || sinMeses}
                className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 outline-none focus:border-[#2383C2] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">{cargandoMeses ? 'Cargando meses...' : sinMeses ? 'Sin meses pendientes' : 'Mes'}</option>
                {meses.map((mm) => (
                  <option key={mm} value={mm}>{nombreDeMes(mm)}</option>
                ))}
              </select>

              <select
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
                disabled={!anio || faltaMes}
                className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 outline-none focus:border-[#2383C2] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">Empresa</option>
                {opcionesEmpresas.map((nombre) => (
                  <option key={nombre} value={nombre}>{nombre}</option>
                ))}
              </select>

              <div className="relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <input
                  type="search"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  disabled={!anio}
                  placeholder="Buscar (admisión, OC, lote, atributo, monto…)"
                  aria-label="Buscar"
                  className="h-7 w-64 pl-6 pr-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 outline-none focus:border-[#2383C2] disabled:opacity-50"
                />
              </div>

              <button
                type="button"
                onClick={exportar}
                disabled={!anio || cargandoFilas || exportando || filasFiltradas.length === 0}
                title="Exporta todos los registros filtrados (no solo esta página)"
                className="h-7 px-2.5 flex items-center gap-1.5 rounded border border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-white dark:bg-gray-900 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-[11px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exportando ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />} Exportar Excel
              </button>

              <BotonRestablecerAnchos onClick={restablecerAnchos} personalizados={personalizados} className="ml-auto" />
            </div>
          )}

          {!anio ? (
            <div className="flex-grow flex flex-col items-center justify-center gap-2 text-center text-slate-400 dark:text-gray-500 px-6">
              <CalendarSearch size={26} className="text-slate-300 dark:text-gray-600" />
              <span className="text-[11px] font-medium">Selecciona un año para ver los registros</span>
            </div>
          ) : faltaMes ? (
            <div className="flex-grow flex flex-col items-center justify-center gap-2 text-center text-slate-400 dark:text-gray-500 px-6">
              <CalendarSearch size={26} className="text-slate-300 dark:text-gray-600" />
              <span className="text-[11px] font-medium">{sinMeses ? criterio.mensajeVacio : 'Selecciona un mes para ver los registros'}</span>
            </div>
          ) : cargandoFilas ? (
            <div className="flex-grow flex items-center justify-center gap-2 text-slate-400 dark:text-gray-500 text-[11px]">
              <Loader2 size={14} className="animate-spin" /> Cargando registros...
            </div>
          ) : (
            <>
              <ResumenTotal resumen={resumen} />
              {huboTope && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-3 py-1 text-[10.5px] text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle size={11} /> Este período tiene muchos registros — puede que no se estén mostrando todos.
                </div>
              )}
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
                  <tbody className="divide-y divide-slate-200/60 dark:divide-gray-700/50 bg-white dark:bg-gray-800">
                    {filasPagina.length === 0 ? (
                      <tr>
                        <td colSpan={COLUMNAS.length + 1} className="px-4 py-6 text-center text-slate-400 dark:text-gray-500 text-xs">
                          {criterio.mensajeVacio}
                        </td>
                      </tr>
                    ) : (
                      filasPagina.map((item) => (
                        <tr key={item.refPath} className="hover:bg-slate-50 dark:hover:bg-gray-700/40 transition-all duration-150">
                          {COLUMNAS.map(col => {
                            const valor = col.valor(item);
                            return <td key={col.key} className={`${TD} ${col.td || ''}`} title={String(valor)}>{valor}</td>;
                          })}
                          <TdRelleno className="border-b border-slate-200/60 dark:border-gray-700/70" />
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <PaginacionSimple pagina={pagina} totalPaginas={totalPaginas} totalFilas={totalFilas} setPagina={setPagina} />
            </>
          )}
        </>
      )}
    </div>
  );
};

export default SeguimientoFacturasGuias;
