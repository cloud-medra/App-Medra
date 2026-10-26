import { useEffect, useState } from 'react';
import { ocsDeGestion } from '../ocIndex/indiceOC';
import { claveOC } from './ordenesOCHelpers';
import { escucharRegistroPdfOC } from './registroPdfOC';

// Estado de la Orden de una gestión para colorear la tabla de Gestiones:
//   'conPdf'    tiene OC y TODAS sus OC tienen PDF        → verde
//   'sinPdf'    tiene OC y alguna todavía no tiene PDF    → naranjo
//   'sinOrden'  no tiene OC (y por lo tanto tampoco PDF)  → gris
//   'cargando'  tiene OC pero aún no se sabe si hay PDF (registro sin leer)
// Las OC salen de ocsDeGestion (la columna Orden) y el PDF del mismo
// registro que usa la pestaña Orden del detalle (ordenesOC/registroPdf).
export const estadoOrdenGestion = (gestion, pdfs) => {
  const ocs = ocsDeGestion(gestion);
  if (ocs.length === 0) return 'sinOrden';
  if (!pdfs) return 'cargando';
  return ocs.every(oc => pdfs[claveOC(oc)]) ? 'conPdf' : 'sinPdf';
};

/**
 * Registro de PDF de OC para la tabla de Gestiones: UN listener en vivo sobre
 * el documento ordenesOC/registroPdf (no una lectura por fila). Cuesta 1
 * lectura al abrir y 1 por cada PDF que suba cualquier usuario; los colores
 * se actualizan solos. Se usa en GestionGestiones, que sigue montado al
 * entrar y salir del detalle: el listener no se duplica y se cierra al salir
 * de Gestiones (o con `habilitado` en false).
 * Devuelve { pdfs: objeto | null mientras carga, error }.
 */
export const useRegistroPdfGestiones = (habilitado = true) => {
  const [pdfs, setPdfs] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!habilitado) return undefined;
    return escucharRegistroPdfOC(
      (datos) => { setPdfs(datos); setError(null); },
      (err) => {
        console.error('Error al escuchar el registro de PDF de OC:', err);
        setError('No se pudo cargar qué órdenes tienen PDF.');
      }
    );
  }, [habilitado]);

  return { pdfs, error };
};
