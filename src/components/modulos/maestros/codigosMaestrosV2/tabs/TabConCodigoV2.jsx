import React, { useMemo, useState } from 'react';
import { History, Pencil, Plus, Settings, Trash2 } from 'lucide-react';
import { useCatalogo } from '../../../../../hooks/useCatalogo';
import { ordenarPor } from '../../../../../stores/catalogosStore';
import { useToast } from '../../../../../context/ToastContext';
import { useModal } from '../../../../../context/ModalContext';
import { useUser } from '../../../../../context/UserContext';
import { useGranularPermission } from '../../../../../hooks/useGranularPermission';
import { useColumnasPermitidas } from '../../../../../hooks/useColumnasPermitidas';
import { useColumnResize } from '../../../../../hooks/useColumnResize';
import { useImportExportConCodigo } from '../../codigosMaestros/components/tabConCodigo/UsoImportExportConCodigo';
import { TablaCodigos, PieTabla, Boton, BotonIcono } from '../ui/TablaCodigos';
import BarraFiltros from '../ui/BarraFiltros';
import { useFiltrosCodigos } from '../ui/useFiltrosCodigos';
import { usePaginacion } from '../ui/usePaginacion';
import PanelEdicionCodigo from '../PanelEdicionCodigo';
import PanelHistorial from '../PanelHistorial';
import PanelImportarExportar from '../PanelImportarExportar';
import { eliminarRegistroCodigo } from '../accionesCodigos';
import { COL_CODIGOS, formatearFecha, formatearPrecio, tieneCodigo } from '../camposCodigo';

// Mismas claves que la vista clásica (permisos `col_<key>`).
const COLUMNAS = [
  { key: 'numero', label: '#', ancho: 52, min: 36, align: 'right' },
  { key: 'codigo', label: 'Código', ancho: 110, min: 60 },
  { key: 'referencia', label: 'Referencia', ancho: 150, min: 80 },
  { key: 'descEmpresa', label: 'Desc. Empresa', ancho: 280, min: 80 },
  { key: 'empresa', label: 'Empresa', ancho: 200, min: 80 },
  { key: 'tipo', label: 'Tipo', ancho: 110, min: 60 },
  { key: 'segmento', label: 'Segmento', ancho: 120, min: 60 },
  { key: 'clase', label: 'Clase', ancho: 100, min: 60 },
  { key: 'descriptorMaestro', label: 'Descriptor Maestro', ancho: 240, min: 80 },
  { key: 'precioNeto', label: 'Precio Neto', ancho: 120, min: 80, align: 'right' },
  { key: 'estado', label: 'Estado', ancho: 110, min: 70 },
  { key: 'registradoPor', label: 'Registrado por', ancho: 150, min: 70 },
  { key: 'fecha', label: 'Fecha', ancho: 140, min: 90 },
  { key: 'acciones', label: 'Acciones', ancho: 100, min: 80, align: 'center' }
];

const CAMPOS_BUSQUEDA = [
  { value: 'codigo', label: 'Código' },
  { value: 'referencia', label: 'Referencia' },
  { value: 'empresa', label: 'Empresa' },
  { value: 'descriptorAuto', label: 'Descriptor' }
];

