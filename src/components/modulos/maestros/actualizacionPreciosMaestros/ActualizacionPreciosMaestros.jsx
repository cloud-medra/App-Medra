import { useRef } from 'react';
import { ShieldAlert, BadgeDollarSign, Download, Upload, AlertTriangle } from 'lucide-react';
import { useToast } from '../../../../context/ToastContext';
import { useUser } from '../../../../context/UserContext';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import Spinner from '../../../ui/Spinner';
import SelectorEmpresa from './components/SelectorEmpresa';
import DetalleImportacion from './components/DetalleImportacion';
import HistorialImportaciones from './components/HistorialImportaciones';
import { useActualizacionPrecios } from './hooks/useActualizacionPrecios';
import { descargarDetalleErrores } from './utils/descargarDetalleErrores';

const PATH_VISTA = "/maestros/actualizacionPreciosMaestros";

const claseTarjeta = 'bg-white dark:bg-gray-800 rounded border border-slate-200 dark:border-gray-700 p-2 shadow-2xs space-y-1.5';
const claseTituloPaso = 'block text-[9.5px] font-bold text-slate-800 dark:text-gray-200 uppercase tracking-wider';
const claseBoton = 'flex items-center justify-center gap-1.5 px-3 h-7 rounded font-bold text-[9.5px] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

