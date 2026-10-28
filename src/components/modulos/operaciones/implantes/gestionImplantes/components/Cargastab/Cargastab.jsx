import { useState, useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  UploadCloud,
  Building2,
  Calendar as CalendarIcon,
  Plus,
  AlertCircle,
  Loader2,
  Lock,
  Unlock,
  Package,
  Layers,
  Check,
  Trash2,
  Copy
} from 'lucide-react';
import { formatearFechaTabla, calcularCamposFinancieros, esClasePad, VALOR_LOTE_VENCIMIENTO_PAD } from './cargasHelpers';
import { verificarPeriodosBloque } from './verificacionPeriodoBloque';
import { construirTextoAdmisionNombre } from '../../utils/gestionesImportExport';
import { useRecargosActivos } from './useRecargosActivos';
import { useAutocompleteReferencia } from './useAutocompleteReferencia';
import { useGranularPermission } from '../../../../../../../hooks/useGranularPermission';
import { CotizacionCard } from './CotizacionCard';
import { construirItemContenidoPadDesdeFila } from './PadContenidoRow';
import ContenidoPadRegistrado from './ContenidoPadRegistrado';
import NotasAdmision from './NotasAdmision';
import { construirItemLoteDesdeFila } from './loteAdicionalHelpers';
import { formatearPesos } from '../../../../../../../utils/formatearMoneda';
// Foco para ingresar ítems seguidos con el teclado (ver src/utils/foco.js).
import { enfocar, alPresionarEnter } from '../../../../../../../utils/foco';
import { CLASE_SIN_FLECHAS, SIN_CAMBIO_ACCIDENTAL } from '../../../../../../ui/numeroSinFlechas';
import { esCodigoFibra, fibrasUsadasEnBloques } from '../../../fibras/fibrasNucleo';
import { SelectorFibra } from '../../../fibras/SelectorFibra';
import { useFibrasDeReferencia } from '../../../fibras/useFibrasDeReferencia';

const PATH_VISTA = '/implantes/gestionImplantes/cargas';
const PATH_INFORMACION = '/implantes/gestionImplantes/informacion';

const INITIAL_ITEM = {
  numCotizacion: '',
  totalCotizacion: '',
  referencia: '',
  cantidad: '',
  lote: '',
  vencimiento: '',
  codigo: '',
  precio: '',
  empresaVinculada: '',
  tipoVinculado: '',
  detalle: '',
  descriptorAuto: '',
  clase: ''
};

const DRAFT_CONTENIDO_VACIO = {
  referencia: '',
  codigo: '',
  descriptorAuto: '',
  detalle: '',
  clase: '',
  tipoVinculado: '',
  empresaVinculada: '',
  cantidad: '',
  lote: '',
  vencimiento: ''
};

const DRAFT_LOTE_VACIO = { cantidad: '', lote: '', vencimiento: '' };

