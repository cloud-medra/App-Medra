import React, { useState, useMemo, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Info, ListFilter, UploadCloud, Unlock, Lock, History, ShieldAlert, ClipboardList, Folder, PersonStanding } from 'lucide-react';

import { usePeriodoAbiertoStore } from '../../../../../../hooks/usePeriodoAbiertoStore';
import { useGranularPermission } from '../../../../../../hooks/useGranularPermission';
import { useToast } from '../../../../../../context/ToastContext';
import { MESES } from '../../../../administracion/controlMensual/constants';
import { InformacionTab } from './Informaciontab/Informaciontab';
import { DetallesTab } from '../../../shared/gestion/DetallesTab';
import { CargasTab } from './Cargastab/Cargastab';
import { DocumentosTab } from '../../../shared/documentosAdmision/DocumentosTab';
import { useDocumentosAdmision } from '../../../shared/documentosAdmision/useDocumentosAdmision';
import { esEstadoCargaCompleto } from './Cargastab/cargasHelpers';
import { verificarPeriodosBloque } from './Cargastab/verificacionPeriodoBloque';
import { camposSolicitudDe } from '../../../shared/periodoImputacion';
import { aplicarNuevoItemABloque } from '../utils/aplicarNuevoItemABloque';
import { EmpresasFechasPanel } from '../../../shared/gestion/EmpresasFechasPanel';
import { validarNuevaEmpresaFecha, extraerDatosBase } from '../../../shared/empresaFechaDesdeDetalle';
import { HistorialLogsContenido } from '../GestionesImplanteDrawers';
import { nombreParaGuardar } from '../utils/camposPaciente';
import { ocsDeGestion } from '../../../shared/ocIndex/indiceOC';
import { OrdenTab } from '../../../shared/ordenesOC/OrdenTab';
import { BodymapTab } from './Bodymaptab/BodymapTab';
import { useRegistroPdfOC } from '../../../shared/ordenesOC/useRegistroPdfOC';

const MODULO_ACTUAL = 'implantes';

// Cada pestaña es un `proceso` propio (path independiente) del
// componentMap de la pantalla contenedora (ver
// src/config/componentMaps/implantes.js) — su visibilidad se decide por
// existencia con hasAccesoProceso(path), no por un checkbox maestro de
// sección compartido entre las 4 (ver nota de useGranularPermission.js).
const ALL_TABS = [
  { id: 'detalles', label: 'Detalles', Icon: ListFilter, path: '/implantes/gestionImplantes/detalles' },
  { id: 'informacion', label: 'Información', Icon: Info, path: '/implantes/gestionImplantes/informacion' },
  { id: 'cargas', label: 'Cargas', Icon: UploadCloud, path: '/implantes/gestionImplantes/cargas' },
  { id: 'orden', label: 'Orden', Icon: ClipboardList, path: '/implantes/gestionImplantes/orden' },
  { id: 'documentos', label: 'Documentos', Icon: Folder, path: '/implantes/gestionImplantes/documentos' },
  { id: 'logs', label: 'Logs', Icon: History, path: '/implantes/gestionImplantes/logs' },
  { id: 'bodymap', label: 'Bodymap', Icon: PersonStanding, path: '/implantes/gestionImplantes/bodymap' },
];

