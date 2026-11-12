import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { useToast } from '../../../../../context/ToastContext';
import { useGranularPermission } from '../../../../../hooks/useGranularPermission';
import { useColumnasPermitidas } from '../../../../../hooks/useColumnasPermitidas';
import { useColumnResize } from '../../../../../hooks/useColumnResize';
import { useCatalogo } from '../../../../../hooks/useCatalogo';
import { TablaCodigos, Boton } from '../ui/TablaCodigos';
import { formatearPrecio } from '../camposCodigo';
import { leerSolicitudesPrecio, eliminarDescargadas } from '../../shared/solicitudesPrecio/accionesSolicitudesPrecio';
import { ordenarSolicitudes, textoModulos, formatearFechaSolicitud, formatearVecesCosto, completarSolicitud } from '../../shared/solicitudesPrecio/solicitudesPrecio';
import { descargarExcelSolicitudes } from '../../shared/solicitudesPrecio/descargarExcelSolicitudes';

// Solicitud de precios a TI: referencias marcadas desde Cargas (Implantes,
// Hemodinamia y Consignación) con la venta distinta a la del sistema externo.
// Se eligen filas, se descargan en Excel para TI y, si el archivo se generó,
// se quitan de la lista. Permisos por columna: `col_<key>` en 'tabla_datos'.
const COLUMNAS = [
  { key: 'seleccion', label: 'Seleccionar', ancho: 36, min: 32, align: 'center' },
  { key: 'codigo', label: 'Código', ancho: 90, min: 60 },
  { key: 'referencia', label: 'Referencia', ancho: 160, min: 80 },
  { key: 'descripcion', label: 'Descripción', ancho: 320, min: 100 },
  { key: 'modulo', label: 'Módulo', ancho: 170, min: 80 },
  { key: 'costo', label: 'Costo', ancho: 100, min: 70, align: 'right' },
  { key: 'vecesCosto', label: 'Veces costo', ancho: 85, min: 60, align: 'right' },
  { key: 'venta', label: 'Venta', ancho: 100, min: 70, align: 'right' },
  { key: 'fecha', label: 'Fecha agregada', ancho: 130, min: 90 }
];

const claseCheckbox = 'h-3.5 w-3.5 accent-[#2383C2] cursor-pointer align-middle';