export const CargasTab = forwardRef(({ formData, bloqueActivoIndex, onAgregarItem, onEliminarItem, onEliminarCotizacion, onActualizarEstadoItem, onEditarItem, periodoAbierto, cargandoPeriodo, handleCopiarTexto, onIrAInformacion }, ref) => {
  const bloqueActivo = formData?.bloques?.[bloqueActivoIndex];
  const cotizaciones = bloqueActivo?.cotizaciones || [];

  // Candado de bloqueo: un bloque ya SOLICITADO (ya copiado a
  // implantes_imputadas) queda de solo lectura hasta que el usuario lo
  // desbloquea explícitamente. Se resetea al cambiar de bloque a propósito
  // — no queremos que quede "abierto" silenciosamente si el usuario navega
  // a otro bloque y vuelve.
  const [desbloqueadoLocal, setDesbloqueadoLocal] = useState(false);
  const [verificandoCandado, setVerificandoCandado] = useState(false);
  const [errorCandado, setErrorCandado] = useState('');
  const { hasPermission, hasAccesoProceso } = useGranularPermission();
  const puedeAgregarContenidoPad = hasPermission(PATH_VISTA, 'tabla_cotizaciones', 'formulario_contenido_pad');
  // Notas de la admisión: visibles para quien ve Cargas; si tiene la
  // pestaña Información, se respetan sus permisos por campo. "Editar en
  // Información" solo si puede editarlos allí.
  const tieneInformacion = hasAccesoProceso(PATH_INFORMACION);
  const campoInformacion = (campo) => hasPermission(PATH_INFORMACION, 'formulario_observaciones', campo);
  const verDescripcion = !tieneInformacion || campoInformacion('input_descripcion');
  const verObservacion = !tieneInformacion || campoInformacion('input_observacion');
  const puedeEditarNotas = Boolean(onIrAInformacion) && tieneInformacion
    && (campoInformacion('input_descripcion') || campoInformacion('input_observacion'));

  const bloqueSolicitado = (bloqueActivo?.solicitud || '').toUpperCase() === 'SOLICITADO';
  const bloqueado = bloqueSolicitado && !desbloqueadoLocal;

  const [nuevoItem, setNuevoItem] = useState(INITIAL_ITEM);
  const numCotizacionRef = useRef(null);
  const referenciaRef = useRef(null);
  const cantidadRef = useRef(null);
  const referenciaContenidoRef = useRef(null);
  const cantidadContenidoRef = useRef(null);
  const [errores, setErrores] = useState({});
  const [esPad, setEsPad] = useState(false);
  // Fibra reutilizable (check en Códigos Maestros): la línea exige elegir la
  // fibra física usada; cantidad 1 y lote/vencimiento los de la fibra.
  const [esFibra, setEsFibra] = useState(false);
  const [fibraElegida, setFibraElegida] = useState(null);
  const [contenidoPad, setContenidoPad] = useState([]);

  const [numCotizacionPad, setNumCotizacionPad] = useState('');

  const [draftContenido, setDraftContenido] = useState(DRAFT_CONTENIDO_VACIO);
  const [errorDraftContenido, setErrorDraftContenido] = useState({});

  const [lotesAdicionales, setLotesAdicionales] = useState([]);
  const [draftLote, setDraftLote] = useState(DRAFT_LOTE_VACIO);
  const [errorDraftLote, setErrorDraftLote] = useState({});

  const { recargosActivos, cargandoRecargos } = useRecargosActivos();
  const {
    sugerencias, buscando, mostrarSug, setMostrarSug, containerRef, skipNext
  } = useAutocompleteReferencia(nuevoItem.referencia);

  const {
    sugerencias: sugerenciasContenido,
    buscando: buscandoContenido,
    mostrarSug: mostrarSugContenido,
    setMostrarSug: setMostrarSugContenido,
    containerRef: containerRefContenido,
    skipNext: skipNextContenido
  } = useAutocompleteReferencia(draftContenido.referencia);

  const fibrasReferencia = useFibrasDeReferencia(nuevoItem.referencia, esFibra);
  const fibrasUsadas = useMemo(() => fibrasUsadasEnBloques(formData?.bloques), [formData?.bloques]);

  const elegirFibra = (fibra) => {
    setFibraElegida(fibra);
    setNuevoItem(prev => ({ ...prev, cantidad: '1', lote: fibra?.lote || '', vencimiento: fibra?.vencimiento || '' }));
    if (errores.fibra) setErrores(prev => ({ ...prev, fibra: false }));
  };
  const resetFibra = () => {
    setEsFibra(false);
    setFibraElegida(null);
  };

  const rangoActual = buscarRangoRecargoLocal(nuevoItem.precio, recargosActivos);
  const vecesCostoActual = rangoActual ? Number(rangoActual.vecesCosto) : 1;
  const cantidadActual = Number(nuevoItem.cantidad) || 1;
  const ventaActual = calcularVentaUnitariaLocal(nuevoItem.precio, vecesCostoActual) * cantidadActual;

  // La referencia principal SIEMPRE factura por la cantidad TOTAL original
  // (venta/precio/recargo se calculan sobre ella, ver construirItemsDesdeFormulario).
  // Los lotes adicionales solo descuentan cantidad física del total para
  // fines de trazabilidad de lote/vencimiento — nunca tienen costo propio.
  const cantidadTotalReferencia = Number(nuevoItem.cantidad) || 0;
  const cantidadAsignadaLotes = lotesAdicionales.reduce((acc, f) => acc + (Number(f.cantidad) || 0), 0);
  const restanteLotes = cantidadTotalReferencia - cantidadAsignadaLotes;

  const resetContenidoPad = () => {
    setContenidoPad([]);
    setNumCotizacionPad('');
    setDraftContenido(DRAFT_CONTENIDO_VACIO);
    setErrorDraftContenido({});
  };

  const resetLotesAdicionales = () => {
    setLotesAdicionales([]);
    setDraftLote(DRAFT_LOTE_VACIO);
    setErrorDraftLote({});
  };

  useEffect(() => {
    const cotExistente = cotizaciones[0];
    if (cotExistente) {
      setNuevoItem(prev => ({
        ...prev,
        numCotizacion: cotExistente.numCotizacion || '',
        totalCotizacion: cotExistente.totalCotizacion ? String(cotExistente.totalCotizacion) : ''
      }));
    } else {
      setNuevoItem(prev => ({ ...prev, numCotizacion: '', totalCotizacion: '' }));
    }
    setEsPad(false);
    resetFibra();
    resetContenidoPad();
    resetLotesAdicionales();
    setErrores({});
    setDesbloqueadoLocal(false);
    setErrorCandado('');
  }, [bloqueActivoIndex]);

  const formatearMiles = (valor) => {
    if (valor === null || valor === undefined || valor === '') return '';
    const num = valor.toString().replace(/\D/g, '');
    if (num === '') return '';
    return new Intl.NumberFormat('es-CL').format(num);
  };

  const handleSeleccionarSugerencia = (item) => {
    skipNext.current = true;
    const esPadItem = esClasePad(item.clase);
    const esFibraItem = !esPadItem && esCodigoFibra(item);
    setEsPad(esPadItem);
    setEsFibra(esFibraItem);
    setFibraElegida(null);
    if (!esPadItem) resetContenidoPad();
    resetLotesAdicionales();

    setNuevoItem(prev => ({
      ...prev,
      referencia: item.referencia || prev.referencia,
      codigo: item.codigo || '',
      precio: item.precioNeto ?? 0,
      empresaVinculada: item.empresa || '',
      tipoVinculado: item.tipo || '',
      detalle: item.descriptorEmpresa || item.descriptorAuto || '',
      descriptorAuto: item.descriptorAuto || '',
      clase: item.clase || '',
      lote: esPadItem ? VALOR_LOTE_VENCIMIENTO_PAD : esFibraItem ? '' : prev.lote,
      vencimiento: esPadItem ? VALOR_LOTE_VENCIMIENTO_PAD : esFibraItem ? '' : prev.vencimiento,
      ...(esFibraItem ? { cantidad: '1' } : {})
    }));
    setMostrarSug(false);
  };

  const handleChange = (field, value) => {
    if (field === 'referencia') {
      setNuevoItem(prev => ({
        ...prev,
        referencia: value,
        codigo: '',
        precio: '',
        empresaVinculada: '',
        tipoVinculado: '',
        detalle: '',
        descriptorAuto: '',
        clase: ''
      }));
      setEsPad(false);
      resetFibra();
      resetContenidoPad();
      resetLotesAdicionales();
      return;
    }
    // Fibra: cantidad, lote y vencimiento los fija la fibra elegida.
    if (esFibra && ['cantidad', 'lote', 'vencimiento'].includes(field)) return;
    if (field === 'cantidad' && lotesAdicionales.length > 0) {
      // Si ya se habían repartido lotes con la cantidad anterior, cambiar
      // la cantidad total invalida ese reparto (podría sumar más de lo
      // nuevo) — se reinicia y el usuario vuelve a repartir si corresponde.
      resetLotesAdicionales();
    }
    setNuevoItem(prev => ({ ...prev, [field]: value }));
    if (errores[field]) setErrores(prev => ({ ...prev, [field]: false }));
  };

  const handleDraftReferenciaChange = (value) => {
    setDraftContenido(prev => ({
      ...prev,
      referencia: value,
      codigo: '',
      descriptorAuto: '',
      detalle: '',
      clase: '',
      tipoVinculado: '',
      empresaVinculada: ''
    }));
    if (errorDraftContenido.referencia) setErrorDraftContenido(prev => ({ ...prev, referencia: false }));
  };

  const handleDraftSeleccionarSugerencia = (item) => {
    skipNextContenido.current = true;
    setDraftContenido(prev => ({
      ...prev,
      referencia: item.referencia || prev.referencia,
      codigo: item.codigo || '',
      descriptorAuto: item.descriptorAuto || '',
      detalle: item.descriptorEmpresa || item.descriptorAuto || '',
      clase: item.clase || '',
      tipoVinculado: item.tipo || '',
      empresaVinculada: item.empresa || ''
    }));
    setMostrarSugContenido(false);
  };

  const handleDraftChange = (field, value) => {
    setDraftContenido(prev => ({ ...prev, [field]: value }));
    if (errorDraftContenido[field]) setErrorDraftContenido(prev => ({ ...prev, [field]: false }));
  };

  const handleRegistrarContenido = () => {
    if (!puedeAgregarContenidoPad) return;
    const err = {};
    if (!draftContenido.referencia.trim()) err.referencia = true;
    if (!draftContenido.cantidad || Number(draftContenido.cantidad) <= 0) err.cantidad = true;

    if (Object.keys(err).length > 0) {
      setErrorDraftContenido(err);
      enfocar(err.referencia ? referenciaContenidoRef : cantidadContenidoRef);
      return;
    }

    const filaRegistrada = {
      ...draftContenido,
      tempId: crypto.randomUUID(),
      referencia: draftContenido.referencia.trim(),
      cantidad: Number(draftContenido.cantidad),
      lote: draftContenido.lote.trim() || 'Sin lote',
      vencimiento: draftContenido.vencimiento || 'Sin fecha'
    };

    setContenidoPad(prev => [...prev, filaRegistrada]);
    setDraftContenido(DRAFT_CONTENIDO_VACIO);
    setErrorDraftContenido({});
    // Siguiente línea del contenido del PAD (no la Referencia principal).
    enfocar(referenciaContenidoRef);
  };

  const handleEliminarContenidoRegistrado = (tempId) => {
    setContenidoPad(prev => prev.filter(f => f.tempId !== tempId));
  };

  // Edición de una línea ya registrada (ver ContenidoPadRegistrado).
  const handleActualizarContenidoRegistrado = (tempId, fila) => {
    if (bloqueado || !puedeAgregarContenidoPad) return;
    setContenidoPad(prev => prev.map(f => (f.tempId === tempId ? { ...fila, tempId } : f)));
  };

  const handleDraftLoteChange = (field, value) => {
    setDraftLote(prev => ({ ...prev, [field]: value }));
    if (errorDraftLote[field]) setErrorDraftLote(prev => ({ ...prev, [field]: false }));
  };

  const handleRegistrarLote = () => {
    const cantidadNum = Number(draftLote.cantidad);
    const err = {};
    if (!draftLote.cantidad || isNaN(cantidadNum) || cantidadNum <= 0) {
      err.cantidad = true;
    } else if (cantidadNum > restanteLotes) {
      err.cantidad = true;
    }

    if (Object.keys(err).length > 0) {
      setErrorDraftLote(err);
      return;
    }

    const filaRegistrada = {
      ...draftLote,
      tempId: crypto.randomUUID(),
      cantidad: cantidadNum,
      lote: draftLote.lote.trim() || 'Sin lote',
      vencimiento: draftLote.vencimiento || 'Sin fecha'
    };

    setLotesAdicionales(prev => [...prev, filaRegistrada]);
    setDraftLote(DRAFT_LOTE_VACIO);
    setErrorDraftLote({});
  };

  const handleEliminarLoteRegistrado = (tempId) => {
    setLotesAdicionales(prev => prev.filter(f => f.tempId !== tempId));
  };

  const construirItemsDesdeFormulario = () => {
    const sinCodigo = !nuevoItem.codigo;
    const { vecesCosto, recargoEncontrado, venta, totalItem } = calcularCamposFinancieros(
      nuevoItem.precio, nuevoItem.cantidad, recargosActivos
    );

    const idPadPrincipal = esPad ? crypto.randomUUID() : undefined;
    const idReferenciaConLotes = (!esPad && lotesAdicionales.length > 0) ? crypto.randomUUID() : undefined;
    const idPrincipalGenerado = idPadPrincipal || idReferenciaConLotes;

    const conFibra = esFibra && fibraElegida;
    const itemPrincipal = {
      ...(idPrincipalGenerado ? { id: idPrincipalGenerado } : {}),
      // Sin usoId: el uso (y su número) se registra al guardar la gestión.
      ...(conFibra ? { fibra: { id: fibraElegida.id, codigoInterno: fibraElegida.codigoInterno, lote: fibraElegida.lote, vencimiento: fibraElegida.vencimiento, usosTotales: fibraElegida.usosTotales } } : {}),
      esPad,
      numCotizacion: nuevoItem.numCotizacion.trim(),
      totalCotizacion: nuevoItem.totalCotizacion ? Number(nuevoItem.totalCotizacion) : 0,
      referencia: nuevoItem.referencia.trim(),
      cantidad: conFibra ? 1 : (Number(nuevoItem.cantidad) || 0),
      lote: esPad ? VALOR_LOTE_VENCIMIENTO_PAD : conFibra ? fibraElegida.lote : (nuevoItem.lote.trim() || 'Sin lote'),
      vencimiento: esPad ? VALOR_LOTE_VENCIMIENTO_PAD : conFibra ? fibraElegida.vencimiento : (nuevoItem.vencimiento || 'Sin fecha'),
      codigo: nuevoItem.codigo || '',
      precio: Number(nuevoItem.precio) || 0,
      vecesCosto,
      recargoEncontrado,
      venta,
      totalItem,
      empresaVinculada: nuevoItem.empresaVinculada || '',
      tipoVinculado: nuevoItem.tipoVinculado || 'P',
      detalle: nuevoItem.detalle || 'P',
      descriptorAuto: nuevoItem.descriptorAuto || 'P',
      clase: nuevoItem.clase || 'P',
      sinCodigo,
      estadoCarga: 'PENDIENTE',
      periodoAnio: periodoAbierto.anio,
      periodoMes: periodoAbierto.mes
    };

    const itemsContenido = [];
    if (esPad && contenidoPad.length > 0) {
      const numCotContenido = numCotizacionPad.trim() || nuevoItem.numCotizacion.trim();
      contenidoPad.forEach(fila => {
        itemsContenido.push(construirItemContenidoPadDesdeFila(fila, idPadPrincipal, {
          numCotizacion: numCotContenido,
          totalCotizacion: 0,
          periodoAnio: periodoAbierto.anio,
          periodoMes: periodoAbierto.mes
        }));
      });
    }

    const itemsLotes = [];
    if (!esPad && lotesAdicionales.length > 0) {
      lotesAdicionales.forEach(fila => {
        itemsLotes.push(construirItemLoteDesdeFila(fila, idReferenciaConLotes, {
          numCotizacion: nuevoItem.numCotizacion.trim(),
          referencia: nuevoItem.referencia.trim(),
          empresaVinculada: nuevoItem.empresaVinculada || '',
          tipoVinculado: nuevoItem.tipoVinculado || 'P',
          detalle: nuevoItem.detalle || 'P',
          descriptorAuto: nuevoItem.descriptorAuto || 'P',
          clase: nuevoItem.clase || 'P',
          periodoAnio: periodoAbierto.anio,
          periodoMes: periodoAbierto.mes
        }));
      });
    }

    return [itemPrincipal, ...itemsContenido, ...itemsLotes];
  };

  const limpiarFormularioNuevoItem = () => {
    setNuevoItem(prev => ({
      ...INITIAL_ITEM,
      numCotizacion: prev.numCotizacion,
      totalCotizacion: prev.totalCotizacion
    }));
    setEsPad(false);
    resetFibra();
    resetContenidoPad();
    resetLotesAdicionales();
    setErrores({});
  };

  const handleAgregar = () => {
    if (!periodoAbierto) return;

    const err = {};
    if (!nuevoItem.numCotizacion.trim()) err.numCotizacion = true;
    if (!nuevoItem.referencia.trim()) err.referencia = true;
    if (!nuevoItem.cantidad || Number(nuevoItem.cantidad) <= 0) err.cantidad = true;
    if (esFibra && !fibraElegida) err.fibra = true;

    if (Object.keys(err).length > 0) {
      setErrores(err);
      // Primer campo con error; los datos ingresados se conservan.
      if (err.numCotizacion || err.referencia || err.cantidad) enfocar(err.numCotizacion ? numCotizacionRef : err.referencia ? referenciaRef : cantidadRef);
      return;
    }

    construirItemsDesdeFormulario().forEach(item => onAgregarItem(bloqueActivoIndex, item));
    limpiarFormularioNuevoItem();
    // Lista para la siguiente referencia (el formulario la deja vacía).
    enfocar(referenciaRef);
  };

  const handleAbrirCandado = async () => {
    if (!bloqueActivo || verificandoCandado) return;
    setErrorCandado('');
    setVerificandoCandado(true);
    try {
      const items = bloqueActivo.cotizaciones?.[0]?.items || [];
      const resultado = await verificarPeriodosBloque(items, bloqueActivo);
      if (resultado.estado !== 'ABIERTO') {
        setErrorCandado(
          resultado.estado === 'CERRADO'
            ? 'No se puede editar: el período de este bloque ya fue cerrado.'
            : 'No se pudo determinar el período de este bloque — contactá a un administrador.'
        );
        return;
      }
      setDesbloqueadoLocal(true);
    } catch (error) {
      console.error('Error al verificar período para desbloquear candado:', error);
      setErrorCandado('No se pudo verificar el período. Intentá de nuevo.');
    } finally {
      setVerificandoCandado(false);
    }
  };

  useImperativeHandle(ref, () => ({
    estaBloqueDesbloqueado: () => desbloqueadoLocal,
    confirmarItemPendiente: () => {
      const hayItemCargado = !!(
        nuevoItem.referencia.trim() ||
        nuevoItem.cantidad ||
        contenidoPad.length > 0 ||
        lotesAdicionales.length > 0
      );

      if (!hayItemCargado) {
        const totalIngresado = nuevoItem.totalCotizacion !== '' ? Number(nuevoItem.totalCotizacion) : null;
        const totalActual = cotizaciones[0]?.totalCotizacion ?? 0;

        if (cotizaciones.length > 0 && totalIngresado !== null && totalIngresado !== totalActual) {
          return {
            status: 'solo-total',
            totalCotizacion: totalIngresado,
            numCotizacion: nuevoItem.numCotizacion.trim() || undefined
          };
        }

        return { status: 'vacio' };
      }

      if (!periodoAbierto) return { status: 'incompleto' };

      const err = {};
      if (!nuevoItem.numCotizacion.trim()) err.numCotizacion = true;
      if (!nuevoItem.referencia.trim()) err.referencia = true;
      if (!nuevoItem.cantidad || Number(nuevoItem.cantidad) <= 0) err.cantidad = true;
    if (esFibra && !fibraElegida) err.fibra = true;

      if (Object.keys(err).length > 0) {
        setErrores(err);
        return { status: 'incompleto' };
      }

      const items = construirItemsDesdeFormulario();
      limpiarFormularioNuevoItem();
      return { status: 'ok', items };
    }
  }));

  if (!bloqueActivo) {
    return (
      <div className="px-4 lg:px-6 py-4 w-full max-w-[2200px] mx-auto">
        <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700/80 rounded-lg shadow-xs p-6 text-[10px] text-slate-500 dark:text-gray-400">
          Selecciona una empresa/fecha en el panel lateral para gestionar sus cargas.
        </div>
      </div>
    );
  }

  const sinPeriodoAbierto = !cargandoPeriodo && !periodoAbierto;

  // Usa todo el ancho junto al panel "Empresas / Fechas" (antes max-w-7xl);
  // en pantallas muy anchas se limita a 2200 px para no estirarse.
  return (
    <div className="px-4 lg:px-6 py-4 w-full max-w-[2200px] mx-auto space-y-3">

      <div className="flex items-center justify-between gap-1.5 px-1">
        <div className="flex items-center gap-1.5">
          <UploadCloud size={13} className="text-[#2383C2]" />
          <h3 className="text-[11px] font-bold text-slate-700 dark:text-gray-200 uppercase tracking-wide">
            Cotizaciones — Admisión #{formData?.gestionId || 'N/A'} - {formData?.nombre || 'P'}
          </h3>
          {handleCopiarTexto && (
            <button
              type="button"
              onClick={() => handleCopiarTexto(construirTextoAdmisionNombre(formData?.gestionId, formData?.nombre))}
              title="Copiar Admisión - Nombre"
              className="p-0.5 rounded text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition shrink-0"
            >
              <Copy size={11} />
            </button>
          )}
          {bloqueSolicitado && hasPermission(PATH_VISTA, 'tabla_cotizaciones', 'accion_desbloquear_candado') && (
            <button
              type="button"
              onClick={bloqueado ? handleAbrirCandado : undefined}
              disabled={!bloqueado || verificandoCandado}
              title={
                bloqueado
                  ? 'Este bloque ya está imputado — click para desbloquear edición'
                  : 'Desbloqueado — edita y presiona "Guardar Todo" para volver a bloquearlo'
              }
              className={`flex items-center gap-1 h-6 px-2 rounded text-[9px] font-bold transition shrink-0 ${
                bloqueado
                  ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-950/50 cursor-pointer'
                  : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 cursor-default'
              } disabled:opacity-60`}
            >
              {verificandoCandado ? (
                <Loader2 size={11} className="animate-spin" />
              ) : bloqueado ? (
                <Lock size={11} />
              ) : (
                <Unlock size={11} />
              )}
              <span>{bloqueado ? 'Imputado' : 'Editando'}</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-[9px] text-slate-500 dark:text-gray-400">
          <span className="flex items-center gap-1">
            <Building2 size={11} className="text-[#2383C2]" />
            {bloqueActivo.empresa || 'SIN EMPRESA'}
          </span>
          <span className="text-slate-300 dark:text-gray-600">/</span>
          <span className="flex items-center gap-1">
            <CalendarIcon size={11} className="text-[#2383C2]" />
            {formatearFechaTabla(bloqueActivo.fecha)}
          </span>
          {periodoAbierto && (
            <>
              <span className="text-slate-300 dark:text-gray-600">/</span>
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                Período: {periodoAbierto.mes.toUpperCase()} {periodoAbierto.anio}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Fuera del fieldset: se ve (y se copia) también con el bloque imputado. */}
      <NotasAdmision
        descripcion={formData?.descripcion}
        observacion={formData?.observacion}
        onCopiar={handleCopiarTexto}
        onEditar={puedeEditarNotas ? onIrAInformacion : undefined}
        verDescripcion={verDescripcion}
        verObservacion={verObservacion}
      />

      {sinPeriodoAbierto && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-[11px] text-red-700 dark:text-red-400">
          <Lock size={14} className="shrink-0" />
          <span>
            No hay un período abierto para <strong>Implantes</strong> en Control Mensual. No se pueden registrar ítems nuevos hasta que se abra un período.
          </span>
        </div>
      )}

      {bloqueado && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-[11px] text-amber-700 dark:text-amber-400">
          <Lock size={14} className="shrink-0" />
          <span>
            Este bloque ya fue solicitado e imputado. Está en solo lectura — presiona el candado para desbloquearlo y poder editarlo.
          </span>
        </div>
      )}

      {errorCandado && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-[11px] text-red-700 dark:text-red-400">
          <AlertCircle size={14} className="shrink-0" />
          <span>{errorCandado}</span>
        </div>
      )}

      <fieldset disabled={sinPeriodoAbierto || bloqueado} className={sinPeriodoAbierto || bloqueado ? 'opacity-60' : ''}>
        <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700/80 rounded-lg shadow-xs p-3 space-y-2.5">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 items-end">

            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-slate-500 dark:text-gray-400 uppercase flex justify-between">
                <span>N° Cotización</span>
                <span className="text-red-500">*</span>
              </label>
              <input
                ref={numCotizacionRef}
                aria-label="N° Cotización"
                type="text"
                value={nuevoItem.numCotizacion}
                onChange={e => handleChange('numCotizacion', e.target.value)}
                className={`h-7 px-2 text-[10px] border rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 outline-none ${errores.numCotizacion ? 'border-red-500 ring-1 ring-red-500/30' : 'border-slate-300 dark:border-gray-600 focus:ring-1 focus:ring-[#2383C2]'
                  }`}
                placeholder="Ej: COT-001"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-slate-500 dark:text-gray-400 uppercase">
                Total Cot. <span className="text-slate-400 normal-case font-normal">(= Costo del bloque)</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={formatearMiles(nuevoItem.totalCotizacion)}
                onChange={e => {
                  const soloNumeros = e.target.value.replace(/\D/g, '');
                  handleChange('totalCotizacion', soloNumeros);
                }}
                className="h-7 px-2 text-[10px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 outline-none focus:ring-1 focus:ring-[#2383C2]"
                placeholder="0"
              />
            </div>

            <div className="flex flex-col gap-1 relative lg:col-span-2" ref={containerRef}>
              <label className="text-[9px] font-bold text-slate-500 dark:text-gray-400 uppercase flex justify-between">
                <span>Referencia</span>
                <span className="text-red-500">*</span>
              </label>
              <input
                ref={referenciaRef}
                aria-label="Referencia"
                type="text"
                value={nuevoItem.referencia}
                onChange={e => handleChange('referencia', e.target.value)}
                onFocus={() => sugerencias.length > 0 && setMostrarSug(true)}
                autoComplete="off"
                className={`h-7 px-2 text-[10px] border rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 outline-none ${errores.referencia ? 'border-red-500 ring-1 ring-red-500/30' : 'border-slate-300 dark:border-gray-600 focus:ring-1 focus:ring-[#2383C2]'
                  }`}
                placeholder="Buscar referencia..."
              />

              {mostrarSug && (
                <div className="absolute top-full left-0 mt-1 w-64 max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded shadow-lg z-30">
                  {buscando ? (
                    <div className="px-2.5 py-2 text-[10px] text-slate-400 flex items-center gap-1.5">
                      <Loader2 size={11} className="animate-spin" /> Buscando...
                    </div>
                  ) : sugerencias.length === 0 ? (
                    <div className="px-2.5 py-2 text-[10px] text-slate-400">Sin coincidencias</div>
                  ) : (
                    sugerencias.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSeleccionarSugerencia(item)}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-gray-700/60 border-b border-slate-100 dark:border-gray-700/50 last:border-b-0"
                      >
                        <div className="text-[10px] font-semibold text-slate-700 dark:text-gray-200 truncate flex items-center gap-1">
                          {item.referencia}
                          {esClasePad(item.clase) && (
                            <span className="text-[8px] px-1 rounded bg-fuchsia-100 dark:bg-fuchsia-950/40 text-fuchsia-700 dark:text-fuchsia-400 font-bold">PAD</span>
                          )}
                          {!esClasePad(item.clase) && esCodigoFibra(item) && (
                            <span className="text-[8px] px-1 rounded bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 font-bold">FIBRA</span>
                          )}
                        </div>
                        <div className="text-[9px] text-slate-400 dark:text-gray-500 flex items-center gap-1.5">
                          <span className="font-num text-emerald-600 dark:text-emerald-400">{item.codigo || 'S/C'}</span>
                          <span>·</span>
                          <span className="truncate">{item.empresa}</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-slate-500 dark:text-gray-400 uppercase flex justify-between">
                <span>Cant.</span>
                <span className="text-red-500">*</span>
              </label>
              <input
                ref={cantidadRef}
                aria-label="Cantidad"
                type="number"
                {...SIN_CAMBIO_ACCIDENTAL}
                value={nuevoItem.cantidad}
                disabled={esFibra}
                title={esFibra ? 'Fibra reutilizable: cada línea es un uso' : undefined}
                onChange={e => handleChange('cantidad', e.target.value)}
                className={`${CLASE_SIN_FLECHAS} disabled:bg-slate-100 dark:disabled:bg-gray-800 h-7 px-2 text-[10px] border rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 outline-none ${errores.cantidad ? 'border-red-500 ring-1 ring-red-500/30' : 'border-slate-300 dark:border-gray-600 focus:ring-1 focus:ring-[#2383C2]'
                  }`}
                placeholder="1"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-slate-500 dark:text-gray-400 uppercase">Lote</label>
              <input
                type="text"
                value={esPad ? VALOR_LOTE_VENCIMIENTO_PAD : nuevoItem.lote}
                disabled={esPad || esFibra}
                onChange={e => handleChange('lote', e.target.value)}
                className={`h-7 px-2 text-[10px] border rounded outline-none ${esPad || esFibra
                  ? 'bg-slate-100 dark:bg-gray-800 border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400'
                  : 'bg-white dark:bg-gray-900 border-slate-300 dark:border-gray-600 text-slate-800 dark:text-gray-100 focus:ring-1 focus:ring-[#2383C2]'
                  }`}
                placeholder="Ej: L-4521"
              />
            </div>

            <div className="flex items-end gap-1.5">
              <div className="flex flex-col gap-1 flex-grow">
                <label className="text-[9px] font-bold text-slate-500 dark:text-gray-400 uppercase">Vencimiento</label>
                {esPad ? (
                  <input
                    type="text"
                    value={VALOR_LOTE_VENCIMIENTO_PAD}
                    disabled
                    className="h-7 px-2 text-[10px] border border-slate-200 dark:border-gray-700 rounded bg-slate-100 dark:bg-gray-800 text-slate-500 dark:text-gray-400 outline-none"
                  />
                ) : (
                  <input
                    type="date"
                    aria-label="Vencimiento"
                    value={nuevoItem.vencimiento}
                    disabled={esFibra}
                    onChange={e => handleChange('vencimiento', e.target.value)}
                    onKeyDown={alPresionarEnter(() => { if (!sinPeriodoAbierto && !bloqueado) handleAgregar(); })}
                    className="h-7 px-2 text-[10px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 outline-none focus:ring-1 focus:ring-[#2383C2]"
                  />
                )}
              </div>
              <button
                type="button"
                onClick={handleAgregar}
                disabled={sinPeriodoAbierto || bloqueado}
                className="h-7 px-2.5 bg-[#2383C2] hover:bg-[#1d6fa5] text-white rounded font-semibold flex items-center justify-center gap-1 transition text-[10px] shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                title={bloqueado ? 'Bloqueado: desbloquea el candado para agregar ítems' : sinPeriodoAbierto ? "No hay período abierto para Implantes" : "Agregar ítem"}
              >
                <Plus size={13} />
              </button>
            </div>
          </div>

          {(errores.numCotizacion || errores.referencia || errores.cantidad) && (
            <div className="text-[9px] text-red-500 font-medium flex items-center gap-1">
              <AlertCircle size={10} /> N° Cotización, Referencia y Cantidad son obligatorios
            </div>
          )}

          {esFibra && (
            <SelectorFibra
              referencia={nuevoItem.referencia}
              fechaCirugia={bloqueActivo.fecha}
              fibras={fibrasReferencia.fibras}
              cargando={fibrasReferencia.cargando}
              error={fibrasReferencia.error}
              excluir={fibrasUsadas}
              seleccionadaId={fibraElegida?.id || null}
              onElegir={elegirFibra}
              deshabilitado={sinPeriodoAbierto || bloqueado}
            />
          )}
          {errores.fibra && (
            <div className="text-[9px] text-red-500 font-medium flex items-center gap-1">
              <AlertCircle size={10} /> Elige la fibra usada
            </div>
          )}

          {esPad && puedeAgregarContenidoPad && (
            <div className="border border-fuchsia-200 dark:border-fuchsia-900 bg-fuchsia-50/40 dark:bg-fuchsia-950/10 rounded-lg p-2.5 space-y-2.5">
              <span className="text-[10px] font-bold text-fuchsia-700 dark:text-fuchsia-400 uppercase flex items-center gap-1">
                <Package size={12} /> Contenido del PAD <span className="text-[9px] font-normal normal-case text-fuchsia-500 dark:text-fuchsia-500">(opcional, puedes completarlo ahora o más adelante)</span>
              </span>

              <div className="bg-white/60 dark:bg-gray-900/40 rounded border border-fuchsia-200/70 dark:border-fuchsia-900/50 p-2 space-y-1">
                <label className="text-[9px] font-bold text-fuchsia-700 dark:text-fuchsia-400 uppercase">
                  N° Cotización del contenido
                </label>
                <input
                  type="text"
                  value={numCotizacionPad}
                  onChange={e => setNumCotizacionPad(e.target.value)}
                  className="w-full h-7 px-2 text-[10px] border border-fuchsia-300 dark:border-fuchsia-800 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 outline-none focus:ring-1 focus:ring-fuchsia-500"
                  placeholder={nuevoItem.numCotizacion ? `Vacío = ${nuevoItem.numCotizacion}` : 'Ej: COT-002'}
                />
                <p className="text-[9px] text-fuchsia-500 dark:text-fuchsia-500 italic">
                  Déjalo en blanco si el contenido se cotizó junto con la referencia principal (usará "{nuevoItem.numCotizacion || 'la misma cotización'}"). El contenido siempre se guarda con precio $0.
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end bg-white dark:bg-gray-900/60 rounded border border-fuchsia-200 dark:border-fuchsia-900/60 p-2">
                <div className="flex flex-col gap-1 relative md:col-span-2" ref={containerRefContenido}>
                  <label className="text-[9px] font-bold text-slate-500 dark:text-gray-400 uppercase">Referencia contenido</label>
                  <input
                    ref={referenciaContenidoRef}
                    aria-label="Referencia contenido"
                    type="text"
                    value={draftContenido.referencia}
                    onChange={e => handleDraftReferenciaChange(e.target.value)}
                    onFocus={() => sugerenciasContenido.length > 0 && setMostrarSugContenido(true)}
                    autoComplete="off"
                    className={`h-7 px-2 text-[10px] border rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 outline-none ${errorDraftContenido.referencia ? 'border-red-500 ring-1 ring-red-500/30' : 'border-slate-300 dark:border-gray-600 focus:ring-1 focus:ring-[#2383C2]'}`}
                    placeholder="Buscar referencia..."
                  />
                  {mostrarSugContenido && (
                    <div className="absolute top-full left-0 mt-1 w-56 max-h-40 overflow-y-auto bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded shadow-lg z-30">
                      {buscandoContenido ? (
                        <div className="px-2.5 py-2 text-[10px] text-slate-400 flex items-center gap-1.5">
                          <Loader2 size={11} className="animate-spin" /> Buscando...
                        </div>
                      ) : sugerenciasContenido.length === 0 ? (
                        <div className="px-2.5 py-2 text-[10px] text-slate-400">Sin coincidencias</div>
                      ) : (
                        sugerenciasContenido.map(item => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleDraftSeleccionarSugerencia(item)}
                            className="w-full text-left px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-gray-700/60 border-b border-slate-100 dark:border-gray-700/50 last:border-b-0"
                          >
                            <div className="text-[10px] font-semibold text-slate-700 dark:text-gray-200 truncate">{item.referencia}</div>
                            <div className="text-[9px] text-slate-400 dark:text-gray-500 flex items-center gap-1.5">
                              <span className="font-num text-emerald-600 dark:text-emerald-400">{item.codigo || 'S/C'}</span>
                              <span>·</span>
                              <span className="truncate">{item.descriptorAuto || item.empresa}</span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-slate-500 dark:text-gray-400 uppercase">Cant.</label>
                  <input
                    ref={cantidadContenidoRef}
                    aria-label="Cantidad contenido"
                    type="number"
                    {...SIN_CAMBIO_ACCIDENTAL}
                    value={draftContenido.cantidad}
                    onChange={e => handleDraftChange('cantidad', e.target.value)}
                    className={`${CLASE_SIN_FLECHAS} h-7 px-2 text-[10px] border rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 outline-none ${errorDraftContenido.cantidad ? 'border-red-500 ring-1 ring-red-500/30' : 'border-slate-300 dark:border-gray-600'}`}
                    placeholder="1"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-slate-500 dark:text-gray-400 uppercase">Lote</label>
                  <input
                    type="text"
                    value={draftContenido.lote}
                    onChange={e => handleDraftChange('lote', e.target.value)}
                    className="h-7 px-2 text-[10px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 outline-none"
                    placeholder="Vacío = Sin lote"
                  />
                </div>

                <div className="flex items-end gap-1.5">
                  <div className="flex flex-col gap-1 flex-grow">
                    <label className="text-[9px] font-bold text-slate-500 dark:text-gray-400 uppercase">Vencimiento</label>
                    <input
                      type="date"
                      aria-label="Vencimiento contenido"
                      value={draftContenido.vencimiento}
                      onChange={e => handleDraftChange('vencimiento', e.target.value)}
                      onKeyDown={alPresionarEnter(handleRegistrarContenido)}
                      className="h-7 px-2 text-[10px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleRegistrarContenido}
                    className="h-7 px-2.5 bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded font-semibold flex items-center justify-center gap-1 transition text-[10px] shrink-0"
                    title="Registrar esta línea de contenido"
                  >
                    <Check size={13} />
                  </button>
                </div>

                {(errorDraftContenido.referencia || errorDraftContenido.cantidad) && (
                  <div className="md:col-span-5 text-[9px] text-red-500 font-medium flex items-center gap-1">
                    <AlertCircle size={10} /> Referencia y Cantidad son obligatorias para registrar
                  </div>
                )}

                <div className="md:col-span-5 text-[9px] text-slate-400 dark:text-gray-500 truncate">
                  {draftContenido.descriptorAuto || (draftContenido.referencia.trim() ? 'Sin descripción encontrada' : 'Vacío = Sin lote / Sin fecha al registrar')}
                </div>
              </div>

              {contenidoPad.length > 0 && (
                <ContenidoPadRegistrado
                  filas={contenidoPad}
                  onActualizar={handleActualizarContenidoRegistrado}
                  onEliminar={handleEliminarContenidoRegistrado}
                  deshabilitado={bloqueado || sinPeriodoAbierto || !puedeAgregarContenidoPad}
                />
              )}

              <p className="text-[9px] text-fuchsia-600 dark:text-fuchsia-400 italic">
                Si no registras contenido aquí, el PAD se guardará solo y quedará marcado como "Contenido pendiente" en la tabla
                hasta que se lo agregues (ahí mismo, cuando quieras). El ítem principal (el código que buscaste) queda con Lote y
                Vencimiento = "PAD".
              </p>
            </div>
          )}

          {!esPad && cantidadTotalReferencia > 1 && (
            <div className="border border-sky-200 dark:border-sky-900 bg-sky-50/40 dark:bg-sky-950/10 rounded-lg p-2.5 space-y-2.5">
              <span className="text-[10px] font-bold text-sky-700 dark:text-sky-400 uppercase flex items-center gap-1">
                <Layers size={12} /> Repartir en varios lotes <span className="text-[9px] font-normal normal-case text-sky-500 dark:text-sky-500">(opcional, solo si esta cantidad viene de lotes/vencimientos distintos)</span>
              </span>

              <div className="flex flex-wrap items-center gap-3 text-[9px] font-semibold">
                <span className="text-sky-700 dark:text-sky-400">Cantidad total: {cantidadTotalReferencia}</span>
                <span className="text-sky-700 dark:text-sky-400">Asignada a otros lotes: {cantidadAsignadaLotes}</span>
                <span className={restanteLotes === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-sky-700 dark:text-sky-400'}>
                  Queda en el lote principal ({nuevoItem.lote.trim() || 'sin especificar'}): {restanteLotes}
                </span>
              </div>

              {restanteLotes > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end bg-white dark:bg-gray-900/60 rounded border border-sky-200 dark:border-sky-900/60 p-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-bold text-slate-500 dark:text-gray-400 uppercase">
                      Cant. <span className="text-slate-400 normal-case font-normal">(máx. {restanteLotes})</span>
                    </label>
                    <input
                      type="number"
                      {...SIN_CAMBIO_ACCIDENTAL}
                      value={draftLote.cantidad}
                      onChange={e => handleDraftLoteChange('cantidad', e.target.value)}
                      className={`${CLASE_SIN_FLECHAS} h-7 px-2 text-[10px] border rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 outline-none ${errorDraftLote.cantidad ? 'border-red-500 ring-1 ring-red-500/30' : 'border-slate-300 dark:border-gray-600'}`}
                      placeholder="1"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-bold text-slate-500 dark:text-gray-400 uppercase">Lote</label>
                    <input
                      type="text"
                      value={draftLote.lote}
                      onChange={e => handleDraftLoteChange('lote', e.target.value)}
                      className="h-7 px-2 text-[10px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 outline-none"
                      placeholder="Ej: L-9921"
                    />
                  </div>

                  <div className="flex items-end gap-1.5">
                    <div className="flex flex-col gap-1 flex-grow">
                      <label className="text-[9px] font-bold text-slate-500 dark:text-gray-400 uppercase">Vencimiento</label>
                      <input
                        type="date"
                        value={draftLote.vencimiento}
                        onChange={e => handleDraftLoteChange('vencimiento', e.target.value)}
                        className="h-7 px-2 text-[10px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleRegistrarLote}
                      className="h-7 px-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded font-semibold flex items-center justify-center gap-1 transition text-[10px] shrink-0"
                      title="Registrar este lote"
                    >
                      <Check size={13} />
                    </button>
                  </div>

                  {errorDraftLote.cantidad && (
                    <div className="md:col-span-4 text-[9px] text-red-500 font-medium flex items-center gap-1">
                      <AlertCircle size={10} /> La cantidad debe ser mayor a 0 y no puede superar el restante ({restanteLotes})
                    </div>
                  )}

                  <div className="md:col-span-4 text-[9px] text-slate-400 dark:text-gray-500">
                    Este lote adicional se guarda sin código, sin costo y sin venta — la referencia principal ya factura la cantidad total.
                  </div>
                </div>
              ) : (
                <p className="text-[9px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                  <Check size={11} /> Cantidad totalmente repartida entre lotes.
                </p>
              )}

              {lotesAdicionales.length > 0 && (
                <div className="overflow-hidden rounded border border-sky-200 dark:border-sky-900/60">
                  <table className="w-full text-left text-[10px] border-collapse">
                    <thead className="bg-sky-100/60 dark:bg-sky-950/30">
                      <tr className="text-sky-700 dark:text-sky-400 uppercase font-bold text-[9px]">
                        <th className="px-2 py-1 border-b border-sky-200 dark:border-sky-900/60 text-center">Cant.</th>
                        <th className="px-2 py-1 border-b border-sky-200 dark:border-sky-900/60">Lote</th>
                        <th className="px-2 py-1 border-b border-sky-200 dark:border-sky-900/60">Vencimiento</th>
                        <th className="px-2 py-1 border-b border-sky-200 dark:border-sky-900/60 text-center">Quitar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lotesAdicionales.map(fila => (
                        <tr key={fila.tempId} className="border-l-2 border-transparent hover:border-[#2383C2] bg-white dark:bg-gray-900/40 hover:bg-sky-50/40 dark:hover:bg-sky-950/10">
                          <td className="px-2 py-1 border-b border-sky-100 dark:border-sky-900/40 text-center text-slate-600 dark:text-gray-300">
                            {fila.cantidad}
                          </td>
                          <td className="px-2 py-1 border-b border-sky-100 dark:border-sky-900/40 text-slate-600 dark:text-gray-300">
                            {fila.lote === 'Sin lote'
                              ? <span className="italic text-slate-400 dark:text-gray-500">Sin lote</span>
                              : fila.lote}
                          </td>
                          <td className="px-2 py-1 border-b border-sky-100 dark:border-sky-900/40 text-slate-600 dark:text-gray-300">
                            {fila.vencimiento === 'Sin fecha'
                              ? <span className="italic text-slate-400 dark:text-gray-500">Sin fecha</span>
                              : formatearFechaTabla(fila.vencimiento)}
                          </td>
                          <td className="px-2 py-1 border-b border-sky-100 dark:border-sky-900/40 text-center">
                            <button
                              type="button"
                              onClick={() => handleEliminarLoteRegistrado(fila.tempId)}
                              className="text-red-500 hover:text-red-700 p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30"
                              title="Quitar este lote"
                            >
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 px-2.5 py-1.5 bg-gray-100/60 dark:bg-gray-900/40 rounded border border-dashed border-slate-200 dark:border-gray-700/60 text-[10px]">
            <span className="text-[9px] font-bold uppercase text-gray-400 dark:text-gray-500">Vinculado:</span>
            <span className="flex items-center gap-1">
              <span className="font-bold text-gray-500 dark:text-gray-400 text-[9px] uppercase">Código:</span>
              {buscando ? <Loader2 size={10} className="animate-spin text-[#2383C2]" /> : (
                <span className={`font-num font-semibold ${nuevoItem.codigo ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-500'}`}>
                  {nuevoItem.codigo || (nuevoItem.referencia.trim() ? 'NO ENCONTRADO' : 'P')}
                </span>
              )}
            </span>
            <span className="flex items-center gap-1">
              <span className="font-bold text-gray-500 dark:text-gray-400 text-[9px] uppercase">Clase:</span>
              <span className={`font-medium ${esPad ? 'text-fuchsia-600 dark:text-fuchsia-400 font-bold' : 'text-gray-700 dark:text-gray-200'}`}>
                {nuevoItem.clase || 'P'}
              </span>
            </span>
            <span className="flex items-center gap-1">
              <span className="font-bold text-gray-500 dark:text-gray-400 text-[9px] uppercase">Tipo:</span>
              <span className="font-medium text-gray-700 dark:text-gray-200">{nuevoItem.tipoVinculado || 'P'}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="font-bold text-gray-500 dark:text-gray-400 text-[9px] uppercase">Precio:</span>
              <span className="font-semibold text-gray-700 dark:text-gray-200">
                {nuevoItem.precio !== '' ? `$${formatearPesos(nuevoItem.precio)}` : 'P'}
              </span>
            </span>
            <span className="flex items-center gap-1">
              <span className="font-bold text-gray-500 dark:text-gray-400 text-[9px] uppercase">Recargo:</span>
              {cargandoRecargos ? (
                <Loader2 size={10} className="animate-spin text-[#2383C2]" />
              ) : nuevoItem.precio === '' ? (
                <span className="text-gray-700 dark:text-gray-200">P</span>
              ) : rangoActual ? (
                <span className="font-semibold text-gray-700 dark:text-gray-200">
                  {vecesCostoActual} <span className="text-[8px] text-gray-400 font-normal">(${formatearPesos(rangoActual.desde)} - ${formatearPesos(rangoActual.hasta)})</span>
                </span>
              ) : (
                <span className="font-semibold text-purple-600 dark:text-purple-400" title="No hay rango configurado en Recargos Maestros para este precio">
                  1 (sin rango)
                </span>
              )}
            </span>
            <span className="flex items-center gap-1">
              <span className="font-bold text-gray-500 dark:text-gray-400 text-[9px] uppercase">Venta:</span>
              <span className="font-semibold text-gray-700 dark:text-gray-200">
                ${formatearPesos(ventaActual)}
              </span>
            </span>
            <span className="flex items-center gap-1">
              <span className="font-bold text-gray-500 dark:text-gray-400 text-[9px] uppercase">Empresa:</span>
              <span className="font-medium text-gray-700 dark:text-gray-200">{nuevoItem.empresaVinculada || 'P'}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="font-bold text-gray-500 dark:text-gray-400 text-[9px] uppercase">Desc. Auto:</span>
              <span className="font-medium text-gray-700 dark:text-gray-200">{nuevoItem.descriptorAuto || 'P'}</span>
            </span>
          </div>
        </div>
      </fieldset>

      {cotizaciones.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700/80 rounded-lg p-6 text-center text-[10px] text-slate-400 dark:text-gray-500">
          Aún no hay ítems registrados para esta empresa/fecha.
        </div>
      ) : (
        <div className="space-y-2.5">
          {cotizaciones.map((cot, idx) => (
            <CotizacionCard
              key={cot.id}
              cotizacion={cot}
              bloqueEmpresa={bloqueActivo.empresa}
              gestionId={formData?.gestionId}
              bloqueFecha={bloqueActivo.fecha}
              recargosActivos={recargosActivos}
              defaultOpen={idx === cotizaciones.length - 1}
              periodoAbierto={periodoAbierto}
              soloLectura={bloqueado}
              puedeAgregarContenidoPad={puedeAgregarContenidoPad}
              onAgregarItem={(itemData) => onAgregarItem(bloqueActivoIndex, itemData)}
              onEliminarItem={(itemId) => onEliminarItem(bloqueActivoIndex, cot.id, itemId)}
              onEliminarCotizacion={() => onEliminarCotizacion(bloqueActivoIndex, cot.id)}
              onActualizarEstadoItem={(itemId, nuevoEstado) => onActualizarEstadoItem(bloqueActivoIndex, cot.id, itemId, nuevoEstado)}
              onEditarItem={(itemId, camposActualizados) => onEditarItem(bloqueActivoIndex, cot.id, itemId, camposActualizados)}
            />
          ))}
        </div>
      )}

      <p className="text-[9px] text-slate-400 dark:text-gray-500 italic px-1">
        Los ítems se guardan al presionar "Guardar Todo". Cada ítem queda imputado al período {periodoAbierto ? `${periodoAbierto.mes.toUpperCase()} ${periodoAbierto.anio}` : 'que esté abierto'} en Control Mensual.
      </p>
    </div>
  );
});

function buscarRangoRecargoLocal(precio, recargosActivos) {
  const p = Number(precio) || 0;
  return recargosActivos.find(r => p >= Number(r.desde) && p <= Number(r.hasta)) || null;
}
function calcularVentaUnitariaLocal(precio, vecesCosto) {
  const p = Number(precio) || 0;
  const v = Number(vecesCosto) || 1;
  return p * v;
}

export default CargasTab;