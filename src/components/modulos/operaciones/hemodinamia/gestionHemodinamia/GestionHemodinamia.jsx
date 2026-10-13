import React, { useState, useRef } from 'react';
import { Calendar, Settings, FilterX, RefreshCw, ArrowLeft, Save, AlertTriangle, X, Hash, Loader2 } from 'lucide-react';
import { useGranularPermission } from '../../../../../hooks/useGranularPermission';
import { BuscadorConLimpiar } from '../../../../ui/BuscadorConLimpiar';
import Spinner from '../../../../ui/Spinner';
import { DrawersOverlay, LogDrawer, ConfigDrawer } from './GestionesHemodinamiaDrawers';
import { useGestionesHemodinamia } from './hooks/useGestionesHemodinamia';
import { formatearFecha } from './utils/gestionesImportExport';
import GestionesHemodinamiaForm from './components/GestionesHemodinamiaForm';
import { GestionesHemodinamiaTable } from './components/GestionesHemodinamiaTable';
import GestionesHemodinamiaDetalleView from './components/GestionesHemodinamiaDetalleView';
import { EstadoFilterDropdown } from './components/EstadoFilterDropdown';
import { SincronizarOCResumenModal } from '../../shared/ocIndex/SincronizarOCResumenModal';
import { useSincronizarOC } from '../../shared/ocIndex/useSincronizarOC';
import { useMarcarOcPendiente } from '../../shared/ocIndex/useMarcarOcPendiente';
import { useUser } from '../../../../../context/UserContext';
import { esRolAdministrador } from '../../../../../../functions/permisos/nucleo.mjs';

const PATH_VISTA = "/hemodinamia/gestionHemodinamia";

const NOMBRES_MESES = {
  "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril",
  "05": "Mayo", "06": "Junio", "07": "Julio", "08": "Agosto",
  "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre"
};

