import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  FileText,
  Calendar,
  Hash,
  Building2,
  DollarSign,
  Receipt,
  Tag,
  Activity,
  CalendarDays,
  FileCheck,
  AlertTriangle,
  X
} from 'lucide-react';
import { useToast } from '../../../../../../../context/ToastContext';
import { doc, updateDoc, setDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../../../../../../firebaseConfig';
import { normalizarNumerosDocumento } from '../../../../shared/numerosDocumento';
import EstadoProcesoBadge from '../../../../shared/EstadoProcesoBadge';
import { usePeriodoAbierto, obtenerPeriodoAbierto, formatearPeriodo } from '../../../../shared/periodoImputacion';
import { useColumnasPermitidas } from '../../../../../../../hooks/useColumnasPermitidas';

const PATH_VISTA = '/vacunatorio/archivosControlVacunatorio/documentosListos';

// Columnas de la tabla (granularidad por columna: `col_<key>` en la sección
// 'tabla_detalle' del mapa de permisos; ver useColumnasPermitidas).
const COLUMNAS_TABLA = [
  { key: 'linea', label: '#' },
  { key: 'codigoDoc', label: 'Cód. Documento' },
  { key: 'descripcionDoc', label: 'Descripción Documento' },
  { key: 'cantidadDoc', label: 'Cant. Documento' },
  { key: 'precioDoc', label: 'Precio Documento' },
  { key: 'totalLinea', label: 'Total Línea' },
  { key: 'codigoMaestro', label: 'Cód. Maestro' },
  { key: 'descripcionMaestro', label: 'Descripción Maestro' },
  { key: 'articuloOC', label: 'Artículo OC' },
  { key: 'cantidadOC', label: 'Cant. OC' },
  { key: 'precioOC', label: 'Precio OC' },
  { key: 'estadoItem', label: 'Estado Ítem' }
];

const DetalleListasIngreso = ({
  documento,
  onVolver,
  formatearFechaEmision,
  renderBadgeEstadoGeneral,
  onActualizarDocumento,
  puedeFinalizarActa = true
}) => {
  const { columnasVisibles: columnasTabla, ver: verColumna } = useColumnasPermitidas(PATH_VISTA, 'tabla_detalle', COLUMNAS_TABLA);
  const { showToast } = useToast();
  const { periodo: periodoAbierto, cargando: cargandoPeriodo } = usePeriodoAbierto('vacunatorio');

  const obtenerFechaActual = () => {
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  };

  const [panelActaAbierto, setPanelActaAbierto] = useState(false);
  const [numeroOrden, setNumeroOrden] = useState('');
  const [numeroActa, setNumeroActa] = useState('');
  const [numeroSalida, setNumeroSalida] = useState('');
  const [fechaActa, setFechaActa] = useState(obtenerFechaActual());
  const [fechaSalida, setFechaSalida] = useState(obtenerFechaActual());
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (documento) {
      setNumeroOrden(documento.numeroOrden || documento.orden || documento.numOrden || '');
      setNumeroActa(documento.numeroActa || documento.nroActa || '');
      setNumeroSalida(documento.numeroSalida || documento.nroSalida || '');
      setFechaActa(documento.fechaActa || documento.fchActa || obtenerFechaActual());
      setFechaSalida(documento.fechaSalida || documento.fchSalida || obtenerFechaActual());
    }
  }, [documento]);

  if (!documento) return null;

  const parseMontoToFloat = (valor) => {
    if (valor === undefined || valor === null || valor === '') return 0;
    if (typeof valor === 'number') return valor;
    const strVal = String(valor).replace(/[^0-9,-]/g, '').replace(',', '.');
    return parseFloat(strVal) || 0;
  };

  const formatearMoneda = (valor) => {
    const monto = parseMontoToFloat(valor);
    return `$${Math.round(monto).toLocaleString('es-CL')}`;
  };

  const observaciones =
    documento.observacionDiferencia ||
    documento.motivo ||
    documento.observacion ||
    'No se registraron observaciones adicionales para este documento.';

  const detalles = documento.detalles || [];

  const handleFinalizarActa = async () => {
    if (!puedeFinalizarActa) return;
    if (!numeroOrden.trim() && !numeroActa.trim() && !numeroSalida.trim()) {
      showToast('Debe ingresar al menos el Número de Orden, Acta o Salida', 'warning');
      return;
    }

    if (!documento.anio || !documento.mesId || !documento.id) {
      showToast('No se pudo determinar la ubicación del documento en la base de datos', 'error');
      return;
    }

    try {
      setGuardando(true);

      // El período se asigna recién aquí. Se relee en el momento (no se usa
      // el del listener) para no imputar en un período que se cerró mientras
      // el panel estaba abierto.
      const periodo = await obtenerPeriodoAbierto('vacunatorio');
      if (!periodo) {
        showToast('No hay un período de imputación abierto para Vacunatorio. No se puede finalizar.', 'error');
        return;
      }
      if (periodoAbierto && (periodo.mes !== periodoAbierto.mes || periodo.anio !== periodoAbierto.anio)) {
        showToast(`El período abierto cambió a ${formatearPeriodo(periodo)}. Revisa y vuelve a finalizar.`, 'warning');
        return;
      }

      const datosActa = {
        numeroOrden,
        numeroActa,
        numeroSalida,
        fechaActa,
        fechaSalida,
        estado: 'Finalizado',
        mesImputado: periodo.mes,
        anioImputado: periodo.anio
      };

      const refDocumento = doc(
        db, 'vacunatorio_documentos',
        documento.anio, 'meses', documento.mesId, 'documentos', documento.id
      );

      await updateDoc(refDocumento, datosActa);

      const refImputada = doc(
        db, 'vacunatorio_imputadas',
        periodo.anio, 'meses', periodo.mes, 'documentos', documento.id
      );

      const refAnio = doc(db, 'vacunatorio_imputadas', periodo.anio);
      const refMes = doc(db, 'vacunatorio_imputadas', periodo.anio, 'meses', periodo.mes);

      await Promise.all([
        setDoc(refAnio, { anio: periodo.anio, activo: true }, { merge: true }),
        setDoc(refMes, { mes: periodo.mes, anio: periodo.anio, activo: true }, { merge: true }),
      ]);

      // normalizarNumerosDocumento: aunque el documento de origen tenga `total`
      // como texto (importaciones antiguas), la imputada queda numérica.
      await setDoc(refImputada, {
        ...normalizarNumerosDocumento(documento),
        ...datosActa,
        origenAnio: documento.anio,
        origenMes: documento.mesId,
        activo: true,
        fechaImputacionFinal: serverTimestamp(),
      });

      try {
        const currentUser = auth.currentUser;
        const usuarioInfo = {
          uid: currentUser?.uid || "desconocido",
          email: currentUser?.email || "usuario_anonimo",
          nombre: currentUser?.displayName || currentUser?.email?.split('@')[0] || "Usuario"
        };
        const logsRef = collection(refDocumento, "logs");
        await addDoc(logsRef, {
          accion: "ACTA INGRESADA",
          detalle: `Proceso finalizado e imputado a ${periodo.mes} ${periodo.anio}. Folio ${documento.folio || documento.id}. Orden: ${numeroOrden || 'N/A'} Acta: ${numeroActa || 'N/A'} Salida: ${numeroSalida || 'N/A'}`,
          resumen: { numeroOrden: numeroOrden || '-', numeroActa: numeroActa || '-', numeroSalida: numeroSalida || '-', fechaActa: fechaActa || '-', fechaSalida: fechaSalida || '-' },
          fechaHora: new Date().toLocaleString('es-CL'),
          timestamp: serverTimestamp(),
          usuario: usuarioInfo
        });
      } catch (logError) {
        console.error("Error al escribir log de recepción:", logError);
      }

      showToast(`Proceso finalizado e imputado en el período actual: ${formatearPeriodo(periodo)}`, 'success');

      if (onActualizarDocumento) {
        onActualizarDocumento({ ...documento, ...datosActa });
      }
      setPanelActaAbierto(false);
    } catch (error) {
      console.error('Error al guardar datos:', error);
      showToast('Hubo un error al guardar los datos en la base de datos', 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="relative flex flex-col h-full w-full bg-white dark:bg-gray-800 overflow-hidden">
      <header className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 px-3 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={onVolver}
            className="p-1 hover:bg-slate-100 dark:hover:bg-gray-700 rounded text-slate-600 dark:text-gray-300 flex items-center gap-1 text-[11px] font-medium transition-colors cursor-pointer"
            title="Volver a la lista"
          >
            <ArrowLeft size={15} className="text-[#2383C2]" />
            <span>Volver</span>
          </button>
          <span className="text-slate-300 dark:text-gray-600">|</span>
          <FileText className="text-[#2383C2]" size={16} />
          <span className="text-[12px] font-bold text-slate-800 dark:text-gray-100 tracking-wide uppercase">
            Detalle Lista de Ingreso — Folio N° {documento.folio}
          </span>
        </div>
      </header>

      <div className="px-3 py-2 bg-slate-100/60 dark:bg-gray-900/40 border-b border-slate-200 dark:border-gray-700 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 shrink-0">
        <div className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex flex-col justify-between">
          <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-gray-500 flex items-center gap-1">
            <Hash size={11} className="text-[#2383C2]" /> Folio
          </span>
          <span className="text-[11px] font-bold text-slate-800 dark:text-gray-100 truncate mt-0.5">
            #{documento.folio}
          </span>
        </div>

        <div className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex flex-col justify-between">
          <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-gray-500 flex items-center gap-1">
            <Calendar size={11} className="text-[#2383C2]" /> Fecha Emisión
          </span>
          <span className="text-[11px] font-bold text-slate-800 dark:text-gray-100 truncate mt-0.5">
            {formatearFechaEmision
              ? formatearFechaEmision(documento.fchEmis)
              : documento.fchEmis || '-'}
          </span>
        </div>

        <div className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex flex-col justify-between">
          <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-gray-500 flex items-center gap-1">
            <CalendarDays size={11} className="text-[#2383C2]" /> Mes Imputado
          </span>
          <span className="text-[11px] font-bold text-slate-800 dark:text-gray-100 truncate mt-0.5 capitalize">
            {documento.mesImputado || documento.mes_imputado || '-'}
          </span>
        </div>

        <div className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex flex-col justify-between">
          <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-gray-500 flex items-center gap-1">
            <Tag size={11} className="text-[#2383C2]" /> Ref. (OC)
          </span>
          <span className="text-[11px] font-bold text-slate-800 dark:text-gray-100 truncate mt-0.5 font-num">
            {documento.folioRef || 'Sin Referencia'}
          </span>
        </div>

        <div className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex flex-col justify-between">
          <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-gray-500 flex items-center gap-1">
            <DollarSign size={11} className="text-[#2383C2]" /> Total Neto
          </span>
          <span className="text-[11px] font-bold text-slate-800 dark:text-gray-100 truncate mt-0.5">
            {formatearMoneda(documento.total)}
          </span>
        </div>

        <div className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex flex-col justify-between">
          <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-gray-500 flex items-center gap-1">
            <Activity size={11} className="text-[#2383C2]" /> Estado
          </span>
          <div className="mt-0.5 truncate">
            {renderBadgeEstadoGeneral ? (
              renderBadgeEstadoGeneral(documento.estado)
            ) : (
              <EstadoProcesoBadge estado={documento.estado} fallback="Registrado" />
            )}
          </div>
        </div>

        <div className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex flex-col justify-between">
          <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-gray-500 flex items-center gap-1">
            <FileCheck size={11} className="text-[#2383C2]" /> Documento
          </span>
          <button
            type="button"
            onClick={() => setPanelActaAbierto(true)}
            disabled={!puedeFinalizarActa}
            className="mt-0.5 w-full py-1 px-2 bg-[#2383C2] hover:bg-[#1b6b9f] text-white rounded border border-[#1b6b9f] text-[10px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
            title={puedeFinalizarActa ? 'Añadir Acta' : 'No tienes permiso para finalizar el acta'}
          >
            <FileCheck size={11} />
            <span>Añadir Acta</span>
          </button>
        </div>
      </div>

      <div className="px-3 py-1.5 bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 flex items-center justify-between shrink-0 text-xs">
        <div className="flex items-center gap-2 truncate">
          <Building2 size={13} className="text-[#2383C2] shrink-0" />
          <span className="text-[9px] font-bold text-slate-400 dark:text-gray-500 uppercase">
            Proveedor:
          </span>
          <span className="text-[11px] font-semibold text-slate-800 dark:text-gray-200 truncate" title={documento.rznSoc}>
            {documento.rznSoc || 'Sin Razón Social'}
          </span>
          <span className="text-slate-400 dark:text-gray-500 text-[11px]">
            (RUT: {documento.rutEmisor || 'N/A'})
          </span>
        </div>
        <span className="text-[10px] text-slate-400 font-semibold shrink-0">
          Total Ítems: <strong className="text-slate-700 dark:text-gray-200">{detalles.length}</strong>
        </span>
      </div>

      <div className="flex-grow flex flex-col min-h-0 p-3 space-y-3 overflow-hidden">
        <div className="bg-slate-50 dark:bg-gray-900/50 border border-slate-200 dark:border-gray-700 rounded-md p-3 shrink-0 max-h-32 overflow-y-auto">
          <h4 className="font-semibold text-slate-800 dark:text-gray-200 mb-1 flex items-center gap-1.5 text-xs">
            <Receipt size={14} className="text-[#2383C2] shrink-0" />
            <span>Observaciones o Comentarios</span>
          </h4>
          <p className="text-slate-700 dark:text-gray-300 text-[11px] leading-relaxed whitespace-pre-wrap">
            {observaciones}
          </p>
        </div>

        <div className="border border-slate-200 dark:border-gray-700 rounded-md overflow-auto flex-1 min-h-0 bg-white dark:bg-gray-800">
          <table className="w-full text-left text-[11px] border-collapse min-w-[1400px]">
            <thead className="bg-slate-100 dark:bg-gray-900 sticky top-0 z-10 shadow-xs">
              <tr className="text-slate-600 dark:text-gray-400 uppercase font-bold text-[10px]">
                {verColumna('linea') && (
                  <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-10 text-center">#</th>
                )}
                {verColumna('codigoDoc') && (
                  <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-28">Cód. Documento</th>
                )}
                {verColumna('descripcionDoc') && (
                  <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700">Descripción Documento</th>
                )}
                {verColumna('cantidadDoc') && (
                  <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-20 text-center">Cant. Documento</th>
                )}
                {verColumna('precioDoc') && (
                  <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-24 text-right">Precio Documento</th>
                )}
                {verColumna('totalLinea') && (
                  <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-24 text-right">Total Línea</th>
                )}
                {verColumna('codigoMaestro') && (
                  <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-28 bg-blue-100/70 dark:bg-blue-950/60 text-slate-900 dark:text-blue-200">Cód. Maestro</th>
                )}
                {verColumna('descripcionMaestro') && (
                  <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 bg-blue-100/70 dark:bg-blue-950/60 text-slate-900 dark:text-blue-200">Descripción Maestro</th>
                )}
                {verColumna('articuloOC') && (
                  <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-28 bg-blue-100/70 dark:bg-blue-950/60 text-slate-900 dark:text-blue-200">Artículo OC</th>
                )}
                {verColumna('cantidadOC') && (
                  <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-20 bg-blue-100/70 dark:bg-blue-950/60 text-center text-blue-900 dark:text-blue-200">Cant. OC</th>
                )}
                {verColumna('precioOC') && (
                  <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-24 bg-blue-100/70 dark:bg-blue-950/60 text-right text-blue-900 dark:text-blue-200">Precio OC</th>
                )}
                {verColumna('estadoItem') && (
                  <th className="py-1.5 px-2 border-b border-slate-200 dark:border-gray-700 w-36 text-center">Estado Item</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-gray-700/60 bg-white dark:bg-gray-800">
              {detalles.length === 0 ? (
                <tr>
                  <td colSpan={columnasTabla.length} className="py-6 text-center text-slate-400 dark:text-gray-500 text-xs">
                    Este documento no posee ítems cargados.
                  </td>
                </tr>
              ) : (
                detalles.map((item, idx) => (
                  <tr key={item.id || item.codigo || idx} className="hover:bg-slate-50 dark:hover:bg-gray-700/40">
                    {verColumna('linea') && (
                      <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-slate-500 text-center font-bold">{idx + 1}</td>
                    )}
                    {verColumna('codigoDoc') && (
                      <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 font-num text-slate-500">{item.codigo || '-'}</td>
                    )}
                    {verColumna('descripcionDoc') && (
                      <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-slate-800 dark:text-gray-200 font-medium">{item.nombre || item.descripcion}</td>
                    )}
                    {verColumna('cantidadDoc') && (
                      <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-center font-num">{item.cantidad}</td>
                    )}
                    {verColumna('precioDoc') && (
                      <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-right font-num">{formatearMoneda(item.precio)}</td>
                    )}
                    {verColumna('totalLinea') && (
                      <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-right font-bold">{formatearMoneda(item.monto || item.precio * item.cantidad)}</td>
                    )}
                    {verColumna('codigoMaestro') && (
                      <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 font-num text-slate-600 dark:text-gray-300 bg-blue-50/30 dark:bg-blue-950/20">{item.codigoMaestro || '-'}</td>
                    )}
                    {verColumna('descripcionMaestro') && (
                      <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-slate-800 dark:text-gray-200 bg-blue-50/30 dark:bg-blue-950/20 font-medium">{item.descripcionMaestro || '-'}</td>
                    )}
                    {verColumna('articuloOC') && (
                      <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 font-num text-slate-600 dark:text-gray-300 bg-blue-50/30 dark:bg-blue-950/20">{item.articuloOC || '-'}</td>
                    )}
                    {verColumna('cantidadOC') && (
                      <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-center font-num bg-blue-50/30 dark:bg-blue-950/20 text-blue-900 dark:text-blue-300">{item.cantidadOC ?? '-'}</td>
                    )}
                    {verColumna('precioOC') && (
                      <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-right font-num bg-blue-50/30 dark:bg-blue-950/20 text-blue-900 dark:text-blue-300">{item.precioOC !== undefined ? formatearMoneda(item.precioOC) : '-'}</td>
                    )}
                    {verColumna('estadoItem') && (
                      <td className="py-1 px-2 border-b border-slate-200 dark:border-gray-700 text-center">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold whitespace-nowrap bg-slate-100 text-slate-700 dark:bg-gray-700 dark:text-gray-300">
                          {item.vincuOCTexto || item.estadoItem || 'Registrado'}
                        </span>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {panelActaAbierto && (
        <div className="absolute inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-xs transition-opacity">
          <div className="w-full max-w-sm h-full bg-white dark:bg-gray-800 border-l border-slate-200 dark:border-gray-700 shadow-xl flex flex-col justify-between p-4 animate-in slide-in-from-right duration-200">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <FileCheck size={18} className="text-[#2383C2]" />
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-800 dark:text-gray-100">
                    Añadir Datos de Recepción
                  </h3>
                </div>
                <button
                  onClick={() => setPanelActaAbierto(false)}
                  className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-gray-300">Número de Orden</label>
                  <input
                    type="text"
                    value={numeroOrden}
                    onChange={(e) => setNumeroOrden(e.target.value)}
                    placeholder="Ej. OC-1234"
                    className="h-8 px-2.5 rounded border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 text-xs outline-none focus:border-[#2383C2]"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-gray-300">Número de Acta</label>
                  <input
                    type="text"
                    value={numeroActa}
                    onChange={(e) => setNumeroActa(e.target.value)}
                    placeholder="Ej. ACT-001"
                    className="h-8 px-2.5 rounded border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 text-xs outline-none focus:border-[#2383C2]"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-gray-300">Número de Salida</label>
                  <input
                    type="text"
                    value={numeroSalida}
                    onChange={(e) => setNumeroSalida(e.target.value)}
                    placeholder="Ej. SAL-998"
                    className="h-8 px-2.5 rounded border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 text-xs outline-none focus:border-[#2383C2]"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-gray-300">Fecha Acta</label>
                  <input
                    type="date"
                    value={fechaActa}
                    onChange={(e) => setFechaActa(e.target.value)}
                    className="h-8 px-2.5 rounded border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 text-xs outline-none focus:border-[#2383C2]"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-gray-300">Fecha de Salida</label>
                  <input
                    type="date"
                    value={fechaSalida}
                    onChange={(e) => setFechaSalida(e.target.value)}
                    className="h-8 px-2.5 rounded border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 text-xs outline-none focus:border-[#2383C2]"
                  />
                </div>
              </div>
            </div>

            {cargandoPeriodo ? null : periodoAbierto ? (
              <div className="p-2.5 rounded border border-blue-200 dark:border-blue-800/50 bg-blue-50/60 dark:bg-blue-950/30 text-[11px] text-slate-700 dark:text-gray-200 flex items-start gap-2">
                <CalendarDays size={14} className="shrink-0 mt-0.5 text-[#2383C2]" />
                <p>
                  Al finalizar, el documento quedará imputado en el período actual:{' '}
                  <strong className="text-[#2383C2] dark:text-[#369BCE]">{formatearPeriodo(periodoAbierto)}</strong>.
                </p>
              </div>
            ) : (
              <div className="p-2.5 rounded border border-rose-200 dark:border-rose-800/50 bg-rose-50 dark:bg-rose-950/30 text-[11px] text-rose-700 dark:text-rose-300 flex items-start gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <p>No hay un período de imputación abierto para Vacunatorio. No se puede finalizar hasta que se abra uno.</p>
              </div>
            )}

            <div className="pt-3 border-t border-slate-200 dark:border-gray-700 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPanelActaAbierto(false)}
                disabled={guardando}
                className="px-3 py-1.5 rounded border border-slate-300 dark:border-gray-600 text-slate-600 dark:text-gray-300 text-xs font-medium hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleFinalizarActa}
                disabled={guardando || cargandoPeriodo || !periodoAbierto}
                className="px-3 py-1.5 rounded bg-[#2383C2] hover:bg-[#1b6b9f] text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {guardando ? 'Guardando...' : 'Finalizar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DetalleListasIngreso;