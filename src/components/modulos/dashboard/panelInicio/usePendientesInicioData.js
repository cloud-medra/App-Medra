import { useEffect, useMemo, useState } from 'react';
import { collectionGroup, documentId, getCountFromServer, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';
import { moduloGestion, rangoGestiones } from '../../operaciones/shared/modulosGestion';
import { fechaISOEnChile } from '../../operaciones/shared/gestion/rangoFechaGestiones';
import { leerTodasLasFibras } from '../../operaciones/implantes/fibras/fibrasTransacciones';
import { leerCodigosFibra } from '../../operaciones/implantes/fibras/useFibrasReutilizablesData';
import {
  ESTADOS_EN_REVISION, ESTADOS_AGENDADA, contarCirugias, diaSiguienteISO, usoFibrasPorReferencia,
} from './pendientesInicio';

// Lecturas de Inicio → Pendientes. Cada una se recuerda TTL_MS (los mismos 5
// minutos que el mes abierto de Finanzas): entrar y salir del Inicio no
// vuelve a leer. Un error no se recuerda (se reintenta en la próxima visita).
//   - Implantes: count() sobre collectionGroup('detalles') acotado por
//     documentId() a implantes_gestiones (1 lectura por cada 1.000):
//       solicitud == SOLICITAR, estado == INCOMPLETO y estado in (REVISAR…)
//       usan el índice simple de collection group de cada campo;
//       estado in (AGENDANDO, AGENDADO) + fecha < hoy usa el compuesto
//       (estado, fecha, __name__).
//   - Cirugías: getDocs de las gestiones con fecha == día (índice simple de
//     collection group de `fecha`); son pocas por día y hay que deduplicar
//     por admisión, que count() no puede. Solo se guarda la cantidad: los
//     nombres de pacientes no salen de aquí.
//   - Fibras: la colección completa (es chica) y los códigos marcados como
//     fibra, igual que la pantalla Fibras; el uso y las alertas se
//     calculan, así que no sirve count().
export const TTL_MS = 5 * 60 * 1000;

const cache = new Map(); // clave -> { ts, promesa }

export const recordar = (clave, leer, ahora = Date.now()) => {
  const previo = cache.get(clave);
  if (previo && ahora - previo.ts < TTL_MS) return previo.promesa;
  const promesa = leer().catch((error) => { cache.delete(clave); throw error; });
  cache.set(clave, { ts: ahora, promesa });
  return promesa;
};

export const olvidarPendientesInicio = () => cache.clear();

const gestionesDe = (modulo, ...filtros) => {
  const { min, max } = rangoGestiones(moduloGestion(modulo));
  return query(collectionGroup(db, 'detalles'), ...filtros, where(documentId(), '>=', min), where(documentId(), '<', max));
};

const contar = async (q) => ({ n: (await getCountFromServer(q)).data().count });

export const LECTURAS = {
  porImputar: () => contar(gestionesDe('implantes', where('solicitud', '==', 'SOLICITAR'))),
  incompletas: () => contar(gestionesDe('implantes', where('estado', '==', 'INCOMPLETO'))),
  enRevision: () => contar(gestionesDe('implantes', where('estado', 'in', [...ESTADOS_EN_REVISION]))),
  agendadasVencidas: (hoy) => contar(gestionesDe('implantes', where('estado', 'in', [...ESTADOS_AGENDADA]), where('fecha', '<', hoy))),
  cirugias: async (dia) => {
    const snap = await getDocs(gestionesDe('implantes', where('fecha', '==', dia)));
    return { n: contarCirugias(snap.docs.map((d) => ({ refPath: d.ref.path, gestionId: d.get('gestionId'), agendaId: d.get('agendaId') }))) };
  },
  fibras: async (hoy) => {
    const [fibras, codigos] = await Promise.all([leerTodasLasFibras(), leerCodigosFibra()]);
    return { referencias: usoFibrasPorReferencia(fibras, codigos, hoy) };
  },
};

// Lee lo que corresponde a los bloques visibles. Devuelve { [clave]: resultado }
// con resultado = { n } | { referencias } | { error }; sin clave
// mientras carga.
export const usePendientesInicioData = (bloques) => {
  const hoy = useMemo(() => fechaISOEnChile(), []);
  const manana = useMemo(() => diaSiguienteISO(hoy), [hoy]);
  const [resultados, setResultados] = useState({});

  const pedidos = useMemo(() => {
    const lista = [];
    if (bloques.implantes) {
      lista.push(['porImputar', 'porImputar', () => LECTURAS.porImputar()]);
      lista.push(['incompletas', 'incompletas', () => LECTURAS.incompletas()]);
      lista.push(['enRevision', 'enRevision', () => LECTURAS.enRevision()]);
      lista.push(['agendadasVencidas', `agendadasVencidas|${hoy}`, () => LECTURAS.agendadasVencidas(hoy)]);
    }
    if (bloques.cirugias) {
      lista.push(['hoy', `cirugias|${hoy}`, () => LECTURAS.cirugias(hoy)]);
      lista.push(['manana', `cirugias|${manana}`, () => LECTURAS.cirugias(manana)]);
    }
    if (bloques.fibras) lista.push(['fibras', `fibras|${hoy}`, () => LECTURAS.fibras(hoy)]);
    return lista;
  }, [bloques.implantes, bloques.fibras, bloques.cirugias, hoy, manana]);
  const firma = pedidos.map(([, clave]) => clave).join(',');

  useEffect(() => {
    let cancelado = false;
    pedidos.forEach(([id, clave, leer]) => {
      recordar(clave, leer)
        .catch((error) => {
          console.error(`Error al leer pendientes del Inicio (${id}):`, error);
          return { error: true };
        })
        .then((r) => { if (!cancelado) setResultados((prev) => ({ ...prev, [id]: r })); });
    });
    return () => { cancelado = true; };
    // `firma` resume las claves pedidas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma]);

  return { resultados, hoy, manana };
};