const TabSolicitudPreciosV2 = ({ rutaVista = '/maestros/codigosMaestros/solicitudPrecios' } = {}) => {
  const { showToast } = useToast();
  const { hasPermission } = useGranularPermission();
  const PATH_VISTA = rutaVista;
  const puedeDescargar = hasPermission(PATH_VISTA, 'tabla_datos', 'btn_descargar_excel');

  const [guardados, setGuardados] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [descargando, setDescargando] = useState(false);

  // El estado se actualiza solo al llegar la respuesta (en los callbacks de la promesa).
  const leer = useCallback(() => leerSolicitudesPrecio()
    .then((datos) => {
      const nuevos = ordenarSolicitudes(datos);
      setGuardados(nuevos);
      // La selección conserva solo las filas que siguen en la lista.
      setSeleccion((prev) => new Set(nuevos.filter((r) => prev.has(r.id)).map((r) => r.id)));
    })
    .catch((error) => {
      console.error('Error al leer la solicitud de precios:', error);
      showToast('No se pudo cargar la solicitud de precios.', 'error');
    })
    .finally(() => setCargando(false)), [showToast]);

  useEffect(() => { leer(); }, [leer]);

  // Las referencias guardadas antes de registrar código y veces costo se
  // completan aquí (catálogo de Códigos y regla de Recargos del módulo), sin
  // escribir en la base. Ambos catálogos son compartidos (catalogosStore).
  const { datos: catalogo } = useCatalogo('codigos');
  const { datos: recargos } = useCatalogo('recargos');
  const registros = useMemo(
    () => guardados.map((r) => completarSolicitud(r, { catalogo, recargos })),
    [guardados, catalogo, recargos]
  );

  const cargar = () => {
    setCargando(true);
    return leer();
  };

  const todasSeleccionadas = registros.length > 0 && seleccion.size === registros.length;
  const alternarTodas = () => setSeleccion(todasSeleccionadas ? new Set() : new Set(registros.map((r) => r.id)));
  const alternarFila = (id) => setSeleccion((prev) => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });

  const { columnasVisibles } = useColumnasPermitidas(PATH_VISTA, 'tabla_datos', COLUMNAS);
  const { anchos, handleResize, anchoTotalTabla } = useColumnResize(columnasVisibles);
  // El checkbox de "seleccionar todas" va en el encabezado de su columna.
  const columnasTabla = columnasVisibles.map((col) => (col.key !== 'seleccion' ? col : {
    ...col,
    encabezado: (
      <input
        type="checkbox"
        aria-label="Seleccionar todas"
        className={claseCheckbox}
        checked={todasSeleccionadas}
        ref={(el) => { if (el) el.indeterminate = seleccion.size > 0 && !todasSeleccionadas; }}
        onChange={alternarTodas}
        disabled={registros.length === 0}
      />
    )
  }));

  const descargar = async () => {
    const elegidas = registros.filter((r) => seleccion.has(r.id));
    if (elegidas.length === 0 || descargando) return;
    setDescargando(true);
    try {
      // Si el Excel no se genera, no se borra nada.
      try {
        descargarExcelSolicitudes(elegidas);
      } catch (error) {
        console.error('Error al generar el Excel de solicitud de precios:', error);
        showToast('No se pudo generar el Excel. La lista no se modificó.', 'error');
        return;
      }
      try {
        const { eliminadas, conservadas } = await eliminarDescargadas(elegidas);
        showToast(conservadas > 0
          ? `Excel descargado. Se quitaron ${eliminadas} de la lista; ${conservadas} se mantienen porque se volvieron a marcar mientras tanto.`
          : `Excel descargado. Se quitaron ${eliminadas} referencia${eliminadas === 1 ? '' : 's'} de la lista.`,
        conservadas > 0 ? 'warning' : 'success');
      } catch (error) {
        console.error('Error al quitar las solicitudes descargadas:', error);
        showToast('El Excel se descargó, pero no se pudieron quitar las filas de la lista.', 'error');
      }
      await cargar();
    } finally {
      setDescargando(false);
    }
  };

  const renderCelda = (col, item) => {
    switch (col.key) {
      case 'seleccion': return (
        <input
          type="checkbox"
          aria-label={`Seleccionar ${item.referencia}`}
          className={claseCheckbox}
          checked={seleccion.has(item.id)}
          onChange={() => alternarFila(item.id)}
        />
      );
      case 'codigo': return <span className="text-etiqueta text-emerald-600 dark:text-emerald-400">{item.codigo}</span>;
      case 'referencia': return <span className="text-tinta-principal" title={item.referencia}>{item.referencia}</span>;
      case 'descripcion': return <span title={item.descripcion}>{item.descripcion || 'N/A'}</span>;
      case 'modulo': return <span title={textoModulos(item.modulos)}>{textoModulos(item.modulos)}</span>;
      case 'costo': return formatearPrecio(item.costo);
      case 'vecesCosto': return <span className="tabular-nums" title={item.vecesCosto ? String(item.vecesCosto) : undefined}>{formatearVecesCosto(item.vecesCosto)}</span>;
      case 'venta': return <span className="text-etiqueta">{formatearPrecio(item.venta)}</span>;
      case 'fecha': return <span className="text-tinta-secundaria">{formatearFechaSolicitud(item.agregadoEl) || '—'}</span>;
      default: return null;
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-gray-700">
        <p className="text-normal text-tinta-secundaria">
          Referencias marcadas en Cargas para que TI actualice el precio en el sistema externo. Al descargar, las filas descargadas se quitan de la lista.
        </p>
        <div className="flex items-center gap-2">
          {seleccion.size > 0 && puedeDescargar && (
            <Boton variante="primario" icono={Download} onClick={descargar} disabled={descargando}>
              Descargar Excel ({seleccion.size})
            </Boton>
          )}
          <Boton variante="fantasma" icono={RefreshCw} onClick={cargar} disabled={cargando || descargando} title="Recargar la lista">
            Recargar
          </Boton>
        </div>
      </div>

      <TablaCodigos
        columnas={columnasTabla}
        anchos={anchos}
        onResize={handleResize}
        anchoTotal={anchoTotalTabla}
        filas={registros}
        renderCelda={renderCelda}
        cargando={cargando}
        mensajeVacio="No hay referencias pendientes de enviar a TI."
      />
      <div className="shrink-0 h-11 px-4 flex items-center border-t border-slate-200 dark:border-gray-700 text-normal text-tinta-secundaria">
        <span className="text-tinta-principal tabular-nums">{registros.length.toLocaleString('es-CL')}</span>
        &nbsp;referencia{registros.length === 1 ? '' : 's'}
        {seleccion.size > 0 && <span className="ml-2">· {seleccion.size} seleccionada{seleccion.size === 1 ? '' : 's'}</span>}
      </div>
    </div>
  );
};

export default TabSolicitudPreciosV2;
