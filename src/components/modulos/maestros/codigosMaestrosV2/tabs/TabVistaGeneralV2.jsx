import React, { useMemo, useState } from 'react';
import { History, Pencil } from 'lucide-react';
import { useCatalogo } from '../../../../../hooks/useCatalogo';
import { ordenarPor } from '../../../../../stores/catalogosStore';
import { useUser } from '../../../../../context/UserContext';
import { useGranularPermission } from '../../../../../hooks/useGranularPermission';
import { useColumnasPermitidas } from '../../../../../hooks/useColumnasPermitidas';
import { useColumnResize } from '../../../../../hooks/useColumnResize';
import { TablaCodigos, PieTabla, BotonIcono } from '../ui/TablaCodigos';
import BarraFiltros from '../ui/BarraFiltros';
import { useFiltrosCodigos } from '../ui/useFiltrosCodigos';
import { usePaginacion } from '../ui/usePaginacion';
import PanelEdicionCodigo from '../PanelEdicionCodigo';
import PanelHistorial from '../PanelHistorial';
import { formatearFecha, formatearPrecio } from '../camposCodigo';

// Mismas claves que la vista clásica (permisos `col_<key>`).
const COLUMNAS = [
  { key: 'numero', label: '#', ancho: 40, min: 28, align: 'right' },
  { key: 'codigo', label: 'Código', ancho: 90, min: 60 },
  { key: 'referencia', label: 'Referencia', ancho: 140, min: 80 },
  { key: 'descEmpresa', label: 'Desc. Maestro', ancho: 300, min: 80 },
  { key: 'empresa', label: 'Empresa', ancho: 300, min: 80 },
  { key: 'tipo', label: 'Tipo', ancho: 90, min: 60 },
  { key: 'segmento', label: 'Segmento', ancho: 90, min: 60 },
  { key: 'clase', label: 'Clase', ancho: 90, min: 60 },
  { key: 'estado', label: 'Estado', ancho: 90, min: 60, align: 'center' },
  { key: 'precioNeto', label: 'Precio Neto', ancho: 90, min: 70, align: 'right' },
  { key: 'registradoPor', label: 'Registrado por', ancho: 120, min: 70 },
  { key: 'fecha', label: 'Fecha', ancho: 90, min: 50 },
  { key: 'acciones', label: 'Acciones', ancho: 90, min: 70, align: 'center' }
];

const CAMPOS_BUSQUEDA = [
  { value: 'referencia', label: 'Referencia' },
  { value: 'codigo', label: 'Código' },
  { value: 'descriptorAuto', label: 'Descripción' },
  { value: 'empresa', label: 'Empresa' }
];

const TabVistaGeneralV2 = ({ rutaVista = '/maestros/codigosMaestros/vistaGeneral' } = {}) => {
  // Mismo origen que la vista clásica (useCollectionCache = catalogosStore).
  const { datos: codigos, cargando } = useCatalogo('codigos');
  const registros = useMemo(() => [...codigos].sort(ordenarPor('fechaRegistro', 'desc')), [codigos]);

  const { userData } = useUser();
  const { hasPermission } = useGranularPermission();
  const PATH_VISTA = rutaVista;
  const puedeModificar = hasPermission(PATH_VISTA, 'tabla_datos', 'action_modificar');
  const puedeVerLogs = hasPermission(PATH_VISTA, 'tabla_datos', 'action_log');

  const { columnasVisibles } = useColumnasPermitidas(PATH_VISTA, 'tabla_datos', COLUMNAS);
  const { anchos, handleResize, restablecerAnchos, anchoTotalTabla } = useColumnResize(columnasVisibles);

  const f = useFiltrosCodigos(registros, CAMPOS_BUSQUEDA);
  const pag = usePaginacion(f.filtrados, f.clave);

  // Como la vista clásica, las empresas salen de los propios códigos (no
  // se lee el maestro de empresas solo para esta pestaña).
  const empresas = useMemo(() => f.empresas.map((nombre) => ({ id: nombre, nombre })), [f.empresas]);

  const [panel, setPanel] = useState({ abierto: false, registro: null });
  const [historial, setHistorial] = useState({ abierto: false, registro: null });
  const abrirPanel = (registro) => puedeModificar && setPanel({ abierto: true, registro });

  const renderCelda = (col, item, index) => {
    switch (col.key) {
      case 'numero': return <span className="text-gray-500 font-bold">{pag.pagina * pag.tamano + index + 1}</span>;
      case 'codigo': return <span className="font-bold text-emerald-600 dark:text-emerald-400">{item.codigo || 'S/C'}</span>;
      case 'referencia': return <span className="text-gray-700 dark:text-gray-200 font-medium" title={item.referencia}>{item.referencia}</span>;
      case 'descEmpresa': return <span title={item.descriptorAuto}>{item.descriptorAuto || 'N/A'}</span>;
      case 'empresa': return <span className="font-semibold text-gray-800 dark:text-gray-100" title={item.empresa}>{item.empresa}</span>;
      case 'tipo': return item.tipo || 'N/A';
      case 'segmento': return item.segmento || 'N/A';
      case 'clase': return item.clase || 'N/A';
      case 'estado': return (
        <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase ${item.estado === 'INACTIVO' ? 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400' : 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400'}`}>
          {item.estado || 'ACTIVO'}
        </span>
      );
      case 'precioNeto': return <span className="font-bold">{formatearPrecio(item.precioNeto)}</span>;
      case 'registradoPor': return <span className="text-gray-500 dark:text-gray-400" title={item.registradoPor}>{item.registradoPor || 'N/A'}</span>;
      case 'fecha': return <span className="text-gray-500 dark:text-gray-400">{formatearFecha(item.fechaRegistro)}</span>;
      case 'acciones': return (
        <div className="flex items-center justify-center gap-2">
          {puedeModificar && <BotonIcono icono={Pencil} tono="modificar" title="Modificar registro o precio" onClick={() => abrirPanel(item)} />}
          {puedeVerLogs && <BotonIcono icono={History} title="Ver historial" onClick={() => setHistorial({ abierto: true, registro: item })} />}
        </div>
      );
      default: return null;
    }
  };

  return (
    <div className="h-full flex flex-col">
      <BarraFiltros f={f} camposBusqueda={CAMPOS_BUSQUEDA} />

      <TablaCodigos
        columnas={columnasVisibles}
        anchos={anchos}
        onResize={handleResize}
        anchoTotal={anchoTotalTabla}
        filas={pag.filas}
        renderCelda={renderCelda}
        onFilaClick={puedeModificar ? abrirPanel : undefined}
        filaActiva={panel.abierto ? panel.registro?.id : null}
        cargando={cargando}
        mensajeVacio="No se encontraron registros con los filtros seleccionados."
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

      <PanelEdicionCodigo
        abierto={panel.abierto}
        modo="modificarRegistro"
        registro={panel.registro}
        empresas={empresas}
        registros={codigos}
        userData={userData}
        onCerrar={() => setPanel((p) => ({ ...p, abierto: false }))}
      />
      <PanelHistorial abierto={historial.abierto} registro={historial.registro} onCerrar={() => setHistorial((h) => ({ ...h, abierto: false }))} />
    </div>
  );
};

export default TabVistaGeneralV2;
