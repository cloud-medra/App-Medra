import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarSearch, FileText, Loader2, Search } from 'lucide-react';
import { useUser } from '../../../../context/UserContext';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { useColumnResize } from '../../../../hooks/useColumnResize';
import { useColumnasPermitidas } from '../../../../hooks/useColumnasPermitidas';
import { ThRedimensionable, ColgroupRedimensionable, ThRelleno, TdRelleno } from '../../../ui/ThRedimensionable';
import { BotonRestablecerAnchos } from '../../../ui/BotonRestablecerAnchos';
import PaginacionSimple from '../../../ui/PaginacionSimple';
import { nombreDeMes } from '../../../../utils/ordenarMeses';
import { esExterno } from '../../../../../functions/permisos/nucleo.mjs';
import { useOrdenesExterno, useOrdenesInterno } from './useOrdenesCompraData';
import {
  CAMPOS_BUSQUEDA_EXTERNO, CAMPOS_BUSQUEDA_INTERNO, MESES, SIN_EMPRESA, TAMANO_PAGINA,
  aniosDisponibles, filtrarOrdenes, formatearFecha, formatearMontoOGuion,
} from './logicaOrdenesCompra';

// Portal Proveedores → Órdenes de Compra. Solo consulta, con dos caminos de datos:
//   - Externo: lee portal_ordenes_compra (su empresa), que no tiene paciente, médico,
//     admisión ni montos.
//   - Interno con permiso: lee las filas originales del mes y suma Nombre y montos.
// Son dos componentes para que la vista de un externo nunca monte la consulta interna.
const TH = 'px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700';
const TD = 'px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 truncate';
const SELECT = 'h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 disabled:opacity-50';

// `soloInternos`: un externo nunca ve la columna, aunque se le marque en permisos. Su dato
// tampoco existe en la copia que lee.
const COLUMNAS = [
  { key: 'paciente', label: 'Nombre', ancho: 180, min: 60, soloInternos: true, valor: (i) => i.paciente || '-' },
  { key: 'fecha_cx', label: 'Fecha Cx', ancho: 85, min: 60, valor: (i) => formatearFecha(i.fecha_cx) },
  { key: 'proveedor', label: 'Proveedor', ancho: 180, min: 60, soloInternos: true, valor: (i) => i.proveedor || '-' },
  { key: 'oc', label: 'OC', ancho: 95, min: 60, valor: (i) => i.oc || '-' },
  { key: 'codigo', label: 'Código', ancho: 90, min: 60, td: 'font-num text-emerald-600 dark:text-emerald-400', valor: (i) => i.codigo || '-' },
  { key: 'descripcion', label: 'Descripción', ancho: 260, min: 80, valor: (i) => i.descripcion || '-' },
  { key: 'cantidad', label: 'Cant.', ancho: 60, min: 50, th: 'text-center', td: 'text-center', valor: (i) => i.cantidad ?? '-' },
  { key: 'precio_u', label: 'Precio unitario', ancho: 105, min: 70, soloInternos: true, th: 'text-right', td: 'text-right font-num', valor: (i) => formatearMontoOGuion(i.precio_u) },
  { key: 'oc_monto', label: 'Total ítems', ancho: 105, min: 70, soloInternos: true, th: 'text-right', td: 'text-right font-num', valor: (i) => formatearMontoOGuion(i.oc_monto) },
  { key: 'estado', label: 'Estado', ancho: 110, min: 60, valor: (i) => i.estado || '-' },
  { key: 'numero_guia', label: 'N° Guía', ancho: 95, min: 60, valor: (i) => i.numero_guia || '-' },
  { key: 'numero_factura', label: 'N° Factura', ancho: 95, min: 60, valor: (i) => i.numero_factura || '-' },
];

const FiltroEmpresa = ({ value, onChange, empresas }) => {
  const opciones = useMemo(() => [...empresas].sort((a, b) => String(a.nombre).localeCompare(String(b.nombre))), [empresas]);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Empresa" className={`${SELECT} max-w-64`}>
      <option value="">Todas las empresas</option>
      <option value={SIN_EMPRESA}>Sin empresa reconocida</option>
      {opciones.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
    </select>
  );
};