// Actualización masiva de precios de maestros_codigos, empresa por empresa:
// 1) elegir empresa, 2) descargar el formato Excel con todos sus códigos,
// 3) importarlo completado → vista previa → confirmar (una transacción),
// 4) resumen final + historial de importaciones de la empresa.
const ActualizacionPreciosMaestros = () => {
  const { showToast } = useToast();
  const { userData } = useUser();
  const { hasPermission } = useGranularPermission();
  const inputArchivoRef = useRef(null);

  const {
    empresas, cargandoEmpresas, empresa, seleccionarEmpresa,
    codigosEmpresa, cargandoCodigos, historial, cargandoHistorial,
    descargando, descargarFormato,
    analizando, analisis, analizarArchivo, cancelarAnalisis,
    guardando, confirmarImportacion, errorGuardado,
    resumen, cerrarResumen
  } = useActualizacionPrecios({ userData, showToast });

  const tieneAcceso = hasPermission(PATH_VISTA, "navegacion", "ver_actualizacion_precios");
  const puedeDescargar = hasPermission(PATH_VISTA, "acciones", "btn_descargar_formato");
  const puedeImportar = hasPermission(PATH_VISTA, "acciones", "btn_importar_archivo");
  const puedeVerHistorial = hasPermission(PATH_VISTA, "historial");

  if (!tieneAcceso) {
    return (
      <div className="w-full h-80 flex flex-col items-center justify-center bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-4 text-center text-[10px]">
        <ShieldAlert size={24} className="text-amber-500 mb-1.5" />
        <h3 className="font-bold text-slate-800 dark:text-gray-100">Acceso Insuficiente</h3>
        <p className="text-slate-500 dark:text-gray-400 max-w-xs">
          No posee credenciales para la actualización de precios de Maestros.
        </p>
      </div>
    );
  }

  const ocupado = descargando || analizando || guardando;
  const sinCodigos = !cargandoCodigos && codigosEmpresa.length === 0;

  const handleArchivoSeleccionado = (e) => {
    const archivo = e.target.files?.[0];
    // Se limpia para poder volver a elegir el mismo archivo tras corregirlo.
    e.target.value = '';
    if (archivo) analizarArchivo(archivo);
  };

  const detalleVisible = analisis && !analisis.rechazo ? analisis : null;

  return (
    <div className="w-full h-full flex flex-col bg-slate-100/70 dark:bg-gray-900 text-[10px] overflow-hidden border border-slate-200 dark:border-gray-800 rounded-lg">

      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 px-3 py-2 flex items-center gap-2 shrink-0">
        <div className="w-7 h-7 rounded bg-[#2383C2]/10 text-[#2383C2] flex items-center justify-center border border-[#2383C2]/20">
          <BadgeDollarSign size={15} />
        </div>
        <h1 className="text-[11px] font-bold text-slate-900 dark:text-gray-100 tracking-tight">
          Actualización de Precios por Importación
        </h1>
        <span className="text-[8.5px] bg-slate-100 dark:bg-gray-700 font-num text-slate-600 dark:text-gray-300 px-1.5 py-0.2 rounded border border-slate-200 dark:border-gray-600 font-medium">
          MAESTROS / PRECIOS
        </span>
      </div>

      <div className="flex-grow overflow-auto p-2.5 space-y-2">

        {/* 1. Empresa */}
        <div className={claseTarjeta}>
          <span className={claseTituloPaso}>1. Seleccionar empresa</span>
          <SelectorEmpresa
            empresas={empresas}
            cargando={cargandoEmpresas}
            empresa={empresa}
            onSeleccionar={seleccionarEmpresa}
            bloqueado={ocupado}
          />
        </div>

        {/* 2 y 3. Formato e importación */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className={claseTarjeta}>
            <span className={claseTituloPaso}>2. Descargar formato</span>
            <p className="text-[9px] text-slate-500 dark:text-gray-400">
              {!empresa
                ? 'Seleccione una empresa para descargar su formato.'
                : cargandoCodigos
                  ? 'Cargando códigos de la empresa…'
                  : `Excel con los ${codigosEmpresa.length} códigos registrados de ${empresa.nombre}. Complete solo la columna "Nuevo precio" (resaltada).`}
            </p>
            {puedeDescargar && (
              <button
                type="button"
                onClick={descargarFormato}
                disabled={!empresa || cargandoCodigos || sinCodigos || ocupado}
                className={`${claseBoton} bg-[#2383C2] hover:bg-[#1d6fa5] text-white`}
              >
                {descargando || (empresa && cargandoCodigos) ? <Spinner size="xs" color="#ffffff" /> : <Download size={12} />}
                <span>Descargar formato</span>
              </button>
            )}
            {empresa && sinCodigos && (
              <p className="text-[9px] text-amber-600 dark:text-amber-400">Esta empresa no tiene códigos registrados en el maestro.</p>
            )}
          </div>

          <div className={claseTarjeta}>
            <span className={claseTituloPaso}>3. Importar archivo</span>
            <p className="text-[9px] text-slate-500 dark:text-gray-400">
              Suba el formato completado (.xlsx). Verá una vista previa antes de guardar; las filas sin nuevo precio o sin cambio se omiten.
            </p>
            {puedeImportar && (
              <>
                <input
                  ref={inputArchivoRef}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={handleArchivoSeleccionado}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => inputArchivoRef.current?.click()}
                  disabled={!empresa || ocupado}
                  className={`${claseBoton} bg-emerald-600 hover:bg-emerald-700 text-white`}
                >
                  {analizando ? <Spinner size="xs" color="#ffffff" /> : <Upload size={12} />}
                  <span>{analizando ? 'Analizando archivo…' : 'Importar archivo'}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Rechazo del archivo completo */}
        {analisis?.rechazo && (
          <div role="alert" className="p-2 rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 flex items-start gap-2">
            <AlertTriangle size={15} className="shrink-0 mt-px" />
            <div className="flex-grow">
              <p className="font-bold text-[10px]">Importación rechazada: {analisis.archivo}</p>
              <p className="text-[9.5px] mt-0.5">{analisis.rechazo}</p>
            </div>
            <button type="button" onClick={cancelarAnalisis} className="text-[9px] font-bold underline cursor-pointer shrink-0">Cerrar</button>
          </div>
        )}

        {/* Vista previa */}
        {detalleVisible && (
          <DetalleImportacion
            key={`preview-${detalleVisible.archivo}-${detalleVisible.actualizar.length}-${detalleVisible.errores.length}`}
            modo="preview"
            archivo={detalleVisible.archivo}
            actualizar={detalleVisible.actualizar}
            omitidos={detalleVisible.omitidos}
            errores={detalleVisible.errores}
            guardando={guardando}
            errorGuardado={errorGuardado}
            onConfirmar={confirmarImportacion}
            onCancelar={cancelarAnalisis}
            onDescargarErrores={() => descargarDetalleErrores({ errores: detalleVisible.errores, empresa, archivo: detalleVisible.archivo })}
          />
        )}

        {/* Resumen final */}
        {resumen && (
          <DetalleImportacion
            key={`resumen-${resumen.importacionId}`}
            modo="resumen"
            archivo={resumen.archivo}
            actualizar={resumen.actualizados}
            omitidos={resumen.omitidos}
            errores={resumen.errores}
            onCerrar={cerrarResumen}
            onDescargarErrores={() => descargarDetalleErrores({ errores: resumen.errores, empresa, archivo: resumen.archivo })}
          />
        )}

        {/* Historial */}
        {empresa && puedeVerHistorial && (
          <HistorialImportaciones historial={historial} cargando={cargandoHistorial} />
        )}
      </div>
    </div>
  );
};

export default ActualizacionPreciosMaestros;
