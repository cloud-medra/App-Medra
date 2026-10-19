import { useState, useCallback, useEffect } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db } from '../../../../../../firebaseConfig';
import { useToast } from '../../../../../../context/ToastContext';
import { useModal } from '../../../../../../context/ModalContext';
import { useUser } from '../../../../../../context/UserContext';
import { registrarLogConsignacion } from '../../utils/registrarLogConsignacion';
import { cargarCandidatosSolicitudConsignacion } from '../utils/cargarCandidatosSolicitudConsignacion';
import { construirFilasResumenSolicitudConsignacion } from '../utils/filasResumenSolicitudConsignacion';

const ESTADO_DESTINO = 'SOLICITADO';

const formatearFechaDDMMYYYY = (fechaString) => {
  if (!fechaString || !fechaString.includes('-')) return fechaString || '';
  const [yyyy, mm, dd] = fechaString.split('-');
  return `${dd}-${mm}-${yyyy}`;
};

const formatearFechaDeTimestamp = (valor) => {
  if (!valor) return '';
  const date = valor.toDate ? valor.toDate() : new Date(valor);
  if (isNaN(date.getTime())) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

const obtenerFechaHoyTexto = () => {
  const hoy = new Date();
  const dd = String(hoy.getDate()).padStart(2, '0');
  const mm = String(hoy.getMonth() + 1).padStart(2, '0');
  const yyyy = hoy.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

export const useSolicitudConsignacionData = () => {
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [seleccionados, setSeleccionados] = useState(new Set());

  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { userData } = useUser();

  const cargarDatos = useCallback(async (forzarRelecturaGuias = false) => {
    setCargando(true);
    try {
      // Mismo orden que Cargas (carga masiva en el orden de ingreso, cada
      // admisión junta); el Excel exportado sigue este orden.
      const listaFinal = await cargarCandidatosSolicitudConsignacion(forzarRelecturaGuias, { ordenCarga: true });
      setItems(listaFinal);
    } catch (error) {
      console.error('Error al cargar registros CARGADO de Consignación:', error);
      showToast('Error al cargar los registros pendientes de solicitar', 'error');
    } finally {
      setCargando(false);
    }
  }, [showToast]);

  useEffect(() => {
    cargarDatos(false);
  }, []);

  const toggleSeleccion = (id) => {
    setSeleccionados(prev => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) {
        nuevo.delete(id);
      } else {
        nuevo.add(id);
      }
      return nuevo;
    });
  };

  const toggleSeleccionarTodos = () => {
    if (seleccionados.size === items.length) {
      setSeleccionados(new Set());
    } else {
      setSeleccionados(new Set(items.map(it => it.id)));
    }
  };

  const registrarLog = (docRef, accion, detalles) => registrarLogConsignacion(docRef, accion, detalles, userData);

  const handleExportarYMarcarSolicitado = (periodoActivo) => {
    const itemsSeleccionados = items.filter(it => seleccionados.has(it.id));

    if (itemsSeleccionados.length === 0) {
      showToast('Selecciona al menos un ítem para exportar', 'error');
      return;
    }

    const itemsConRef = itemsSeleccionados.filter(it => it.ref);

    if (itemsConRef.length > 0 && (!periodoActivo || !periodoActivo.anio || !periodoActivo.mes)) {
      showToast('No hay un período abierto para Consignación en Control Mensual. Ábrelo antes de exportar.', 'error');
      return;
    }

    confirmAction(
      'Exportar y Marcar como Solicitado',
      `Se exportarán ${itemsSeleccionados.length} fila(s) a Excel. De ellas, ${itemsConRef.length} ítem(s) reales quedarán marcados como SOLICITADO y se copiarán a Consignación Imputadas en el período ${periodoActivo?.mes?.toUpperCase()} ${periodoActivo?.anio} (las filas de desglose de guía no tienen documento propio y no cambian de estado). ¿Continuar?`,
      async () => {
        setExportando(true);
        try {

          const fechaIngresoHoy = obtenerFechaHoyTexto();
          const filas = itemsSeleccionados.map(it => ({
            'ADMISION': it.gestionId,
            'PACIENTE': it.nombre,
            'MEDICO': it.medico,
            'FECHA': formatearFechaDDMMYYYY(it.fecha),
            'EMPRESA': it.empresa,
            'CODIGO': it.codigo,
            'DESCRIPCION': it.descripcion,
            'CANTIDAD': it.cantidad,
            'PRECIO': it.costo,
            'ATRIBUTO': it.atributo,
            'FECHA DE REGISTRO': formatearFechaDeTimestamp(it.fechaRegistro),
            'FECHA DE CARGA': formatearFechaDDMMYYYY(it.fecha),
            'N GUIA': it.numeroGuia,
            'FECHA DE INGRESO': fechaIngresoHoy,
            'LOTE': it.lote,
            'VENCIMIENTO': it.vencimiento
          }));

          const filasResumen = construirFilasResumenSolicitudConsignacion(itemsSeleccionados, items, fechaIngresoHoy);

          const worksheet = XLSX.utils.json_to_sheet(filas);
          const worksheetResumen = XLSX.utils.json_to_sheet(filasResumen);
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, 'Solicitud Consignacion');
          XLSX.utils.book_append_sheet(workbook, worksheetResumen, 'Resumen');
          const fechaArchivo = new Date().toISOString().slice(0, 10);
          XLSX.writeFile(workbook, `solicitud_consignacion_${fechaArchivo}.xlsx`);

          let opsEnBatch = 0;
          let batchActual = writeBatch(db);
          const batches = [batchActual];

          const agregarOp = (fn) => {
            if (opsEnBatch >= 400) {
              batchActual = writeBatch(db);
              batches.push(batchActual);
              opsEnBatch = 0;
            }
            fn(batchActual);
            opsEnBatch++;
          };

          for (const it of itemsConRef) {
            // periodoAnio/periodoMes quedan también en el ítem origen (no solo
            // en el doc de imputadas) — es lo que le permite al candado de
            // CargasConsignación (CargasTab.jsx) saber, más adelante, a qué
            // período/documento de consignacion_imputadas debe resincronizar
            // si alguien edita este ítem después de solicitado.
            agregarOp(b => b.update(it.ref, {
              estado: ESTADO_DESTINO,
              fechaSolicitud: new Date(),
              solicitadoPor: userData?.nombreCompleto || 'Usuario',
              periodoAnio: periodoActivo.anio,
              periodoMes: periodoActivo.mes
            }));

            const imputadaRef = doc(
              db,
              'consignacion_imputadas', String(periodoActivo.anio),
              'meses', periodoActivo.mes,
              'documentos', it.id
            );

            agregarOp(b => b.set(imputadaRef, {
              ...it.datosOriginales,
              estado: ESTADO_DESTINO,
              numeroGuia: it.numeroGuiaParaImputar ?? it.numeroGuia,
              filasGuia: it.filasGuia || [],
              total: it.costoTotal,
              fechaIngreso: fechaIngresoHoy,
              fechaSolicitud: new Date(),
              solicitadoPor: userData?.nombreCompleto || 'Usuario',
              periodoAnio: periodoActivo.anio,
              periodoMes: periodoActivo.mes,
              modulo: 'CONSIGNACION',
              actualizadoEn: new Date()
            }, { merge: true }));
          }

          for (const b of batches) {
            await b.commit();
          }

          await Promise.all(
            itemsConRef.map(it =>
              registrarLog(it.ref, 'SOLICITUD_EXPORTADA', {
                gestionId: it.gestionId,
                codigo: it.codigo,
                cantidad: it.cantidad,
                costo: it.costo,
                ventaUnitaria: it.ventaUnitaria,
                periodoAnio: periodoActivo.anio,
                periodoMes: periodoActivo.mes
              })
            )
          );

          const idsAQuitar = new Set(itemsConRef.map(it => it.id));
          const deliveriesAfectados = new Set(itemsConRef.map(it => it.delivery).filter(Boolean));
          setItems(prev => prev.filter(it => {
            if (idsAQuitar.has(it.id)) return false;
            if (it.esFilaGuia) {
              const deliveryDeEstaFila = it.id.startsWith('guia-')
                ? it.id.slice('guia-'.length, it.id.lastIndexOf('-'))
                : null;
              if (deliveryDeEstaFila && deliveriesAfectados.has(deliveryDeEstaFila)) {
                const siguePresente = prev.some(
                  o => !idsAQuitar.has(o.id) && !o.esFilaGuia && o.delivery === deliveryDeEstaFila
                );
                return siguePresente;
              }
            }
            return true;
          }));
          setSeleccionados(new Set());

          showToast(`${itemsSeleccionados.length} fila(s) exportada(s); ${itemsConRef.length} ítem(s) marcado(s) como ${ESTADO_DESTINO} e imputado(s)`, 'success');
        } catch (error) {
          console.error('Error al exportar solicitud de consignación:', error);
          showToast('Error al exportar: ' + error.message, 'error');
        } finally {
          setExportando(false);
        }
      }
    );
  };

  return {
    items,
    cargando,
    exportando,
    seleccionados,
    toggleSeleccion,
    toggleSeleccionarTodos,
    handleExportarYMarcarSolicitado,
    refrescar: () => cargarDatos(true)
  };
};