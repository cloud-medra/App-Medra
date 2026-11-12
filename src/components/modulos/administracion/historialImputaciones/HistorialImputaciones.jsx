import { useState } from 'react';
import { CalendarSearch, History, Layers, Loader2, RefreshCw, Search, ShieldAlert, X } from 'lucide-react';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { useModal } from '../../../../context/ModalContext';
import PaginacionSimple from '../../../ui/PaginacionSimple';
import FiltroAnioMes from '../cargasConsolidado/components/FiltroAnioMes';
import FiltrosBusquedaOrigen from '../cargasConsolidado/components/FiltrosBusquedaOrigen';
import ImputadasUnificadasTable from '../cargasConsolidado/components/ImputadasUnificadasTable';
import { ORIGEN_LABEL } from '../cargasConsolidado/utils/normalizarFila';
import { aniosSeleccionables, idMes, mesesConsultables, periodoActualChile, pestanasPermitidas } from './logicaHistorial';
import { useHistorialImputacionesData } from './useHistorialImputacionesData';

// Historial de lo imputado, con la tabla y los filtros de la pestaña Imputadas
// de Cargas Consolidado (esos componentes no están migrados a los tokens de
// tipografía, así que `font-app` va solo en los elementos propios de esta
// pantalla). Solo la pestaña abierta se monta y lee Firestore.

const formatoNumero = (n) => Number(n || 0).toLocaleString('es-CL');
const claseBoton = 'font-app text-etiqueta h-7 px-2 rounded flex items-center gap-1 transition disabled:opacity-50 disabled:cursor-not-allowed';
const botonGris = `${claseBoton} bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-tinta-principal`;
const botonActivo = `${claseBoton} bg-[#2383C2] hover:bg-[#1d6fa5] text-white`;

const AvisoSinVenta = ({ cantidad }) => (
  <span className="text-amber-700 dark:text-amber-400">
    {cantidad === 1
      ? '1 registro sin venta no está incluido'
      : `${formatoNumero(cantidad)} registros sin venta no están incluidos`}
  </span>
);

const ResumenHistorial = ({ datos }) => (
  <>
    <span className="font-app text-pequeno text-tinta-secundaria">
      {formatoNumero(datos.totalFilas)} registro{datos.totalFilas === 1 ? '' : 's'}
    </span>
    {datos.mostrarTotales && datos.totales && (
      <span className="font-app text-etiqueta flex flex-wrap items-center justify-end gap-x-4">
        {datos.totales.sinVenta > 0 && <AvisoSinVenta cantidad={datos.totales.sinVenta} />}
        <span className="text-emerald-700 dark:text-emerald-400">Total venta: ${formatoNumero(datos.totales.totalVenta)}</span>
        <span className="text-tinta-principal">Total costo: ${formatoNumero(datos.totales.totalCosto)}</span>
      </span>
    )}
  </>
);

const NotaModo = ({ datos, anio, alcance }) => {
  let mensaje = null;
  let salir = null;
  if (datos.modo === 'mes') {
    mensaje = 'Buscando en los registros cargados de este mes: cualquier parte del nombre o admisión, sin distinguir tildes y sin nuevas lecturas.';
    salir = datos.salirBusquedaMes;
  } else if (datos.modo === 'anio') {
    mensaje = `Admisión ${datos.admisionAnio} en todo ${anio}.${datos.truncadoAnio ? ' Algún mes alcanzó el máximo de filas: puede haber más.' : ''}`;
    salir = datos.salirBusquedaAnio;
  } else if (alcance) {
    mensaje = `Incluye: ${alcance}.`;
  }
  if (!mensaje) return null;
  return (
    <div className="font-app text-pequeno text-tinta-secundaria px-3 py-1 border-b border-slate-200 dark:border-gray-700 flex items-center justify-between gap-2">
      <span>{mensaje}</span>
      {salir && (
        <button type="button" onClick={salir} className="flex items-center gap-1 text-[#2383C2] hover:underline">
          <X size={11} /> Volver al listado
        </button>
      )}
    </div>
  );
};

