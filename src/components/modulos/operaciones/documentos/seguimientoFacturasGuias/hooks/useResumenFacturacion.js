// Datos de Resumen Mensual: los documentos de resumen_facturacion_mensual
// (uno por año, pocos) se leen una vez al abrir la pantalla — 1 lectura por
// año — y cambiar de año no vuelve a leer. El año actual siempre está entre
// las opciones (aunque todavía no tenga resumen) y es el elegido por defecto.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../../../../firebaseConfig';
import { COL_RESUMEN, reconstruirResumen } from '../../resumenFacturacion/resumenFacturacionService';

const anioActual = () => String(new Date().getFullYear());

export const useResumenFacturacion = () => {
  const [anio, setAnio] = useState(anioActual);
  const [resumenes, setResumenes] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [recalculando, setRecalculando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, COL_RESUMEN));
        if (!cancelado) setResumenes(Object.fromEntries(snap.docs.map(d => [d.id, d.data()])));
      } catch (err) {
        console.error('Error al cargar el resumen de facturación:', err);
        if (!cancelado) setError('No se pudo cargar el resumen de facturación.');
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  const anios = useMemo(() => [...new Set([anioActual(), ...Object.keys(resumenes)])]
    .filter(a => /^\d{4}$/.test(a))
    .sort((a, b) => b.localeCompare(a)), [resumenes]);

  // Lanza si falla (la pantalla avisa); deja el año recalculado en memoria.
  const recalcular = useCallback(async () => {
    setRecalculando(true);
    try {
      const r = await reconstruirResumen(anio);
      setResumenes(prev => ({ ...prev, [anio]: { anio: Number(anio), meses: r.meses, actualizadoEn: new Date() } }));
      return r;
    } finally {
      setRecalculando(false);
    }
  }, [anio]);

  return { anio, setAnio, anios, resumen: resumenes[anio] || null, cargando, error, recalcular, recalculando };
};