const TabConCodigoV2 = ({ rutaVista = '/maestros/codigosMaestros/conCodigo' } = {}) => {
  // La vista clásica pagina con consultas a Firestore (y consulta en cada
  // búsqueda); acá se filtra en memoria el listener compartido de
  // catalogosStore, que ya tiene todos los códigos: cero lecturas extra.
  const { datos: codigos, cargando } = useCatalogo('codigos');
  const { datos: empresasCatalogo } = useCatalogo('empresas');
  const registros = useMemo(
    () => codigos.filter((item) => item.tieneCodigo === true || tieneCodigo(item)).sort(ordenarPor('fechaRegistro', 'desc')),
    [codigos]
  );
  const empresas = useMemo(() => empresasCatalogo.filter((e) => e.nombre).sort(ordenarPor('nombre')), [empresasCatalogo]);

  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { userData } = useUser();
  const { hasPermission } = useGranularPermission();
  const PATH_VISTA = rutaVista;

  const puede = {
    registrar: hasPermission(PATH_VISTA, 'formulario_registro', 'btn_registrar'),
    actualizar: hasPermission(PATH_VISTA, 'formulario_registro', 'btn_actualizar'),
    editar: hasPermission(PATH_VISTA, 'tabla_datos', 'action_editar'),
    eliminar: hasPermission(PATH_VISTA, 'tabla_datos', 'action_eliminar'),
    exportar: hasPermission(PATH_VISTA, 'btn_configuracion', 'btn_exportar'),
    plantilla: hasPermission(PATH_VISTA, 'btn_configuracion', 'btn_descargar_plantilla'),
    importar: hasPermission(PATH_VISTA, 'btn_configuracion', 'btn_importar'),
    configuracion: hasPermission(PATH_VISTA, 'btn_configuracion'),
    formulario: hasPermission(PATH_VISTA, 'formulario_registro'),
    buscar: hasPermission(PATH_VISTA, 'barra_busqueda'),
    tabla: hasPermission(PATH_VISTA, 'tabla_datos'),
    log: hasPermission(PATH_VISTA, 'btn_log')
  };
  // Como en la vista clásica: editar abre el formulario y actualizar lo guarda.
  const puedeEditar = puede.editar && puede.formulario && puede.actualizar;

  const { columnasVisibles, ver } = useColumnasPermitidas(PATH_VISTA, 'tabla_datos', COLUMNAS);
  const { anchos, handleResize, restablecerAnchos, anchoTotalTabla } = useColumnResize(columnasVisibles);

  const f = useFiltrosCodigos(registros, CAMPOS_BUSQUEDA);
  const pag = usePaginacion(f.filtrados, f.clave);

  const io = useImportExportConCodigo({ registros: f.filtrados, userData, showToast, colBase: COL_CODIGOS, ver });

  const [panel, setPanel] = useState({ abierto: false, modo: 'nuevoConCodigo', registro: null });
  const [historial, setHistorial] = useState({ abierto: false, registro: null });

  const abrirPanel = (modo, registro = null) => setPanel({ abierto: true, modo, registro });
  const cerrarPanel = () => setPanel((p) => ({ ...p, abierto: false }));

  const eliminar = (item) => {
    if (!puede.eliminar) return;
    confirmAction(
      'Eliminar registro',
      `¿Eliminar el código ${item.codigo || ''}? Esta acción no se puede deshacer.`,
      async () => {
        try {
          await eliminarRegistroCodigo(item, userData);
          showToast('Registro eliminado correctamente', 'info');
        } catch {
          showToast('Error al eliminar', 'error');
        }
      },
      { confirmText: 'Eliminar', type: 'danger' }
    );
  };

  const renderCelda = (col, item, index) => {
    switch (col.key) {
      case 'numero': return <span className="tabular-nums text-slate-400">{pag.pagina * pag.tamano + index + 1}</span>;
      case 'codigo': return <span className="font-mono font-semibold text-slate-900 dark:text-gray-50">{item.codigo}</span>;
      case 'referencia': return <span className="font-medium" title={item.referencia}>{item.referencia}</span>;
      case 'descEmpresa': return <span title={item.descriptorEmpresa}>{item.descriptorEmpresa}</span>;
      case 'empresa': return <span title={item.empresa}>{item.empresa}</span>;
      case 'tipo': return item.tipo;
      case 'segmento': return item.segmento;
      case 'clase': return item.clase;
      case 'descriptorMaestro': return <span className="text-slate-500 dark:text-gray-400" title={item.descriptorAuto}>{item.descriptorAuto}</span>;
      case 'precioNeto': return <span className="tabular-nums font-medium">{formatearPrecio(item.precioNeto)}</span>;
      case 'estado': return (
        <span className="inline-flex items-center gap-1.5 text-[12px] text-emerald-700 dark:text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Con código
        </span>
      );
      case 'registradoPor': return <span className="text-slate-500 dark:text-gray-400" title={item.registradoPor}>{item.registradoPor || '—'}</span>;
      case 'fecha': return <span className="tabular-nums text-slate-500 dark:text-gray-400">{formatearFecha(item.fechaRegistro)}</span>;
      case 'acciones': return (
        <div className="flex items-center justify-center gap-0.5">
          {puede.log && <BotonIcono icono={History} title="Ver historial" onClick={() => setHistorial({ abierto: true, registro: item })} />}
          {puedeEditar && <BotonIcono icono={Pencil} tono="acento" title="Editar" onClick={() => abrirPanel('editarConCodigo', item)} />}
          {puede.eliminar && <BotonIcono icono={Trash2} tono="peligro" title="Eliminar" onClick={() => eliminar(item)} />}
        </div>
      );
      default: return null;
    }
  };

  return (
    <div className="h-full flex flex-col">
      <BarraFiltros
        f={f}
        camposBusqueda={CAMPOS_BUSQUEDA}
        conBusqueda={puede.buscar}
        acciones={(
          <>
            {puede.configuracion && <Boton icono={Settings} onClick={io.handleAbrirConfiguracion}>Importar / Exportar</Boton>}
            {puede.formulario && puede.registrar && <Boton variante="primario" icono={Plus} onClick={() => abrirPanel('nuevoConCodigo')}>Nuevo registro</Boton>}
          </>
        )}
      />

      {puede.tabla && (
        <>
          <TablaCodigos
            columnas={columnasVisibles}
            anchos={anchos}
            onResize={handleResize}
            anchoTotal={anchoTotalTabla}
            filas={pag.filas}
            renderCelda={renderCelda}
            onFilaClick={puedeEditar ? (item) => abrirPanel('editarConCodigo', item) : undefined}
            filaActiva={panel.abierto ? panel.registro?.id : null}
            cargando={cargando}
            mensajeVacio={f.hayFiltros ? 'Ningún registro coincide con la búsqueda.' : 'No hay registros con código.'}
          />
          <PieTabla
            pagina={pag.pagina}
            totalPaginas={pag.totalPaginas}
            total={f.filtrados.length}
            tamano={pag.tamano}
            onPagina={pag.irAPagina}
            onTamano={pag.setTamano}
            onRestablecerColumnas={restablecerAnchos}
          />
        </>
      )}

      <PanelEdicionCodigo
        abierto={panel.abierto}
        modo={panel.modo}
        registro={panel.registro}
        empresas={empresas}
        registros={codigos}
        userData={userData}
        onCerrar={cerrarPanel}
      />
      <PanelHistorial abierto={historial.abierto} registro={historial.registro} onCerrar={() => setHistorial((h) => ({ ...h, abierto: false }))} />
      <PanelImportarExportar
        abierto={io.showConfigDrawer}
        onCerrar={() => io.setShowConfigDrawer(false)}
        titulo="Registros con código"
        totalExportar={f.filtrados.length}
        onExportar={puede.exportar ? io.handleExportarDatos : undefined}
        onDescargarPlantilla={puede.plantilla ? io.handleDescargarPlantilla : undefined}
        importFile={io.importFile}
        onSelectFile={io.setImportFile}
        importing={io.importing}
        onEjecutarImportacion={puede.importar ? io.handleEjecutarImportacion : undefined}
        aceptar=".csv"
        progreso={io.progreso}
        resetProgreso={io.resetProgreso}
      />
    </div>
  );
};

export default TabConCodigoV2;
