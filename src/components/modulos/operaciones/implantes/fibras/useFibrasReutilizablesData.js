import { useCallback, useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../../../firebaseConfig';
import { useToast } from '../../../../../context/ToastContext';
import { useUser } from '../../../../../context/UserContext';
import { fechaISOEnChile } from '../../shared/gestion/rangoFechaGestiones';
import { textoUsoRegistrado } from './fibrasNucleo';
import {
  leerTodasLasFibras, leerUsosDeFibra, registrarFibras, editarFibra, registrarPerdida, anularPerdida,
  ponerEnUso, devolverABodega, leerMovimientosUbicacion,
} from './fibrasTransacciones';

// Códigos maestros marcados como fibra reutilizable (pocos: una consulta por
// igualdad, índice simple automático; no carga el catálogo completo).
export const leerCodigosFibra = async () => {
  const snap = await getDocs(query(collection(db, 'maestros_codigos'), where('fibraReutilizable', '==', true)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.referencia || '').localeCompare(b.referencia || ''));
};

// Datos de Implantes → Fibras. Lee la colección al abrir y tras cada acción
// (es chica); no queda escuchando.
export const useFibrasReutilizablesData = () => {
  const { showToast } = useToast();
  const { userData } = useUser();
  const [fibras, setFibras] = useState(null);
  const [version, setVersion] = useState(0);
  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let vigente = true;
    leerTodasLasFibras()
      .then((lista) => { if (vigente) setFibras(lista); })
      .catch((e) => {
        console.error('Error al leer fibras:', e);
        if (vigente) { setFibras([]); showToast('No se pudieron leer las fibras.', 'error'); }
      });
    return () => { vigente = false; };
  }, [version, showToast]);

  // Ejecuta una acción, avisa el resultado y recarga. Devuelve true si resultó.
  const ejecutar = async (accion, exito) => {
    try {
      const resultado = await accion();
      const texto = typeof exito === 'function' ? exito(resultado) : exito;
      if (texto) showToast(texto, 'success');
      recargar();
      return true;
    } catch (e) {
      console.error('Error en fibras:', e);
      showToast(e?.esErrorFibra ? e.message : `No se pudo completar: ${e?.message || 'error desconocido'}`, 'error');
      return false;
    }
  };

  return {
    fibras,
    hoy: fechaISOEnChile(),
    recargar,
    registrar: (datos) => ejecutar(
      () => registrarFibras(datos, userData),
      (codigos) => (codigos.length === 1 ? `Fibra ${codigos[0]} registrada` : `Fibras registradas: ${codigos[0]} a ${codigos[codigos.length - 1]}`)
    ),
    editar: (fibraId, valores) => ejecutar(
      () => editarFibra(fibraId, valores, userData),
      (hubo) => (hubo ? `Fibra ${fibraId} corregida` : 'No hay cambios para guardar')
    ),
    registrarPerdida: (fibraId, motivo) => ejecutar(
      () => registrarPerdida(fibraId, { motivo, fecha: fechaISOEnChile() }, userData),
      (r) => textoUsoRegistrado(r)
    ),
    anularPerdida: (fibraId, usoId, motivo) => ejecutar(
      () => anularPerdida(fibraId, usoId, motivo, userData),
      'Pérdida anulada: el uso volvió a quedar disponible'
    ),
    ponerEnUso: (fibra) => ejecutar(
      () => ponerEnUso(fibra.id, userData),
      ({ devuelta }) => `${fibra.codigoInterno} quedó EN USO${devuelta ? `; ${devuelta} volvió a bodega` : ''}`
    ),
    devolverABodega: (fibra) => ejecutar(
      () => devolverABodega(fibra.id, userData),
      `${fibra.codigoInterno} volvió a bodega`
    ),
    leerUsos: leerUsosDeFibra,
    leerMovimientos: leerMovimientosUbicacion,
  };
};