const GestionesImplantesDetalleView = forwardRef(({
  item,
  todosLosRegistros = [],
  onGuardar,
  onCancelar,
  onAgregarEmpresaFecha,
  logsList = [],
  loadingLogs = false,
  cargarLogsDeImplante,
  formatearFecha,
  handleCopiarTexto,
  // (opcional) abre Maestros → Zonas por diagnóstico con esa descripción
  // (enlace del Bodymap cuando la descripción no tiene zona).
  onAbrirZonasDiagnostico
}, ref) => {

  const { hasAccesoProceso } = useGranularPermission();
  const { showToast } = useToast();
  const tabsPermitidas = useMemo(
    () => ALL_TABS.filter(t => hasAccesoProceso(t.path)),
    [hasAccesoProceso]
  );

  // Período activo del módulo desde el listener compartido de
  // cierres_periodos (src/stores/periodosStore.js); se pasa hacia abajo como
  // prop (periodoAbierto/cargandoPeriodo) a CargasTab.
  const { periodo: periodoDoc, cargando: cargandoPeriodo } = usePeriodoAbiertoStore(MODULO_ACTUAL);
  const periodoActivo = useMemo(
    () => (periodoDoc ? { anio: periodoDoc.anio, mes: periodoDoc.mes } : null),
    [periodoDoc]
  );

  const nombrePeriodoActivo = useMemo(() => {
    if (!periodoActivo) return '';
    const mesInfo = MESES.find(m => m.id === periodoActivo.mes);
    return `${mesInfo?.nombre || periodoActivo.mes} ${periodoActivo.anio}`;
  }, [periodoActivo]);

  const esCodigoPendiente = (codigo) => {
    const c = (codigo || '').toString().trim().toUpperCase();
    return c === '' || c === 'P' || c === 'SIN_ADMISION';
  };

  const obtenerCodigoAdmision = (registro) => {
    if (!registro) return '';
    const posibleId =
      registro.gestionId ??
      registro.agendaId ??
      registro.admision ??
      registro.numAdmision ??
      registro.idAdmision ??
      registro.codAdmision ??
      registro.nroAdmision ??
      registro.id;

    const codigo = posibleId !== null && posibleId !== undefined ? String(posibleId).trim() : '';

    return esCodigoPendiente(codigo) ? '' : codigo;
  };

  const admisionCodigoTarget = useMemo(() => {
    return obtenerCodigoAdmision(item);
  }, [item]);

  const registrosDeEstaAdmision = useMemo(() => {
    if (!admisionCodigoTarget) {
      return item ? [item] : [];
    }

    if (!Array.isArray(todosLosRegistros) || todosLosRegistros.length === 0) {
      return item ? [item] : [];
    }

    const filtrados = todosLosRegistros.filter(reg => {
      const regCodigo = obtenerCodigoAdmision(reg);
      return regCodigo === admisionCodigoTarget;
    });

    // Los bloques de la admisión mantienen su orden histórico (creación más
    // reciente primero), independiente del orden por defecto de la tabla.
    const msCreacion = (r) => (r.fechaRegistro?.toMillis ? r.fechaRegistro.toMillis() : new Date(r.fechaRegistro || 0).getTime());
    const ordenados = [...filtrados].sort((a, b) => msCreacion(b) - msCreacion(a));

    return ordenados.length > 0 ? ordenados : (item ? [item] : []);
  }, [admisionCodigoTarget, todosLosRegistros, item]);

  const [activeTab, setActiveTab] = useState(() => tabsPermitidas[0]?.id || null);

  // Fuente de verdad para qué pestaña se muestra realmente: si `activeTab`
  // quedó en un id que el usuario no tiene permitido (permisos que
  // cambiaron, o el valor por defecto de más arriba), cae al primer tab
  // permitido — mismo patrón que ArchivosControlVacunatorio/Laboratorio y
  // CodigosMaestros. Todo el render de abajo usa `tabActual`, nunca el
  // `activeTab` crudo, para que no haya forma de quedar mostrando una
  // pestaña sin permiso.
  const tabActual = useMemo(
    () => tabsPermitidas.find(t => t.id === activeTab) || tabsPermitidas[0] || null,
    [tabsPermitidas, activeTab]
  );

  const construirEstadoInicial = () => {
    const bloquesEmpresas = registrosDeEstaAdmision.map((reg, index) => ({
      uniqueKey: reg.id ? `id_${reg.id}` : `registro_${index}_${Date.now()}`,
      idOriginal: reg.id,
      refPath: reg.refPath || null,
      empresa: reg.empresa || reg.nombreEmpresa || reg.razonSocial || '',
      fecha: reg.fecha || reg.fechaAgenda || reg.fecha_agenda || '',
      costo: reg.costo ?? reg.monto ?? 0,
      cotizaciones: Array.isArray(reg.cotizaciones) ? reg.cotizaciones : [],
      solicitud: reg.solicitud || 'PENDIENTE',
      // Período de solicitud (candado y resincronización: ver periodoImputacion).
      ...camposSolicitudDe(reg),
      estado: reg.estado || 'AGENDADO',
      fechaInicioCarga: reg.fechaInicioCarga || null,
      fechaCarga: reg.fechaCarga || null
    }));

    return {
      gestionId: admisionCodigoTarget || obtenerCodigoAdmision(item),
      nombre: item?.nombre || item?.paciente || item?.nombrePaciente || '',
      convenio: item?.convenio || '',
      prevision: item?.prevision || '',
      medico: item?.medico || item?.nombreMedico || '',
      informe: item?.informe || 'PENDIENTE',
      atributo: item?.atributo || '',
      centro: item?.centro || item?.centroMedico || '',
      descripcion: item?.descripcion || item?.observacion || '',
      // Lado (Bodymap): las gestiones anteriores no lo tienen = No especificado.
      lado: item?.lado || 'no_especificado',
      observacion: item?.observacion || item?.notaLibre || item?.notas || '',
      bloques: bloquesEmpresas
    };
  };

  const [formData, setFormData] = useState(construirEstadoInicial);

  // OC por ítem (Sincronizar OC): se leen del registro EN VIVO (listener de la
  // tabla), no de formData, para que una sincronización hecha con el detalle
  // abierto se vea sin recargar. Alineado por índice con formData.bloques.
  const ocPorItemPorRegistro = useMemo(
    () => new Map(registrosDeEstaAdmision.map(r => [r.id, r.ocPorItem || {}])),
    [registrosDeEstaAdmision]
  );
  const ocPorItemBloques = useMemo(
    () => formData.bloques.map(b => ocPorItemPorRegistro.get(b.idOriginal) || {}),
    [formData.bloques, ocPorItemPorRegistro]
  );
  const ocsPorBloque = useMemo(
    () => formData.bloques.map((b, i) => ocsDeGestion({ cotizaciones: b.cotizaciones, ocPorItem: ocPorItemBloques[i] })),
    [formData.bloques, ocPorItemBloques]
  );
  const snapshotInicialRef = useRef(JSON.stringify(construirEstadoInicial()));

  const idsItemsOriginalesRef = useRef(
    registrosDeEstaAdmision.map(reg => {
      const items = Array.isArray(reg.cotizaciones) && reg.cotizaciones[0]?.items ? reg.cotizaciones[0].items : [];
      return items.map(it => ({
        id: it.id,
        periodoAnio: it.periodoAnio,
        periodoMes: it.periodoMes
      }));
    })
  );

  // Último estado guardado de cada registro de las cards, por id. Se
  // actualiza con el alta rápida y con su guardado automático (que puede
  // mover el registro a otra ruta con un id nuevo, p. ej. al pasar de 'P' a
  // un ID real). Es la base que hereda un nuevo registro.
  const registrosGuardadosRef = useRef(new Map(registrosDeEstaAdmision.map(r => [r.id, r])));

  const [erroresFecha, setErroresFecha] = useState({});
  const [bloqueActivoIndex, setBloqueActivoIndex] = useState(0);
  const cargasTabRef = useRef(null);
  const informacionTabRef = useRef(null);

  const handleGeneralChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleBloqueChange = (index, field, value) => {
    if (field === 'fecha' && value) {
      setErroresFecha(prev => ({ ...prev, [index]: false }));
    }

    setFormData(prev => {
      const nuevosBloques = [...prev.bloques];
      const bloque = { ...nuevosBloques[index], [field]: value };

      if (field === 'costo' && Array.isArray(bloque.cotizaciones) && bloque.cotizaciones.length > 0) {
        bloque.cotizaciones = [
          { ...bloque.cotizaciones[0], totalCotizacion: Number(value) || 0 },
          ...bloque.cotizaciones.slice(1)
        ];
      }

      nuevosBloques[index] = bloque;
      return { ...prev, bloques: nuevosBloques };
    });
  };

  const handleAgregarItemCotizacion = (bloqueIndex, data) => {
    setFormData(prev => {
      const nuevosBloques = [...prev.bloques];
      nuevosBloques[bloqueIndex] = aplicarNuevoItemABloque(nuevosBloques[bloqueIndex], data);
      return { ...prev, bloques: nuevosBloques };
    });
  };

  const handleEliminarItem = (bloqueIndex, cotizacionId, itemId) => {
    setFormData(prev => {
      const nuevosBloques = [...prev.bloques];
      const bloque = nuevosBloques[bloqueIndex];
      const nuevasCotizaciones = (bloque.cotizaciones || []).map(cot => {
        if (cot.id !== cotizacionId) return cot;
        return {
          ...cot,
          items: (cot.items || []).filter(it => it.id !== itemId && it.padPadreId !== itemId && it.lotePadreId !== itemId)
        };
      });
      nuevosBloques[bloqueIndex] = { ...bloque, cotizaciones: nuevasCotizaciones };
      return { ...prev, bloques: nuevosBloques };
    });
  };

  const handleActualizarEstadoItem = (bloqueIndex, cotizacionId, itemId, nuevoEstadoCarga) => {
    setFormData(prev => {
      const nuevosBloques = [...prev.bloques];
      const bloque = nuevosBloques[bloqueIndex];
      const nuevasCotizaciones = (bloque.cotizaciones || []).map(cot => {
        if (cot.id !== cotizacionId) return cot;
        return {
          ...cot,
          items: (cot.items || []).map(it => it.id === itemId ? { ...it, estadoCarga: nuevoEstadoCarga } : it)
        };
      });
      nuevosBloques[bloqueIndex] = { ...bloque, cotizaciones: nuevasCotizaciones };
      return { ...prev, bloques: nuevosBloques };
    });
  };

  const handleEditarItem = (bloqueIndex, cotizacionId, itemId, camposActualizados) => {
    setFormData(prev => {
      const nuevosBloques = [...prev.bloques];
      const bloque = nuevosBloques[bloqueIndex];
      const nuevasCotizaciones = (bloque.cotizaciones || []).map(cot => {
        if (cot.id !== cotizacionId) return cot;
        return {
          ...cot,
          items: (cot.items || []).map(it => it.id === itemId ? { ...it, ...camposActualizados } : it)
        };
      });
      nuevosBloques[bloqueIndex] = { ...bloque, cotizaciones: nuevasCotizaciones };
      return { ...prev, bloques: nuevosBloques };
    });
  };

  const handleEliminarCotizacion = (bloqueIndex, cotizacionId) => {
    setFormData(prev => {
      const nuevosBloques = [...prev.bloques];
      const bloque = nuevosBloques[bloqueIndex];
      nuevosBloques[bloqueIndex] = {
        ...bloque,
        cotizaciones: (bloque.cotizaciones || []).filter(c => c.id !== cotizacionId),
        costo: 0
      };
      return { ...prev, bloques: nuevosBloques };
    });
  };

  useEffect(() => {
    setFormData(prev => {
      let huboCambios = false;
      const nuevosBloques = prev.bloques.map(bloque => {
        const items = (bloque.cotizaciones || []).flatMap(cot => cot.items || []);
        if (items.length === 0) return bloque;

        const hayItemsSinCodigo = items.some(it => it.sinCodigo);
        if (hayItemsSinCodigo) {
          if (bloque.estado !== 'INCOMPLETO') {
            huboCambios = true;
            return { ...bloque, estado: 'INCOMPLETO' };
          }
          return bloque;
        }

        if (bloque.estado === 'AGENDADO' || bloque.estado === 'AGENDANDO') {
          huboCambios = true;
          return { ...bloque, estado: 'PENDIENTE' };
        }

        const estadosNormalizados = [...new Set(items.map(it => {
          const estado = (it.estadoCarga || 'PENDIENTE').toUpperCase();
          return esEstadoCargaCompleto(estado) ? 'CARGADO' : estado;
        }))];
        const nuevoEstado = estadosNormalizados.length === 1 ? estadosNormalizados[0] : 'INCOMPLETO';

        if (nuevoEstado !== bloque.estado) {
          huboCambios = true;
          return {
            ...bloque,
            estado: nuevoEstado,
            ...(nuevoEstado === 'CARGADO' ? { fechaCarga: new Date() } : {})
          };
        }
        return bloque;
      });
      return huboCambios ? { ...prev, bloques: nuevosBloques } : prev;
    });
  }, [formData.bloques]);

  useEffect(() => {
    setFormData(prev => {
      let huboCambios = false;

      const nuevosBloques = prev.bloques.map(bloque => {
        if (bloque.solicitud === 'SOLICITADO') return bloque;

        const items = (bloque.cotizaciones?.[0]?.items) || [];
        if (items.length === 0) return bloque;

        const todosCompletos = items.every(it => esEstadoCargaCompleto((it.estadoCarga || '').toUpperCase()));
        const nuevoValor = todosCompletos ? 'SOLICITAR' : 'PENDIENTE';

        if (nuevoValor !== bloque.solicitud) {
          huboCambios = true;
          return { ...bloque, solicitud: nuevoValor };
        }
        return bloque;
      });

      return huboCambios ? { ...prev, bloques: nuevosBloques } : prev;
    });
  }, [formData.bloques]);

  const hayCambios = JSON.stringify(formData) !== snapshotInicialRef.current;

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hayCambios) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hayCambios]);

  // Valida y arma el payload de guardarDesdeDetalle con los cambios del
  // detalle (lo usan "Guardar" y el guardado automático del alta rápida).
  // Devuelve { payload, formDataParaGuardar } o null si algo no es válido
  // (en ese caso ya se mostró el error en pantalla).
  const prepararGuardado = async () => {

    // Candado de bloqueo (bloque ya SOLICITADO/imputado, desbloqueado a
    // propósito para esta edición): antes de guardar, re-verificar que su
    // período siga abierto — pudo haberse cerrado mientras el usuario
    // editaba. Si ya cerró, se aborta el guardado completo (no se toca
    // Cargas ni implantes_imputadas) y se avisa, en vez de sobrescribir en
    // silencio una imputación de un período ya cerrado.
    if (cargasTabRef.current?.estaBloqueDesbloqueado?.() || informacionTabRef.current?.estaBloqueDesbloqueado?.()) {
      const bloqueDesbloqueado = formData.bloques[bloqueActivoIndex];
      const itemsBloqueDesbloqueado = bloqueDesbloqueado?.cotizaciones?.[0]?.items || [];
      const resultadoPeriodo = await verificarPeriodosBloque(itemsBloqueDesbloqueado, bloqueDesbloqueado);
      if (resultadoPeriodo.estado !== 'ABIERTO') {
        showToast(
          resultadoPeriodo.estado === 'CERRADO'
            ? 'No se guardó: el período de este bloque ya fue cerrado mientras lo editabas.'
            : 'No se guardó: no se pudo determinar el período de este bloque.',
          'error'
        );
        return null;
      }
    }

    let formDataParaGuardar = formData;

    if (cargasTabRef.current) {
      const resultado = cargasTabRef.current.confirmarItemPendiente();

      if (resultado.status === 'incompleto') {
        return null;
      }

      if (resultado.status === 'solo-total') {
        const nuevosBloques = [...formData.bloques];
        const bloque = nuevosBloques[bloqueActivoIndex];

        if (bloque?.cotizaciones?.length > 0) {
          const cotActual = bloque.cotizaciones[0];
          const cotActualizada = {
            ...cotActual,
            totalCotizacion: resultado.totalCotizacion,
            numCotizacion: resultado.numCotizacion || cotActual.numCotizacion
          };

          nuevosBloques[bloqueActivoIndex] = {
            ...bloque,
            cotizaciones: [cotActualizada, ...bloque.cotizaciones.slice(1)],
            costo: resultado.totalCotizacion
          };

          formDataParaGuardar = { ...formData, bloques: nuevosBloques };
          setFormData(formDataParaGuardar);
        }
      }

      if (resultado.status === 'ok' && resultado.items?.length > 0) {
        const nuevosBloques = [...formData.bloques];
        let bloqueActualizado = nuevosBloques[bloqueActivoIndex];
        resultado.items.forEach(itemData => {
          bloqueActualizado = aplicarNuevoItemABloque(bloqueActualizado, itemData);
        });
        nuevosBloques[bloqueActivoIndex] = bloqueActualizado;
        formDataParaGuardar = { ...formData, bloques: nuevosBloques };
        setFormData(formDataParaGuardar);
      }
    }

    const nuevosErrores = {};
    let hayError = false;

    formDataParaGuardar.bloques.forEach((bloque, idx) => {
      if (!bloque.fecha || String(bloque.fecha).trim() === '') {
        nuevosErrores[idx] = true;
        hayError = true;
      }
    });

    if (hayError) {
      setErroresFecha(nuevosErrores);
      const primerIndexConError = Number(Object.keys(nuevosErrores)[0]);
      setBloqueActivoIndex(primerIndexConError);
      setActiveTab('informacion');
      return null;
    }

    // Nombre en MAYÚSCULAS y sin espacios sobrantes (también en registros
    // antiguos guardados en minúsculas, que se corrigen al guardarlos).
    formDataParaGuardar = { ...formDataParaGuardar, nombre: nombreParaGuardar(formDataParaGuardar.nombre) };

    const payload = {
      admisionId: formDataParaGuardar.gestionId,
      paciente: {
        nombre: formDataParaGuardar.nombre,
        convenio: formDataParaGuardar.convenio,
        prevision: formDataParaGuardar.prevision,
        medico: formDataParaGuardar.medico,
        informe: formDataParaGuardar.informe,
        atributo: formDataParaGuardar.atributo,
        centro: formDataParaGuardar.centro,
        descripcion: formDataParaGuardar.descripcion,
        observacion: formDataParaGuardar.observacion,
        // Solo si se cambió: así no se escribe en gestiones que no lo tocan.
        ...(formDataParaGuardar.lado !== (item?.lado || 'no_especificado') ? { lado: formDataParaGuardar.lado } : {})
      },
      registrosActualizados: formDataParaGuardar.bloques.map((b, idx) => {
        const idsOriginales = idsItemsOriginalesRef.current[idx] || [];
        const idsActuales = new Set((b.cotizaciones?.[0]?.items || []).map(it => it.id));
        const itemsEliminados = idsOriginales.filter(orig => !idsActuales.has(orig.id));

        return {
          id: b.idOriginal,
          gestionId: formDataParaGuardar.gestionId,
          empresa: b.empresa,
          fecha: b.fecha,
          fechaAgenda: b.fecha,
          costo: b.costo,
          cotizaciones: b.cotizaciones || [],
          solicitud: b.solicitud || 'PENDIENTE',
          ...camposSolicitudDe(b),
          estado: b.estado || 'AGENDADO',
          fechaInicioCarga: b.fechaInicioCarga || null,
          fechaCarga: b.fechaCarga || null,
          itemsEliminados,
          nombre: formDataParaGuardar.nombre,
          medico: formDataParaGuardar.medico,
          centro: formDataParaGuardar.centro
        };
      })
    };

    return { payload, formDataParaGuardar };
  };

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const preparado = await prepararGuardado();
    if (preparado) onGuardar(preparado.payload);
  };
  // Alta rápida Empresa/Fecha (columna "Empresas / Fechas"). El registro se
  // crea al instante en Firestore; aquí solo se agrega la card y se marca como
  // ya guardada en la foto inicial, para no contarla como cambio pendiente.
  const validarAgregarEmpresaFecha = ({ fecha, empresa }) => validarNuevaEmpresaFecha({
    fecha,
    empresa,
    bloques: formData.bloques,
    periodo: periodoActivo,
    cargandoPeriodo,
    nombreModulo: 'Implantes'
  });

  const handleAgregarEmpresaFecha = async ({ fecha, empresa }) => {
    const errorLocal = validarAgregarEmpresaFecha({ fecha, empresa });
    if (errorLocal) return { error: errorLocal };

    // Con cambios sin guardar (p. ej. el ID recién ingresado), se guardan
    // primero en la misma acción: el ID es parte de la ruta en Firestore y el
    // registro original y el nuevo deben quedar en la misma admisión. El nuevo
    // hereda entonces los datos recién guardados.
    let preparado = null;
    if (JSON.stringify(formData) !== snapshotInicialRef.current) {
      preparado = await prepararGuardado();
      if (!preparado) {
        return { error: 'Hay cambios pendientes con errores: corrígelos antes de agregar.' };
      }
    }

    const indiceBase = bloqueActivoIndex;
    const idBase = formData.bloques[indiceBase]?.idOriginal;
    const resultado = await onAgregarEmpresaFecha({
      base: extraerDatosBase(registrosGuardadosRef.current.get(idBase) || item),
      fecha,
      empresa,
      cambiosPendientes: preparado?.payload,
      indiceBase
    });

    const { creado, guardado } = resultado || {};
    if (!creado && !guardado?.ok) return resultado;

    // Estado ya guardado: las cards toman el id/ruta final de cada registro
    // (el guardado pudo moverlos) y se agrega la nueva.
    let bloques = (preparado?.formDataParaGuardar || formData).bloques;
    if (guardado?.ok) {
      bloques = bloques.map((b, idx) => {
        const reg = guardado.registros[idx];
        if (!reg) return b;
        registrosGuardadosRef.current.set(reg.id, reg);
        return { ...b, idOriginal: reg.id, refPath: reg.refPath };
      });
    }
    if (creado) {
      registrosGuardadosRef.current.set(creado.id, creado);
      bloques = [...bloques, {
        uniqueKey: `id_${creado.id}`,
        idOriginal: creado.id,
        refPath: creado.refPath,
        empresa: creado.empresa,
        fecha: creado.fecha,
        costo: creado.costo ?? 0,
        cotizaciones: [],
        solicitud: creado.solicitud || 'PENDIENTE',
        estado: creado.estado || 'AGENDADO',
        fechaInicioCarga: null,
        fechaCarga: null
      }];
    }

    const nuevoFormData = { ...(preparado?.formDataParaGuardar || formData), bloques };
    // Todo lo que muestra el detalle quedó guardado: nueva foto inicial, sin
    // "cambios sin guardar" falsos.
    snapshotInicialRef.current = JSON.stringify(nuevoFormData);
    idsItemsOriginalesRef.current = bloques.map(b => (b.cotizaciones?.[0]?.items || []).map(it => ({
      id: it.id,
      periodoAnio: it.periodoAnio,
      periodoMes: it.periodoMes
    })));
    setErroresFecha({});
    setFormData(nuevoFormData);
    if (creado) setBloqueActivoIndex(bloques.length - 1);
    return resultado;
  };

  useImperativeHandle(ref, () => ({
    guardarTodo: handleSubmit,
    hayCambiosSinGuardar: () => hayCambios
  }));

  const refPathBloqueActivo = formData.bloques[bloqueActivoIndex]?.refPath;

  useEffect(() => {
    if (tabActual?.id !== 'logs' || !refPathBloqueActivo || !cargarLogsDeImplante) return;
    cargarLogsDeImplante({
      refPath: refPathBloqueActivo,
      nombre: formData.nombre,
      gestionId: formData.gestionId
    });
  }, [tabActual?.id, refPathBloqueActivo]);

  // Documentos: ID YA guardado (la foto inicial), no el que se esté editando
  // sin guardar — el PDF no debe quedar en la carpeta de un ID que todavía no
  // existe en Firestore. También es contra el que se validan los nombres.
  const gestionIdGuardado = JSON.parse(snapshotInicialRef.current).gestionId;
  const idAdmisionDocs = esCodigoPendiente(gestionIdGuardado) ? '' : String(gestionIdGuardado).trim();

  // Listado de Storage de la pestaña Documentos (una vez por admisión).
  const docsAdmision = useDocumentosAdmision('implantes', idAdmisionDocs, tabActual?.id === 'documentos');

  // Registro de PDF de OC: 1 lectura al abrir la pestaña Orden.
  const registroPdfOC = useRegistroPdfOC(tabActual?.id === 'orden');

  return (
    <div className="flex-grow flex flex-col bg-slate-50/50 dark:bg-gray-900 overflow-hidden text-[10px]">

      {!cargandoPeriodo && (
        periodoActivo ? (
          <div className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-100 dark:border-emerald-900/40">
            <Unlock size={11} className="shrink-0" />
            Período abierto para Implantes: <strong>{nombrePeriodoActivo}</strong>
          </div>
        ) : (
          <div className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-900/40">
            <Lock size={11} className="shrink-0" />
            No hay un período abierto para Implantes.
          </div>
        )
      )}

      <div className="flex-grow flex overflow-hidden">

        <div className="w-36 shrink-0 bg-white dark:bg-gray-800 border-r border-slate-200 dark:border-gray-700 flex flex-col">
          <div className="p-2 border-b border-slate-200 dark:border-gray-700">
            <h2 className="text-[10px] font-bold text-slate-700 dark:text-gray-200 uppercase tracking-wide">
              Menú de Opción
            </h2>
          </div>

          {tabsPermitidas.length === 0 ? (
            <div className="p-2.5 text-[10px] text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
              <ShieldAlert size={13} className="shrink-0 mt-0.5" />
              Sin pestañas habilitadas para su perfil.
            </div>
          ) : (
            <div className="p-1.5 space-y-1">
              {tabsPermitidas.map((tab) => {
                const TabIcon = tab.Icon;
                const isActive = tabActual?.id === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md font-medium transition text-left ${isActive
                      ? 'bg-[#2383C2]/10 text-[#2383C2] dark:bg-blue-950/50 dark:text-blue-400 font-semibold'
                      : 'text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700/50'
                      }`}
                  >
                    <TabIcon size={13} />
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Orden reutiliza el mismo panel (y el mismo formData.bloques ya en
            memoria) que Información/Cargas: no hace lecturas propias. */}
        {(tabActual?.id === 'informacion' || tabActual?.id === 'cargas' || tabActual?.id === 'orden' || tabActual?.id === 'logs') && (
          <EmpresasFechasPanel
            bloques={formData.bloques}
            ocsPorBloque={ocsPorBloque}
            bloqueActivoIndex={bloqueActivoIndex}
            setBloqueActivoIndex={setBloqueActivoIndex}
            erroresFecha={erroresFecha}
            onAgregar={onAgregarEmpresaFecha ? handleAgregarEmpresaFecha : undefined}
            validarAgregar={validarAgregarEmpresaFecha}
            motivoAgregarDeshabilitado={
              esCodigoPendiente(formData.gestionId)
                ? 'Ingresa el ID de admisión en Información para agregar empresa/fecha'
                : undefined
            }
          />
        )}

        <div className="flex-grow flex flex-col overflow-auto">

          {!tabActual && (
            <div className="flex-grow flex flex-col items-center justify-center text-center p-6 text-slate-500 dark:text-gray-400 text-[10px] gap-1.5">
              <ShieldAlert size={22} className="text-amber-500" />
              Su perfil no tiene acceso a ninguna pestaña de esta vista de detalle.
            </div>
          )}

          {tabActual?.id === 'informacion' && (
            <InformacionTab
              ref={informacionTabRef}
              formData={formData}
              handleGeneralChange={handleGeneralChange}
              handleBloqueChange={handleBloqueChange}
              bloqueActivoIndex={bloqueActivoIndex}
              erroresFecha={erroresFecha}
            />
          )}

          {tabActual?.id === 'detalles' && (
            <DetallesTab formData={formData} ocPorItemBloques={ocPorItemBloques} />
          )}

          {tabActual?.id === 'orden' && (
            <OrdenTab
              bloques={formData.bloques}
              ocsPorBloque={ocsPorBloque}
              bloqueActivoIndex={bloqueActivoIndex}
              handleCopiarTexto={handleCopiarTexto}
              {...registroPdfOC}
            />
          )}

          {tabActual?.id === 'cargas' && (
            <CargasTab
              ref={cargasTabRef}
              formData={formData}
              bloqueActivoIndex={bloqueActivoIndex}
              onAgregarItem={handleAgregarItemCotizacion}
              onEliminarItem={handleEliminarItem}
              onEliminarCotizacion={handleEliminarCotizacion}
              onActualizarEstadoItem={handleActualizarEstadoItem}
              onEditarItem={handleEditarItem}
              periodoAbierto={periodoActivo}
              cargandoPeriodo={cargandoPeriodo}
              handleCopiarTexto={handleCopiarTexto}
              onIrAInformacion={tabsPermitidas.some(t => t.id === 'informacion') ? () => setActiveTab('informacion') : undefined}
            />
          )}

          {tabActual?.id === 'documentos' && (
            <DocumentosTab
              modulo="implantes"
              idAdmision={idAdmisionDocs}
              gestionId={formData.gestionId}
              nombre={formData.nombre}
              handleCopiarTexto={handleCopiarTexto}
              {...docsAdmision}
            />
          )}

          {tabActual?.id === 'bodymap' && (
            <div className="flex-grow overflow-y-auto p-3">
              <BodymapTab descripcion={formData.descripcion} lado={formData.lado} onAbrirMaestro={onAbrirZonasDiagnostico} />
            </div>
          )}

          {tabActual?.id === 'logs' && (
            <div className="flex-grow overflow-y-auto p-3">
              {refPathBloqueActivo ? (
                <HistorialLogsContenido
                  logsList={logsList}
                  loadingLogs={loadingLogs}
                  formatearFecha={formatearFecha}
                />
              ) : (
                <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-[10px]">
                  Este bloque aún no se ha guardado — guarda primero para ver su historial.
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
});

export default GestionesImplantesDetalleView;