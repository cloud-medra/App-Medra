// Años y meses con gestiones para el filtro de Gestiones (Implantes y
// Hemodinamia), sin cargar las gestiones: los documentos de año/mes no
// existen, así que se cuentan con getCountFromServer por rango de ruta
// (consultaGestiones.js). NO se arman desde las gestiones cargadas: con la
// ventana de las más recientes, eso hizo desaparecer septiembre.
//
// Costo (count() cobra 1 lectura por cada 1.000 documentos, mínimo 1 por
// consulta): al abrir la pantalla, 1 (gestión más antigua) + 1 por año (del
// más antiguo al próximo) + 12 (meses del año elegido); otro año, 12 más, que
// quedan en memoria mientras la pantalla esté abierta. No se guardan entre
// visitas: así un mes recién creado aparece al volver a entrar.
import { useCallback, useEffect, useRef, useState } from 'react';
import { collectionGroup, documentId, getCountFromServer, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../../../../firebaseConfig';
import { fechaISOEnChile } from './rangoFechaGestiones';
import {
  MESES_DEL_ANIO, aniosAContar, anioDeRutaGestion, anioMasRecienteConDatos, mesMasRecienteConDatos,
  rangoRutaAnioGestiones, rangoRutaGestionesReales, rangoRutaMesGestiones,
} from './consultaGestiones';

const contar = async ({ desde, hasta }) => {
  const snap = await getCountFromServer(query(collectionGroup(db, 'detalles'), where(documentId(), '>=', desde), where(documentId(), '<', hasta)));
  return snap.data().count;
};

// Año de la gestión más antigua (1 lectura), o null si falla o no hay.
const anioMasAntiguo = async (coleccion) => {
  try {
    const { desde, hasta } = rangoRutaGestionesReales(coleccion);
    const snap = await getDocs(query(collectionGroup(db, 'detalles'),
      where(documentId(), '>=', desde), where(documentId(), '<', hasta), orderBy(documentId()), limit(1)));
    return snap.empty ? null : anioDeRutaGestion(snap.docs[0].ref.path, coleccion);
  } catch (error) {
    console.error(`No se pudo leer la gestión más antigua de ${coleccion}:`, error);
    return null;
  }
};

const contarMeses = async (coleccion, anio) => {
  const cantidades = await Promise.all(MESES_DEL_ANIO.map((mes) => contar(rangoRutaMesGestiones(coleccion, { anio, mes }))));
  return Object.fromEntries(MESES_DEL_ANIO.map((mes, i) => [mes, cantidades[i]]));
};

// conteoAnios: { '2026': 297, ... } o null (cargando o falló: el filtro usa
// los años de respaldo). conteoMeses: { '01': 0, ..., '09': 116, ... } del año
// `anio`, o null (cargando, falló o sin año: el filtro muestra los 12 meses).
export const useConteosPeriodosGestiones = (coleccion, anio, { habilitado = true } = {}) => {
  const [conteoAnios, setConteoAnios] = useState(null);
  const [conteoMesesPorAnio, setConteoMesesPorAnio] = useState({});
  const pedidos = useRef(new Map());

  useEffect(() => {
    if (!habilitado) return undefined;
    let vigente = true;
    (async () => {
      try {
        const anioActual = Number(fechaISOEnChile().slice(0, 4));
        const anios = aniosAContar(await anioMasAntiguo(coleccion), anioActual);
        const cantidades = await Promise.all(anios.map((a) => contar(rangoRutaAnioGestiones(coleccion, a))));
        if (vigente) setConteoAnios(Object.fromEntries(anios.map((a, i) => [a, cantidades[i]])));
      } catch (error) {
        console.error(`No se pudieron contar las gestiones por año de ${coleccion}:`, error);
      }
    })();
    return () => { vigente = false; };
  }, [coleccion, habilitado]);

  // Conteo por mes de un año: una vez por año mientras la pantalla esté abierta.
  const mesesDe = useCallback((anioPedido) => {
    if (!pedidos.current.has(anioPedido)) {
      const pedido = contarMeses(coleccion, anioPedido)
        .then((conteo) => { setConteoMesesPorAnio((prev) => ({ ...prev, [anioPedido]: conteo })); return conteo; })
        .catch((error) => { pedidos.current.delete(anioPedido); throw error; });
      pedidos.current.set(anioPedido, pedido);
    }
    return pedidos.current.get(anioPedido);
  }, [coleccion]);

  useEffect(() => {
    if (!habilitado || !/^\d{4}$/.test(anio || '')) return;
    mesesDe(anio).catch((error) => console.error(`No se pudieron contar las gestiones de ${anio} por mes:`, error));
  }, [anio, habilitado, mesesDe]);

  return { conteoAnios, conteoMeses: conteoMesesPorAnio[anio] || null, mesesDe };
};

// Mes inicial: el actual (hora de Chile) si tiene gestiones; si no, el más
// reciente con gestiones. Se aplica una sola vez y solo si el usuario no
// eligió otro período antes (periodo.fijarPeriodoInicial lo respeta).
export const useMesInicialConDatos = (periodo, { conteoAnios, mesesDe }, { habilitado = true } = {}) => {
  const aplicado = useRef(false);
  const { fijarPeriodoInicial } = periodo;
  useEffect(() => {
    if (!habilitado || aplicado.current || !conteoAnios) return;
    aplicado.current = true;
    const [anioHoy, mesHoy] = fechaISOEnChile().split('-').map(Number);
    const anio = anioMasRecienteConDatos(conteoAnios, anioHoy);
    if (anio === null) return;
    const referencia = anio === anioHoy ? String(mesHoy).padStart(2, '0') : anio < anioHoy ? '12' : '00';
    // Sin "vigente": si el usuario ya eligió otro período, fijarPeriodoInicial
    // no hace nada (y tras desmontar, el setState se ignora).
    mesesDe(String(anio))
      .then((conteo) => {
        const mes = mesMasRecienteConDatos(conteo, referencia);
        if (mes) fijarPeriodoInicial(String(anio), mes);
      })
      .catch(() => {});
  }, [habilitado, conteoAnios, mesesDe, fijarPeriodoInicial]);
};