// Tabla y filtros comunes. No lee datos: los recibe de la vista de cada tipo de usuario.
const PantallaOrdenes = ({ externo, userData, periodo, datos, camposBusqueda, placeholder, filtroExtra }) => {
  const { anio, mes, setAnio, setMes, busqueda, setBusqueda, pagina, setPagina } = periodo;
  const { filas, cargando, error, huboTope } = datos;

  const { columnasVisibles } = useColumnasPermitidas('/portalProveedores/ordenesCompra', 'tabla_registros', COLUMNAS);
  const columnas = useMemo(() => columnasVisibles.filter((c) => !externo || !c.soloInternos), [columnasVisibles, externo]);
  const { anchos, handleResize, restablecerAnchos, anchoTotalTabla, personalizados } =
    useColumnResize(columnas, { clave: 'portalOrdenesCompra', usuario: userData?.uid });

  const filtradas = useMemo(() => filtrarOrdenes(filas, busqueda, camposBusqueda), [filas, busqueda, camposBusqueda]);
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / TAMANO_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const filasPagina = filtradas.slice((paginaSegura - 1) * TAMANO_PAGINA, paginaSegura * TAMANO_PAGINA);
  const periodoElegido = Boolean(anio && mes);

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <header className="px-3 py-2 flex items-center gap-2 border-b border-slate-200 dark:border-gray-700">
        <FileText size={16} className="text-[#2383C2]" />
        <h2 className="text-[12px] font-normal text-slate-800 dark:text-gray-100 tracking-wide uppercase">Órdenes de Compra</h2>
      </header>

      <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 flex flex-wrap items-center gap-2 border-b border-gray-200 dark:border-gray-700">
        <select value={anio} onChange={(e) => { setAnio(e.target.value); setMes(''); setPagina(1); }} aria-label="Año" className={SELECT}>
          <option value="">Año</option>
          {aniosDisponibles().map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={mes} onChange={(e) => { setMes(e.target.value); setPagina(1); }} disabled={!anio} aria-label="Mes" className={SELECT}>
          <option value="">Mes</option>
          {MESES.map((m) => <option key={m} value={m}>{nombreDeMes(m)}</option>)}
        </select>
        {filtroExtra}
        <div className="relative w-64">
          <Search className="absolute left-2 top-1.5 text-gray-400 dark:text-gray-500" size={13} />
          <input
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
            disabled={!periodoElegido}
            placeholder={placeholder}
            aria-label="Buscar"
            className="w-full h-7 pl-7 pr-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 disabled:opacity-50"
          />
        </div>
        <BotonRestablecerAnchos onClick={restablecerAnchos} personalizados={personalizados} className="ml-auto h-7" />
      </div>

      {!periodoElegido ? (
        <div className="flex-grow flex flex-col items-center justify-center gap-2 text-center text-slate-400 dark:text-gray-500 p-8">
          <CalendarSearch size={26} className="text-slate-300 dark:text-gray-600" />
          <span className="text-[11px] font-medium">Selecciona un año y mes para ver las órdenes</span>
        </div>
      ) : cargando ? (
        <div className="flex-grow flex items-center justify-center gap-2 text-slate-400 dark:text-gray-500 text-[11px] p-8">
          <Loader2 size={14} className="animate-spin" /> Cargando órdenes...
        </div>
      ) : error ? (
        <div role="alert" className="flex-grow flex items-center justify-center gap-2 text-amber-700 dark:text-amber-400 text-[12px] p-8">
          <AlertTriangle size={14} /> No se pudieron cargar las órdenes. Si el problema continúa, contacta al administrador.
        </div>
      ) : (
        <>
          {huboTope && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-3 py-1 text-[10.5px] text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle size={11} /> Este período tiene muchos registros: puede que no se estén mostrando todos.
            </div>
          )}
          <div className="flex-grow min-h-0 overflow-auto">
            <table className="text-left text-[11px] border-collapse" style={{ tableLayout: 'fixed', width: anchoTotalTabla, minWidth: '100%' }}>
              <ColgroupRedimensionable columnas={columnas} anchos={anchos} relleno />
              <thead className="bg-slate-100 dark:bg-gray-900/80 sticky top-0 z-10">
                <tr className="text-slate-600 dark:text-gray-400 uppercase font-normal text-[10px] tracking-wider">
                  {columnas.map((col) => (
                    <ThRedimensionable key={col.key} col={col} anchos={anchos} onResize={handleResize} className={`${TH} ${col.th || ''}`}>
                      {col.label}
                    </ThRedimensionable>
                  ))}
                  <ThRelleno className="border-b border-slate-200 dark:border-gray-700" />
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800">
                {filasPagina.length === 0 ? (
                  <tr>
                    <td colSpan={columnas.length + 1} className="px-4 py-6 text-center text-slate-400 dark:text-gray-500">
                      No hay órdenes para los filtros seleccionados.
                    </td>
                  </tr>
                ) : filasPagina.map((item) => (
                  <tr key={item.id}>
                    {columnas.map((col) => {
                      const valor = col.valor(item);
                      return <td key={col.key} className={`${TD} ${col.td || 'text-slate-700 dark:text-gray-200'}`} title={String(valor)}>{valor}</td>;
                    })}
                    <TdRelleno className="border-b border-slate-200/60 dark:border-gray-700/70" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginacionSimple pagina={paginaSegura} totalPaginas={totalPaginas} totalFilas={filtradas.length} setPagina={setPagina} />
        </>
      )}
    </div>
  );
};

const usePeriodoElegido = () => {
  const [anio, setAnio] = useState('');
  const [mes, setMes] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  return { anio, mes, setAnio, setMes, busqueda, setBusqueda, pagina, setPagina };
};

const VistaExterna = ({ userData }) => {
  const periodo = usePeriodoElegido();
  const datos = useOrdenesExterno(userData, { anio: periodo.anio, mes: periodo.mes });
  return (
    <PantallaOrdenes
      externo
      userData={userData}
      periodo={periodo}
      datos={datos}
      camposBusqueda={CAMPOS_BUSQUEDA_EXTERNO}
      placeholder="Buscar OC, código, descripción, guía o factura..."
    />
  );
};

const VistaInterna = ({ userData }) => {
  const periodo = usePeriodoElegido();
  const [empresaId, setEmpresaId] = useState('');
  const { datos: empresas, cargado, error: errorEmpresas } = useCatalogo('empresas');
  const datos = useOrdenesInterno({ anio: periodo.anio, mes: periodo.mes, empresaId, empresas, empresasCargadas: cargado, errorEmpresas });
  return (
    <PantallaOrdenes
      externo={false}
      userData={userData}
      periodo={periodo}
      datos={datos}
      camposBusqueda={CAMPOS_BUSQUEDA_INTERNO}
      placeholder="Buscar nombre, OC, código, descripción, guía o factura..."
      filtroExtra={<FiltroEmpresa value={empresaId} onChange={(v) => { setEmpresaId(v); periodo.setPagina(1); }} empresas={empresas} />}
    />
  );
};

const OrdenesCompra = () => {
  const { userData } = useUser();
  return esExterno(userData) ? <VistaExterna userData={userData} /> : <VistaInterna userData={userData} />;
};

export default OrdenesCompra;
