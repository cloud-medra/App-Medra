import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  collection, doc, getDoc, getDocs, query, where, arrayUnion, serverTimestamp, writeBatch
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../../../firebaseConfig';
import { MODULOS, MESES, COLECCIONES, MODULO_BODEGA } from './constants';
import { periodoSiguiente } from '../../../../../functions/bodega/nucleo.mjs';
import { calcularTotalMesDesdeDocumentos, guardarSnapshotMensual, invalidarSnapshotMensual } from './snapshotMensual';
import { useCierresAnio } from './cierresAnioStore';
import { obtenerCelda, invalidarResumenAnio, ESTADOS_ABIERTOS } from './resumenImputacionesStore';

// Códigos (del SDK cliente) que sí son fallas de red; solo ahí se sugiere
// revisar la conexión. Cualquier otro error muestra el mensaje real.
const CODIGOS_ERROR_RED = ['functions/unavailable', 'functions/deadline-exceeded'];
export const MENSAJE_ERROR_CIERRE_RED = 'No se pudo cerrar el mes. Revisa tu conexión e intenta nuevamente.';
export const MENSAJE_REAPERTURA_BODEGA = 'No se puede reabrir este mes de Bodega: el mes siguiente ya está cerrado y tomó su saldo final como saldo inicial.';