const PestanaHistorial = ({ pestana, anio, setAnio, mes, setMes, anios, meses }) => {
  const { confirmAction } = useModal();
  const datos = useHistorialImputacionesData({ origenes: pestana.origenes, anio, mes });

  const alBuscarEnMes = () => {
    const registros = datos.registrosPorCargar();
    if (registros === 0) {
      datos.activarBusquedaMes();
      return;
    }
    confirmAction(
      'Buscar en este mes',
      `Se van a cargar ${formatoNumero(registros)} registro${registros === 1 ? '' : 's'} (1 lectura por registro). Las búsquedas siguientes en este mes no generan lecturas.`,
      datos.activarBusquedaMes,
      { confirmText: 'Cargar y buscar' },
    );
  };

  // La nota de alcance solo aporta si General no incluye los 3 tipos.
  const alcance = pestana.id === 'general' && pestana.origenes.length < 3
    ? pestana.origenes.map((o) => ORIGEN_LABEL[o]).join(', ')
    : '';

  return (
    <div className="flex-grow flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-2">
        <FiltroAnioMes
          anio={anio}
          setAnio={setAnio}
          mes={mes}
          setMes={setMes}
          aniosDisponibles={anios}
          mesesDisponibles={meses}
          cargandoAnios={false}
          labelCampo="período"
          sinTodosLosMeses
        />
        <FiltrosBusquedaOrigen
          busqueda={datos.texto}
          setBusqueda={datos.setTexto}
          placeholder="Admisión o inicio del nombre..."
          ocultarOrigen
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={alBuscarEnMes}
            disabled={!datos.puedeBuscarMes || datos.modo === 'mes'}
            className={datos.modo === 'mes' ? botonActivo : botonGris}
            title="Carga el mes una sola vez para buscar apellidos o cualquier parte del nombre"
          >
            {datos.descargandoMes ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />} Buscar en este mes
          </button>
          <button
            type="button"
            onClick={datos.buscarEnAnio}
            disabled={!datos.puedeBuscarAnio}
            className={datos.modo === 'anio' ? botonActivo : botonGris}
            title="Busca el número de admisión exacto escrito en el buscador, en todos los meses del año"
          >
            {datos.buscandoAnio ? <Loader2 size={12} className="animate-spin" /> : <CalendarSearch size={12} />} Buscar en todo el año
          </button>
          <button
            type="button"
            onClick={datos.actualizar}
            disabled={!anio || datos.cargando}
            className={botonGris}
            title="Volver a leer los registros de este mes"
          >
            <RefreshCw size={12} /> Actualizar
          </button>
        </div>
      </div>

      <NotaModo datos={datos} anio={anio} alcance={alcance} />

      {datos.error && (
        <div className="font-app text-pequeno text-red-600 dark:text-red-400 px-3 py-1 border-b border-slate-200 dark:border-gray-700">
          No se pudieron leer algunos datos. Probá con "Actualizar".
        </div>
      )}

      {!anio ? (
        <div className="font-app text-pequeno text-tinta-atenuada flex-grow flex items-center justify-center">
          Elegí un año para ver las imputaciones.
        </div>
      ) : datos.cargando ? (
        <div className="font-app text-pequeno text-tinta-atenuada flex-grow flex items-center justify-center">
          <Loader2 size={14} className="animate-spin mr-1.5" /> Cargando imputaciones...
        </div>
      ) : (
        <>
          <ImputadasUnificadasTable filas={datos.filasPagina} encabezado={<ResumenHistorial datos={datos} />} />
          <PaginacionSimple
            pagina={datos.pagina}
            totalPaginas={datos.totalPaginas}
            totalFilas={datos.totalFilas}
            setPagina={datos.setPagina}
          />
        </>
      )}
    </div>
  );
};

const HistorialImputaciones = () => {
  const { hasAccesoProceso } = useGranularPermission();
  const pestanas = pestanasPermitidas(hasAccesoProceso);

  const [hoy] = useState(() => periodoActualChile());
  const [anio, setAnio] = useState(String(hoy.anio));
  const [mesElegido, setMes] = useState(idMes(hoy.mes));
  const [pestanaElegida, setPestanaElegida] = useState(null);

  const pestana = pestanas.find((p) => p.id === pestanaElegida) || pestanas[0] || null;
  const anios = aniosSeleccionables(hoy);
  const meses = anio ? mesesConsultables(anio, hoy) : [];
  const mes = meses.includes(mesElegido) ? mesElegido : (meses[meses.length - 1] || '');

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden p-0 relative">
      <div className="px-3 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="font-app text-subtitulo text-tinta-principal flex items-center gap-1.5">
          Historial de imputaciones
        </h2>
      </div>

      {!pestana ? (
        <div className="font-app text-pequeno text-tinta-secundaria flex-grow flex flex-col items-center justify-center text-center p-6 gap-1.5">
          <ShieldAlert size={22} className="text-amber-500" />
          Su perfil no tiene acceso a ninguna sección del Historial de imputaciones.
        </div>
      ) : (
        <>
          <div className="font-app text-etiqueta flex items-center gap-1 px-3 pt-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            {pestanas.map((p) => {
              const Icono = p.origen ? History : Layers;
              const activa = pestana.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPestanaElegida(p.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-md transition border-b-2 ${activa
                    ? 'text-[#2383C2] border-[#2383C2]'
                    : 'text-tinta-secundaria border-transparent hover:text-tinta-principal'}`}
                >
                  <Icono size={13} />
                  {p.label}
                </button>
              );
            })}
          </div>

          <PestanaHistorial
            key={pestana.id}
            pestana={pestana}
            anio={anio}
            setAnio={setAnio}
            mes={mes}
            setMes={setMes}
            anios={anios}
            meses={meses}
          />
        </>
      )}
    </div>
  );
};

export default HistorialImputaciones;
