import { useState } from 'react';
import { Loader2, AlertTriangle, CalendarSearch, ArrowLeft } from 'lucide-react';
import { useGranularPermission } from '../../../../../../hooks/useGranularPermission';
import PaginacionSimple from '../../../../../ui/PaginacionSimple';
import { useDocumentosSistemaPeriodo } from '../../hooks/useDocumentosSistemaPeriodo';
import { useIngresoOrdenesFiltros } from '../hooks/useIngresoOrdenesFiltros';
import IngresoOrdenesDetalleView from './IngresoOrdenesDetalleView';
import { useUser } from '../../../../../../context/UserContext';
import { useColumnResize } from '../../../../../../hooks/useColumnResize';
import { ThRedimensionable, ColgroupRedimensionable, ThRelleno, TdRelleno } from '../../../../../ui/ThRedimensionable';
import { BotonRestablecerAnchos } from '../../../../../ui/BotonRestablecerAnchos';
import { nombreDeMes } from '../../../../../../utils/ordenarMeses';

const formatearFechaCelda = (valor) => {
  if (!valor) return '-';
  const fecha = valor.toDate ? valor.toDate() : new Date(valor);
  if (isNaN(fecha.getTime())) return '-';
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${fecha.getFullYear()}`;
};

const TH = 'px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700';
const TD = 'px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 truncate';

// Columnas redimensionables (useColumnResize las recuerda por usuario en
// este navegador).
const COLUMNAS = [
  { key: 'admision', label: 'Admisión', ancho: 100, min: 60, td: 'font-semibold text-[#2383C2]', valor: (g) => g.admision || '-' },
  { key: 'paciente', label: 'Paciente', ancho: 200, min: 60, valor: (g) => g.paciente || '-' },
  { key: 'medico', label: 'Médico', ancho: 180, min: 60, valor: (g) => g.medico || '-' },
  { key: 'proveedor', label: 'Empresa', ancho: 200, min: 60, valor: (g) => g.proveedor || '-' },
  { key: 'fecha_cx', label: 'Fecha Cx', ancho: 100, min: 60, valor: (g) => formatearFechaCelda(g.fecha_cx) },
  { key: 'totalItems', label: 'N° Ítems', ancho: 80, min: 60, th: 'text-center', td: 'text-center font-semibold', valor: (g) => g.totalItems }
];

// Pestaña "Registros" de Ingreso de Órdenes: las filas importadas de
// documentos_sistema por año/mes. Solo se monta (y lee) al abrir la pestaña.
const RegistrosOrdenes = ({ pathVista }) => {
  const { hasPermission } = useGranularPermission();
  const [grupoSeleccionado, setGrupoSeleccionado] = useState(null);

  const {
    anio, setAnio, anios, cargandoAnios,
    mes, setMes, meses, cargandoMeses,
    filas, cargandoFilas, huboTope
  } = useDocumentosSistemaPeriodo();

  const {
    empresa, setEmpresa, opcionesEmpresas,
    gruposPagina, totalFilas,
    pagina, setPagina, totalPaginas
  } = useIngresoOrdenesFiltros(filas);
  const usuario = useUser()?.userData?.uid;
  const { anchos, handleResize, restablecerAnchos, anchoTotalTabla, personalizados } =
    useColumnResize(COLUMNAS, { clave: 'ingresoOrdenes.registros', usuario });

  return (
    <div className="flex-grow flex flex-col min-h-0 overflow-hidden">
      {grupoSeleccionado ? (
        <>
          <div className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 px-3 py-1.5 flex items-center gap-2">
            <button
              onClick={() => setGrupoSeleccionado(null)}
              className="p-1 rounded-md border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-700/50 transition"
              title="Volver"
            >
              <ArrowLeft size={13} />
            </button>
            <span className="text-[11px] text-slate-700 dark:text-gray-200 uppercase tracking-wide">Detalle de Orden</span>
          </div>
          <IngresoOrdenesDetalleView grupo={grupoSeleccionado} />
        </>
      ) : (
        <>
          {hasPermission(pathVista, 'barra_filtros') && (
            <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 flex flex-wrap items-center gap-2 border-b border-gray-200 dark:border-gray-700">
              <select
                value={anio}
                onChange={(e) => setAnio(e.target.value)}
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
                disabled={!anio || cargandoMeses}
                className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 outline-none focus:border-[#2383C2] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">{cargandoMeses ? 'Cargando meses...' : 'Mes'}</option>
                {meses.map((mm) => (
                  <option key={mm} value={mm}>{nombreDeMes(mm)}</option>
                ))}
              </select>

              <select
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
                disabled={!anio}
                className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 outline-none focus:border-[#2383C2] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">Empresa</option>
                {opcionesEmpresas.map((nombre) => (
                  <option key={nombre} value={nombre}>{nombre}</option>
                ))}
              </select>

              <BotonRestablecerAnchos onClick={restablecerAnchos} personalizados={personalizados} className="ml-auto" />
            </div>
          )}

          {!anio ? (
            <div className="flex-grow flex flex-col items-center justify-center gap-2 text-center text-slate-400 dark:text-gray-500 px-6">
              <CalendarSearch size={26} className="text-slate-300 dark:text-gray-600" />
              <span className="text-[11px] font-medium">Selecciona un año para ver los registros</span>
            </div>
          ) : cargandoFilas ? (
            <div className="flex-grow flex items-center justify-center gap-2 text-slate-400 dark:text-gray-500 text-[11px]">
              <Loader2 size={14} className="animate-spin" /> Cargando registros...
            </div>
          ) : (
            <>
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
                    {gruposPagina.length === 0 ? (
                      <tr>
                        <td colSpan={COLUMNAS.length + 1} className="px-4 py-6 text-center text-slate-400 dark:text-gray-500 text-xs">
                          No hay registros para los filtros seleccionados.
                        </td>
                      </tr>
                    ) : (
                      gruposPagina.map((grupo) => (
                        <tr
                          key={grupo.groupId}
                          onDoubleClick={() => setGrupoSeleccionado(grupo)}
                          className="hover:bg-slate-50 dark:hover:bg-gray-700/40 transition-all duration-150 cursor-pointer"
                          title="Doble clic para ver el detalle"
                        >
                          {COLUMNAS.map(col => {
                            const valor = col.valor(grupo);
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

export default RegistrosOrdenes;