// Un error no lanzado como HttpsError llega con el código como mensaje
// ("internal"): en ese caso se agrega contexto para que se entienda.
export const mensajeErrorCierre = (error) => {
  if (CODIGOS_ERROR_RED.includes(error?.code)) return MENSAJE_ERROR_CIERRE_RED;
  const mensaje = String(error?.message || '').trim();
  const codigo = String(error?.code || '').replace(/^functions\//, '');
  if (!mensaje || mensaje === codigo) return `No se pudo cerrar el mes (error: ${codigo || 'desconocido'}).`;
  return mensaje;
};

// `soloPeriodoAbierto`: Resumen Periodo Abierto solo necesita los totales de
// los meses abiertos; Control Mensual pide todos los meses con actividad.
export const useControlMensualData = (anioSeleccionado, userData, showToast, confirmAction, { soloPeriodoAbierto = false } = {}) => {
  // Estados del año: listener compartido por año (cierresAnioStore).
  const { estadosModulos, cargando } = useCierresAnio(anioSeleccionado);
  const [resumen, setResumen] = useState({ clave: null, datos: {} });
  const [versionResumen, setVersionResumen] = useState(0);
  const [procesandoAccion, setProcesandoAccion] = useState(false);

  const obtenerUsuarioLog = useCallback(() => ({
    uid: userData?.uid || '',
    nombre: userData?.nombreCompleto || userData?.displayName || userData?.nombre || userData?.email?.split('@')[0] || 'Usuario Sistema',
    email: userData?.email || ''
  }), [userData]);

  // Vuelve a calcular el resumen del año (botón "Actualizar" y después de
  // abrir/cerrar/reabrir un mes).
  const actualizarResumen = useCallback((anio = anioSeleccionado) => {
    invalidarResumenAnio(anio);
    setVersionResumen(v => v + 1);
  }, [anioSeleccionado]);

  // Totales por módulo/mes desde resumenImputacionesStore (snapshots para
  // meses cerrados, count()/sum() para los abiertos, nada para los nunca
  // abiertos). Antes: 60 getDocs que descargaban todas las imputadas del año.
  const celdasPedidas = useMemo(() => {
    if (cargando) return null;
    const lista = [];
    MODULOS.forEach(mod => MESES.forEach(mes => {
      const estado = estadosModulos[mod.id]?.[mes.id]?.estado;
      if (!estado) return;
      if (soloPeriodoAbierto && !ESTADOS_ABIERTOS.includes(estado)) return;
      lista.push({ modId: mod.id, mesId: mes.id, estado });
    }));
    return lista;
  }, [cargando, estadosModulos, soloPeriodoAbierto]);

  const claveResumen = celdasPedidas
    ? `${anioSeleccionado}|${versionResumen}|${celdasPedidas.map(c => `${c.modId}.${c.mesId}.${c.estado}`).join(',')}`
    : null;

  useEffect(() => {
    if (!celdasPedidas) return undefined;
    let cancelado = false;
    Promise.all(celdasPedidas.map(async ({ modId, mesId, estado }) => {
      try {
        return { modId, mesId, ...(await obtenerCelda(anioSeleccionado, modId, mesId, estado)) };
      } catch (error) {
        console.error(`Error al obtener el resumen de ${modId}/${mesId}:`, error);
        return { modId, mesId, cantidad: 0, montoTotal: 0 };
      }
    })).then(resultados => {
      if (cancelado) return;
      const datos = {};
      MODULOS.forEach(mod => { datos[mod.id] = {}; });
      // Bodega trae además el detalle del periodo (saldo inicial, líneas…).
      resultados.forEach(r => { datos[r.modId][r.mesId] = { cantidad: r.cantidad, montoTotal: r.montoTotal, ...(r.bodega ? { bodega: r.bodega } : {}) }; });
      setResumen({ clave: claveResumen, datos });
    });
    return () => { cancelado = true; };
    // claveResumen resume celdasPedidas + año + versión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveResumen]);

  const resumenImputaciones = resumen.datos;
  const cargandoResumen = claveResumen !== null && resumen.clave !== claveResumen;

  // Períodos ABIERTO/REABIERTO (de cualquier año) que abrir `mesId` cerraría
  // automáticamente en los módulos indicados.
  const buscarCierresAutomaticos = async (mesId, modulosAfectados, anioTarget) => {
    const porModulo = await Promise.all(modulosAfectados.map(async (mod) => {
      const docId = `${anioTarget}_${mesId}_${mod.id}`;
      const snap = await getDocs(query(
        collection(db, COLECCIONES.CIERRES),
        where("modulo", "==", mod.id),
        where("estado", "in", ESTADOS_ABIERTOS)
      ));
      return snap.docs
        .filter(d => d.id !== docId)
        .map(d => {
          const data = d.data?.() || {};
          const [anio, mes] = d.id.split('_');
          return { id: d.id, cerradoPorApertura: docId, modulo: mod, anio: data.anio || anio, mes: data.mes || mes };
        });
    }));
    return porModulo.flat();
  };

  // El panel de apertura no deja abrir mientras un módulo marcado tenga un mes
  // abierto en el año, pero el botón "Abrir" de la tabla y un período abierto
  // de otro año sí llegan acá. El cierre automático se mantiene, pero solo
  // cierra lo que el usuario vio listado en la confirmación: si al confirmar
  // aparece otro período abierto, no se hace nada.
  const handleAbrirMes = async (mesId, modTarget, anioTarget = anioSeleccionado, setAnioSeleccionadoCallback) => {
    const modulosAfectados = Array.isArray(modTarget) 
      ? MODULOS.filter(m => modTarget.includes(m.id))
      : MODULOS.filter(m => m.id === modTarget);

    const modulosNombres = modulosAfectados.map(m => m.nombre).join(', ');

    let cierresMostrados;
    try {
      cierresMostrados = await buscarCierresAutomaticos(mesId, modulosAfectados, anioTarget);
    } catch (error) {
      console.error("Error al revisar los períodos abiertos:", error);
      showToast("Error al revisar los períodos abiertos", "error");
      return;
    }
    const idsMostrados = new Set(cierresMostrados.map(c => c.id));
    const avisoCierres = cierresMostrados.length > 0
      ? ` Atención: esto cerrará automáticamente ${cierresMostrados.map(c =>
          `${c.modulo.nombre} ${MESES.find(m => m.id === c.mes)?.nombre || c.mes} ${c.anio}`).join(', ')}.`
      : '';

    confirmAction(
      "Abrir Período de Imputación",
      `¿Deseas abrir ${mesId.toUpperCase()} ${anioTarget} para: [${modulosNombres}]?${avisoCierres}`,
      async () => {
        setProcesandoAccion(true);
        try {
          const cierres = await buscarCierresAutomaticos(mesId, modulosAfectados, anioTarget);
          if (cierres.some(c => !idsMostrados.has(c.id))) {
            showToast("Cambiaron los períodos abiertos mientras confirmabas. Revisa y vuelve a intentarlo.", "warning");
            return;
          }

          const usuario = obtenerUsuarioLog();
          const batch = writeBatch(db);

          cierres.forEach(c => {
            batch.update(doc(db, COLECCIONES.CIERRES, c.id), {
              estado: 'CERRADO',
              fechaCierre: serverTimestamp(),
              usuarioCierre: usuario,
              cierreAutomatico: true,
              // firestore.rules solo permite este cierre desde el cliente
              // si el período indicado queda ABIERTO en este mismo batch.
              cerradoPorApertura: c.cerradoPorApertura
            });
          });

          for (const mod of modulosAfectados) {
            const docId = `${anioTarget}_${mesId}_${mod.id}`;

            const docRef = doc(db, COLECCIONES.CIERRES, docId);
            batch.set(docRef, {
              anio: anioTarget,
              mes: mesId,
              modulo: mod.id,
              estado: 'ABIERTO',
              fechaApertura: serverTimestamp(),
              usuarioApertura: usuario,
            }, { merge: true });

            const periodoActivoRef = doc(db, COLECCIONES.CONFIGURACION, `periodo_activo_${mod.id}`);
            batch.set(periodoActivoRef, {
              mes: mesId,
              anio: anioTarget,
              modulo: mod.id,
              actualizadoEn: serverTimestamp(),
              actualizadoPor: usuario,
            });
          }

          await batch.commit();
          actualizarResumen(anioTarget);

          if (anioTarget !== anioSeleccionado && setAnioSeleccionadoCallback) {
            setAnioSeleccionadoCallback(anioTarget);
          }
          showToast(`Mes de ${mesId} abierto para ${modulosNombres}`, 'success');
        } catch (error) {
          console.error("Error al abrir mes:", error);
          showToast("Error al abrir el período", "error");
        } finally {
          setProcesandoAccion(false);
        }
      }
    );
  };

  // Cierre de período: los botones solo ABREN el modal de confirmación en
  // varios pasos (ModalCierreMes); el cierre real lo hace ejecutarCierre,
  // recién cuando el usuario escribió y confirmó el año/mes. La escritura
  // de cierres_periodos pasa por la Cloud Function cerrarPeriodoImputacion,
  // que vuelve a validar el año/mes en el servidor.
  const [solicitudCierre, setSolicitudCierre] = useState(null);

  const handleCerrarMes = (mesId, modId) => {
    setSolicitudCierre({ mesId, modulos: [modId] });
  };

  const handleCerrarTodos = (mesId) => {
    const modulosAbiertos = MODULOS.filter(mod => {
      const estado = estadosModulos[mod.id]?.[mesId]?.estado;
      return estado === 'ABIERTO' || estado === 'REABIERTO';
    });

    if (modulosAbiertos.length === 0) {
      showToast("No hay módulos abiertos para cerrar en este período", "info");
      return;
    }

    setSolicitudCierre({ mesId, modulos: modulosAbiertos.map(m => m.id) });
  };

  const cancelarCierre = () => {
    if (!procesandoAccion) setSolicitudCierre(null);
  };

  // Devuelve { ok, mensaje } para que el modal muestre el resultado; nunca
  // lanza. Si el servidor rechaza el cierre, el período queda sin cambios.
  const ejecutarCierre = async ({ anioIngresado, mesIngresado }) => {
    if (!solicitudCierre) return { ok: false, mensaje: 'No hay un período seleccionado para cerrar.' };
    const { mesId, modulos } = solicitudCierre;
    const nombreMes = MESES.find(m => m.id === mesId)?.nombre || mesId;

    setProcesandoAccion(true);
    try {
      const cerrarPeriodo = httpsCallable(functions, 'cerrarPeriodoImputacion');
      await cerrarPeriodo({ anio: anioSeleccionado, mes: mesId, modulos, anioIngresado, mesIngresado });
    } catch (error) {
      console.error("Error al cerrar mes:", error);
      setProcesandoAccion(false);
      return { ok: false, mensaje: mensajeErrorCierre(error) };
    }

    // Snapshot único del total del mes cerrado, para no tener que recalcularlo
    // sumando documentos crudos cada vez que se necesite como "mes anterior".
    // El período ya quedó cerrado: si esto falla, no se informa el cierre
    // como fallido — el snapshot se calcula de forma lazy al consultarlo.
    try {
      // Bodega no tiene imputadas: su foto la guarda el trigger bodegaPeriodo.
      await Promise.all(modulos.filter((modId) => modId !== MODULO_BODEGA).map(async (modId) => {
        const totalMes = await calcularTotalMesDesdeDocumentos(modId, anioSeleccionado, mesId);
        await guardarSnapshotMensual(modId, anioSeleccionado, mesId, totalMes, 'cierre');
      }));
    } catch (error) {
      console.error("Error al guardar el snapshot del mes cerrado:", error);
      showToast(`El mes se cerró, pero no se pudo guardar el resumen del mes; se calculará al consultarlo.`, 'warning');
    } finally {
      setProcesandoAccion(false);
      actualizarResumen();
    }

    return { ok: true, mensaje: `Mes ${nombreMes} ${anioSeleccionado} cerrado correctamente.` };
  };

  const ejecutarReapertura = async (modalReapertura, motivoReapertura, onSuccess) => {
    if (!motivoReapertura.trim()) {
      showToast("Debes ingresar el motivo de la reapertura", "warning");
      return;
    }

    const { mesId, modId } = modalReapertura;
    const usuario = obtenerUsuarioLog();
    setProcesandoAccion(true);

    try {
      // Bodega: con el mes siguiente cerrado, reabrir descuadraría el saldo
      // inicial que ese mes ya tomó (también lo impide firestore.rules).
      if (modId === MODULO_BODEGA) {
        const siguiente = periodoSiguiente(anioSeleccionado, mesId);
        const snapSiguiente = await getDoc(doc(db, COLECCIONES.CIERRES, `${siguiente.anio}_${siguiente.mes}_${modId}`));
        if (snapSiguiente.exists() && snapSiguiente.data().estado === 'CERRADO') {
          showToast(MENSAJE_REAPERTURA_BODEGA, 'warning');
          return;
        }
      }
      const docId = `${anioSeleccionado}_${mesId}_${modId}`;
      const docRef = doc(db, COLECCIONES.CIERRES, docId);
      const registroReapertura = {
        fecha: new Date().toISOString(),
        motivo: motivoReapertura.trim(),
        usuario: usuario
      };

      const batch = writeBatch(db);

      batch.set(docRef, {
        estado: 'REABIERTO',
        fechaReapertura: serverTimestamp(),
        usuarioReapertura: usuario,
        historialReaperturas: arrayUnion(registroReapertura)
      }, { merge: true });

      const periodoActivoRef = doc(db, COLECCIONES.CONFIGURACION, `periodo_activo_${modId}`);
      batch.set(periodoActivoRef, {
        mes: mesId,
        anio: anioSeleccionado,
        modulo: modId,
        actualizadoEn: serverTimestamp(),
        actualizadoPor: usuario,
      });

      await batch.commit();

      // El snapshot cerrado deja de ser confiable: puede haber correcciones
      // retroactivas mientras el período está reabierto. Se invalida y se
      // regenera en el próximo cierre (o vía cálculo lazy si se lee antes).
      await invalidarSnapshotMensual(modId, anioSeleccionado, mesId);
      actualizarResumen();

      showToast(`Mes de ${mesId} reabierto correctamente`, 'warning');
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Error al reabrir mes:", error);
      showToast("Error al reabrir el período", "error");
    } finally {
      setProcesandoAccion(false);
    }
  };

  return {
    estadosModulos,
    resumenImputaciones,
    cargando,
    cargandoResumen,
    actualizarResumen,
    procesandoAccion,
    handleAbrirMes,
    handleCerrarMes,
    handleCerrarTodos,
    solicitudCierre,
    cancelarCierre,
    ejecutarCierre,
    ejecutarReapertura
  };
};