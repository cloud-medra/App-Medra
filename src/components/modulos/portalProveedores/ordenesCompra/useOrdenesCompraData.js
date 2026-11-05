import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';
import { COL_PORTAL_OC } from '../../../../../functions/portalProveedores/nucleo.mjs';
import { LIMITE_FILAS_PERIODO, consultaDetallesPeriodo } from '../../operaciones/documentos/importarDetallesOC/utils/consultaDetallesPeriodo';
import { LIMITE_FILAS, crearIndiceEmpresas, filaInterna, filtrarPorEmpresa, ordenarOrdenes, restriccionesExterno } from './logicaOrdenesCompra';

// Una lectura por cambio de período, sin listener. `error`: lectura rechazada (ej. empresa
// recién desactivada). `crearConsulta` y `limite` no cambian entre renders de una vista.
const usePeriodo = (clave, crearConsulta, limite) => {
  const [estado, setEstado] = useState({ clave: '', docs: [], error: false, huboTope: false });

  useEffect(() => {
    if (!clave) return undefined;
    let cancelado = false;
    getDocs(crearConsulta())
      .then((snap) => {
        if (!cancelado) setEstado({ clave, docs: snap.docs, error: false, huboTope: snap.size === limite });
      })
      .catch((err) => {
        console.error('Error al cargar las órdenes de compra:', err);
        if (!cancelado) setEstado({ clave, docs: [], error: true, huboTope: false });
      });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `clave` resume la consulta
  }, [clave]);

  const listo = estado.clave === clave;
  return {
    docs: listo ? estado.docs : SIN_DOCS,
    error: listo && estado.error,
    huboTope: listo && estado.huboTope,
    cargando: Boolean(clave) && !listo,
  };
};
const SIN_DOCS = [];

// Externo: SOLO la copia, que no tiene paciente, médico, admisión ni montos, y siempre
// filtrando por su empresa. Este es el único camino de datos de un externo.
export const useOrdenesExterno = (userData, { anio, mes }) => {
  const clave = anio && mes ? `${userData?.uid}/${userData?.empresaId}/${anio}/${mes}` : '';
  const { docs, ...resto } = usePeriodo(
    clave,
    () => query(collection(db, COL_PORTAL_OC), ...restriccionesExterno(userData, { anio, mes }), limit(LIMITE_FILAS)),
    LIMITE_FILAS,
  );
  const filas = useMemo(() => ordenarOrdenes(docs.map((d) => ({ id: d.id, ...d.data() }))), [docs]);
  return { filas, ...resto };
};

// Interno: las filas originales del mes, con nombre y montos. El mes se lee una vez:
// cambiar de empresa no vuelve a consultar. Mientras carga el Maestro no se filtra por
// empresa, porque todas las filas parecerían "sin empresa".
export const useOrdenesInterno = ({ anio, mes, empresaId, empresas, empresasCargadas, errorEmpresas }) => {
  const clave = anio && mes ? `${anio}/${mes}` : '';
  const { docs, cargando, error, huboTope } = usePeriodo(clave, () => consultaDetallesPeriodo(anio, mes), LIMITE_FILAS_PERIODO);
  const filasMes = useMemo(() => {
    const indice = crearIndiceEmpresas(empresas);
    return ordenarOrdenes(docs.map((d) => filaInterna(d.id, d.data(), indice)));
  }, [docs, empresas]);
  const filas = useMemo(() => filtrarPorEmpresa(filasMes, empresaId), [filasMes, empresaId]);
  // Sin Maestro no se puede filtrar por empresa: se avisa en vez de esperar para siempre.
  const faltaMaestro = Boolean(clave) && Boolean(empresaId) && !empresasCargadas;
  return {
    filas,
    huboTope,
    error: error || (faltaMaestro && Boolean(errorEmpresas)),
    cargando: cargando || (faltaMaestro && !errorEmpresas),
  };
};
