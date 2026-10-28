import { useEffect, useState } from 'react';
import { leerFibrasActivas } from './fibrasTransacciones';
import { normalizarReferencia } from './fibrasNucleo';

const SIN_FIBRAS = [];

// Fibras activas de una referencia para el selector de Cargas: una lectura al
// elegir la referencia (no queda escuchando). El resultado se guarda con la
// referencia que lo pidió, así "cargando" se deriva sin setState en el efecto.
export const useFibrasDeReferencia = (referencia, activo) => {
  const ref = activo ? normalizarReferencia(referencia) : '';
  const [resultado, setResultado] = useState({ ref: '', fibras: SIN_FIBRAS, error: '' });
  useEffect(() => {
    if (!ref) return undefined;
    let vigente = true;
    leerFibrasActivas(ref)
      .then((fibras) => { if (vigente) setResultado({ ref, fibras, error: '' }); })
      .catch((e) => {
        console.error('Error al leer fibras:', e);
        if (vigente) setResultado({ ref, fibras: SIN_FIBRAS, error: 'No se pudieron leer las fibras.' });
      });
    return () => { vigente = false; };
  }, [ref]);
  const listo = ref !== '' && resultado.ref === ref;
  return {
    fibras: listo ? resultado.fibras : SIN_FIBRAS,
    cargando: ref !== '' && !listo,
    error: listo ? resultado.error : '',
  };
};