const GestionHemodinamia = () => {
  const { hasPermission } = useGranularPermission();
  const {
    implantes,
    hayMasGestiones,
    cargarMasGestiones,
    implantesFiltrados,
    formData,
    setFormData,
    busqueda,
    setBusqueda,
    filtroAnio,
    setFiltroAnio,
    filtroMes,
    setFiltroMes,
    filtroDia,
    setFiltroDia,
    filtroSoloHastaHoy,
    setFiltroSoloHastaHoy,
    opcionesFechas,
    limpiarFiltrosFecha,
    opcionesEstados,
    filtrosEstados,
    toggleFiltroEstado,
    limpiarFiltroEstados,
    editingId,
    cargando,
    showLogDrawer,
    setShowLogDrawer,
    selectedImplanteForLog,
    logsList,
    loadingLogs,
    showConfigDrawer,
    setShowConfigDrawer,
    sincronizando,
    handleSincronizarVinculados,
    importFile,
    setImportFile,
    importing,
    handleCopiarTexto,
    handleIdChange,
    handleGuardar,
    guardarDesdeDetalle,
    agregarEmpresaFechaDesdeDetalle,
    handleDelete,
    iniciarEdicion,
    cancelarEdicion,
    abrirHistorialLogs,
    cargarLogsDeImplante,
    handleExportarDatos,
    handleDescargarPlantilla,
    handleEjecutarImportacion
  } = useGestionesHemodinamia();
  // Igual que Implantes: Sincronizar OC (índice de Importar Detalles OC) y
  // Marcar OC pendiente (rol Administrador/Desarrollador + acción denegada por defecto).
  const { sincronizandoOC, handleSincronizarOC, resumenOC, cerrarResumenOC } = useSincronizarOC({ modulo: 'hemodinamia' });
  const { userData } = useUser();
  const esAdminODev = esRolAdministrador(userData?.rol) && hasPermission(PATH_VISTA, 'drawer_configuracion', 'btn_marcar_oc_pendiente');
  const marcarOcPendiente = useMarcarOcPendiente({ habilitado: esAdminODev && showConfigDrawer, modulo: 'hemodinamia' });

  const [registroSeleccionado, setRegistroSeleccionado] = useState(null);
  const detalleRef = useRef(null);
  const [showConfirmSalir, setShowConfirmSalir] = useState(false);

  const handleGuardarDetalle = async (datosActualizados) => {
    await guardarDesdeDetalle(datosActualizados);
    setRegistroSeleccionado(null);
  };

  const handleIntentarVolver = () => {
    if (detalleRef.current?.hayCambiosSinGuardar?.()) {
      setShowConfirmSalir(true);
    } else {
      setRegistroSeleccionado(null);
    }
  };

  const handleGuardarYSalir = () => {
    setShowConfirmSalir(false);
    detalleRef.current?.guardarTodo();
  };

  const handleSalirSinGuardar = () => {
    setShowConfirmSalir(false);
    setRegistroSeleccionado(null);
  };

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden p-0 relative text-[11px]">
      {cargando && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-500/20 dark:bg-black/40 backdrop-blur-[2px]">
          <div className="bg-white/90 dark:bg-gray-800/90 p-4 rounded-xl shadow-xl flex flex-col items-center gap-3">
            <Spinner size="md" color="#2383C2" />
            <h3 className="text-[#2383C2] font-bold text-[13px]">Procesando...</h3>
          </div>
        </div>
      )}

      {showConfirmSalir && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-[1px]">
          <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2 bg-amber-50/60 dark:bg-amber-950/20">
              <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
              <h3 className="text-[12px] font-bold text-gray-800 dark:text-gray-100">Cambios sin guardar</h3>
              <button
                onClick={() => setShowConfirmSalir(false)}
                className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
              >
                <X size={15} />
              </button>
            </div>

            <div className="px-4 py-3">
              <p className="text-[11px] text-gray-600 dark:text-gray-300">
                Tienes modificaciones que no se han guardado. ¿Qué deseas hacer antes de salir?
              </p>
            </div>

            <div className="px-4 py-3 bg-gray-50/60 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700 flex flex-col gap-2">
              <button
                onClick={handleGuardarYSalir}
                className="w-full h-8 bg-[#2383C2] hover:bg-[#1d6fa5] text-white rounded font-semibold flex items-center justify-center gap-1.5 transition text-[11px]"
              >
                <Save size={13} /> Guardar y salir
              </button>
              <button
                onClick={handleSalirSinGuardar}
                className="w-full h-8 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50 text-red-600 dark:text-red-400 rounded font-semibold transition text-[11px]"
              >
                Salir sin guardar
              </button>
              <button
                onClick={() => setShowConfirmSalir(false)}
                className="w-full h-8 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium transition text-[11px]"
              >
                Seguir editando
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="px-3 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="text-[12px] font-bold text-gray-700 dark:text-gray-100 flex items-center gap-1.5">
          {registroSeleccionado && (
            <button
              onClick={handleIntentarVolver}
              className="p-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition shadow-xs mr-1"
              title="Volver"
            >
              <ArrowLeft size={13} />
            </button>
          )}
          <Calendar size={15} className="text-[#2383C2]" />
          {registroSeleccionado
            ? "DETALLE DE GESTION DE HEMODINAMIA"
            : editingId ? "EDITAR GESTION DE HEMODINAMIA" : "GESTIONES DE HEMODINAMIA"}
        </h2>

        {registroSeleccionado ? (
          <button
            onClick={() => detalleRef.current?.guardarTodo()}
            className="px-3 py-1 bg-[#2383C2] hover:bg-[#1d6fa5] text-white rounded font-semibold flex items-center gap-1.5 transition text-[11px] shadow-xs active:scale-[0.98]"
          >
            <Save size={13} />
            <span>Guardar Todo</span>
          </button>
        ) : (
          <div className="flex items-center gap-1">
            {hasPermission(PATH_VISTA, "header", "btn_configuracion") && (
              <button
                onClick={handleSincronizarVinculados}
                disabled={sincronizando}
                className="p-1 rounded-md text-gray-500 hover:text-[#2383C2] dark:text-gray-400 dark:hover:text-[#2383C2] hover:bg-gray-100 dark:hover:bg-gray-700 transition disabled:opacity-50"
                title="Sincronizar datos vinculados desde ReportesInfo"
              >
                {sincronizando ? "Sincronizando..." : <RefreshCw size={15} />}
              </button>
            )}

            {hasPermission(PATH_VISTA, "header", "btn_configuracion") && (
              <button
                onClick={handleSincronizarOC}
                disabled={sincronizandoOC}
                className="p-1 rounded-md text-gray-500 hover:text-[#2383C2] dark:text-gray-400 dark:hover:text-[#2383C2] hover:bg-gray-100 dark:hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-wait"
                title={sincronizandoOC ? "Sincronizando OC..." : "Sincronizar OC desde Importar Detalles OC"}
                aria-label="Sincronizar OC"
              >
                {sincronizandoOC ? <Loader2 size={15} className="animate-spin" /> : <Hash size={15} />}
              </button>
            )}

            {hasPermission(PATH_VISTA, "header", "btn_configuracion") && (
              <button
                onClick={() => setShowConfigDrawer(true)}
                className="p-1 rounded-md text-gray-500 hover:text-[#2383C2] dark:text-gray-400 dark:hover:text-[#2383C2] hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                title="Configuración de Gestiones (Importar/Exportar)"
              >
                <Settings size={15} />
              </button>
            )}
          </div>
        )}
      </div>

      {registroSeleccionado ? (
        <GestionesHemodinamiaDetalleView
          ref={detalleRef}
          item={registroSeleccionado}
          todosLosRegistros={implantes}
          onGuardar={handleGuardarDetalle}
          onAgregarEmpresaFecha={agregarEmpresaFechaDesdeDetalle}
          onCancelar={handleIntentarVolver}
          logsList={logsList}
          loadingLogs={loadingLogs}
          cargarLogsDeImplante={cargarLogsDeImplante}
          formatearFecha={formatearFecha}
          handleCopiarTexto={handleCopiarTexto}
        />
      ) : (
        <>
          {hasPermission(PATH_VISTA, "formulario_registro") && (
            <GestionesHemodinamiaForm
              formData={formData}
              setFormData={setFormData}
              editingId={editingId}
              handleGuardar={handleGuardar}
              handleIdChange={handleIdChange}
              cancelarEdicion={cancelarEdicion}
            />
          )}

          {hasPermission(PATH_VISTA, "barra_busqueda") && (
            <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 flex flex-wrap items-center gap-2 border-b border-gray-200 dark:border-gray-700">

              <BuscadorConLimpiar value={busqueda} onChange={setBusqueda} placeholder="Buscar por ID, nombre o empresa..." />

              <div className="flex items-center gap-1.5">
                <select
                  value={filtroAnio}
                  onChange={e => setFiltroAnio(e.target.value)}
                  className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 outline-none focus:border-[#2383C2] cursor-pointer"
                >
                  <option value="">Año (Todos)</option>
                  {opcionesFechas.anios.map(yyyy => (
                    <option key={yyyy} value={yyyy}>{yyyy}</option>
                  ))}
                </select>

                <select
                  value={filtroMes}
                  onChange={e => setFiltroMes(e.target.value)}
                  className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 outline-none focus:border-[#2383C2] cursor-pointer"
                >
                  <option value="">Mes (Todos)</option>
                  {opcionesFechas.meses.map(mm => (
                    <option key={mm} value={mm}>{NOMBRES_MESES[mm] || mm}</option>
                  ))}
                </select>

                <select
                  value={filtroDia}
                  onChange={e => setFiltroDia(e.target.value)}
                  className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 outline-none focus:border-[#2383C2] cursor-pointer"
                >
                  <option value="">Día (Todos)</option>
                  {opcionesFechas.dias.map(dd => (
                    <option key={dd} value={dd}>{dd}</option>
                  ))}
                </select>

                <EstadoFilterDropdown
                  opcionesEstados={opcionesEstados}
                  filtrosEstados={filtrosEstados}
                  toggleFiltroEstado={toggleFiltroEstado}
                  limpiarFiltroEstados={limpiarFiltroEstados}
                />

                <div className="flex items-center h-7 border border-gray-300 dark:border-gray-600 rounded overflow-hidden text-[11px] shrink-0">
                  <button
                    type="button"
                    onClick={() => setFiltroSoloHastaHoy(true)}
                    title="Solo muestra filas con fecha de hoy o anterior (oculta fechas futuras)"
                    className={`h-full px-2 font-medium transition ${filtroSoloHastaHoy
                      ? 'bg-[#2383C2] text-white'
                      : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                  >
                    Hasta hoy
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroSoloHastaHoy(false)}
                    title="Muestra todas las fechas, incluidas las futuras"
                    className={`h-full px-2 font-medium border-l border-gray-300 dark:border-gray-600 transition ${!filtroSoloHastaHoy
                      ? 'bg-[#2383C2] text-white'
                      : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                  >
                    Todos los días
                  </button>
                </div>

                {(filtroAnio || filtroMes || filtroDia) && (
                  <button
                    onClick={limpiarFiltrosFecha}
                    className="h-7 px-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded font-medium flex items-center gap-1 transition"
                    title="Limpiar filtros de fecha"
                  >
                    <FilterX size={12} /> Limpiar
                  </button>
                )}
              </div>
            </div>
          )}

          {hasPermission(PATH_VISTA, "tabla_datos") && (
            <>
              <GestionesHemodinamiaTable
                implantesFiltrados={implantesFiltrados}
                handleCopiarTexto={handleCopiarTexto}
                abrirHistorialLogs={abrirHistorialLogs}
                iniciarEdicion={iniciarEdicion}
                handleDelete={handleDelete}
                onRowDoubleClick={(item) => setRegistroSeleccionado(item)}
              />
              {hayMasGestiones && (
                <div className="flex justify-center py-1.5 border-t border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={cargarMasGestiones}
                    className="h-7 px-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded text-[11px] font-medium transition"
                    title="Se muestran las gestiones más recientes; los filtros aplican solo sobre las cargadas"
                  >
                    Cargar gestiones anteriores
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      <SincronizarOCResumenModal resumen={resumenOC} onClose={cerrarResumenOC} modulo="Hemodinamia" />

      <DrawersOverlay
        show={showLogDrawer || showConfigDrawer}
        onClick={() => {
          setShowLogDrawer(false);
          setShowConfigDrawer(false);
        }}
      />

      <LogDrawer
        show={showLogDrawer}
        onClose={() => setShowLogDrawer(false)}
        selectedImplante={selectedImplanteForLog}
        logsList={logsList}
        loadingLogs={loadingLogs}
        formatearFecha={formatearFecha}
      />

      <ConfigDrawer
        show={showConfigDrawer}
        onClose={() => setShowConfigDrawer(false)}
        totalImplantes={implantes.length}
        onExportar={handleExportarDatos}
        onDescargarPlantilla={handleDescargarPlantilla}
        importFile={importFile}
        onSelectFile={setImportFile}
        importing={importing}
        onEjecutarImportacion={handleEjecutarImportacion}
        marcarOcPendiente={esAdminODev ? marcarOcPendiente : null}
      />
    </div>
  );
};

export default GestionHemodinamia;
