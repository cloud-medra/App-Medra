// Lectura de un mes completo para Exportar datos: gestiones de Implantes y
// Hemodinamia y registros de Consignación. Solo al presionar "Cargar" (no al
// abrir la pantalla) y sin listeners.
//
// Costo: 1 lectura por gestión y 1 por registro de consignación del mes.
// Las tres consultas son collectionGroup('detalles') acotadas por rango de
// documentId() a la carpeta del mes (mismo patrón que Gestión y el respaldo
// de Implantes): no traen otros módulos ni otros meses.
import { useCallback, useState } from 'react';
import { collectionGroup, documentId, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';
import { MODULOS_GESTION } from '../../operaciones/shared/modulosGestion';
import { rangoRutaMesGestiones, esRutaDelMes } from '../../operaciones/shared/gestion/consultaGestiones';
import { COL_BASE as COL_CONSIGNACION } from '../../operaciones/consignacion/utils/registroConsignacionService';
import { filasExportacion } from './filasExportacion';

// Carpeta del mes de Consignación: consignacion_registros/{año}/mes/{mes en minúscula}.
const MESES_CONSIGNACION = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const leerRango = async ({ desde, hasta }) => {
  const snap = await getDocs(query(collectionGroup(db, 'detalles'), where(documentId(), '>=', desde), where(documentId(), '<', hasta)));
  return snap.docs.map((d) => ({ id: d.id, refPath: d.ref.path, ...d.data() }));
};

const leerGestiones = async (modulo, anio, mes) => {
  const { coleccionGestiones } = MODULOS_GESTION[modulo];
  const docs = await leerRango(rangoRutaMesGestiones(coleccionGestiones, { anio, mes }));
  return docs.filter((d) => esRutaDelMes(d.refPath, coleccionGestiones, { anio, mes }));
};

const leerConsignacion = async (anio, mes) => {
  const carpeta = `${COL_CONSIGNACION}/${anio}/mes/${MESES_CONSIGNACION[Number(mes) - 1]}`;
  const docs = await leerRango({ desde: carpeta, hasta: `${carpeta}~` });
  return docs.filter((d) => d.refPath.startsWith(`${carpeta}/`));
};

// anio: 'AAAA', mes: 'MM'.
export const useExportarDatosData = () => {
  const [estado, setEstado] = useState({ cargando: false, error: '', filas: null, conteo: null, periodo: null });

  const cargar = useCallback(async (anio, mes) => {
    setEstado((e) => ({ ...e, cargando: true, error: '' }));
    try {
      const [implantes, hemodinamia, consignacion] = await Promise.all([
        leerGestiones('implantes', anio, mes),
        leerGestiones('hemodinamia', anio, mes),
        leerConsignacion(anio, mes),
      ]);
      setEstado({
        cargando: false,
        error: '',
        filas: filasExportacion({ implantes, hemodinamia, consignacion }),
        conteo: { implantes: implantes.length, hemodinamia: hemodinamia.length, consignacion: consignacion.length },
        periodo: { anio, mes },
      });
    } catch (err) {
      console.error('Exportar datos: no se pudo leer el mes', err);
      setEstado({ cargando: false, error: 'No se pudieron leer los datos de ese mes.', filas: null, conteo: null, periodo: null });
    }
  }, []);

  return { ...estado, cargar };
};
