import { useCallback, useState } from 'react';

// "Fijar columnas" de la tabla de Gestiones (Implantes y Hemodinamia).
// Fijadas, las columnas de la izquierda (estado a empresa) quedan sticky al
// hacer scroll horizontal; en un celular ocupan casi todo el ancho y tapan
// el resto, por eso el valor por defecto depende del ancho de pantalla
// (mismo corte de 768px que el sidebar del Dashboard). La elección del
// usuario se guarda en localStorage del navegador, por módulo; nada va a
// Firestore.

export const ANCHO_ESCRITORIO = '(min-width: 768px)';

export const claveFijarColumnas = (modulo) => `medra:gestiones:${modulo}:fijarColumnas`;

// Sin matchMedia (tests, navegadores antiguos) se asume escritorio.
export const esPantallaEscritorio = () => window.matchMedia?.(ANCHO_ESCRITORIO).matches ?? true;

// Preferencia guardada ('1' / '0'); cualquier otro valor, o sin
// localStorage, cae al valor por defecto según la pantalla.
export const leerFijarColumnas = (clave, porDefecto) => {
  try {
    const valor = localStorage.getItem(clave);
    if (valor === '1') return true;
    if (valor === '0') return false;
  } catch { /* sin localStorage */ }
  return porDefecto;
};

export const guardarFijarColumnas = (clave, fijar) => {
  try { localStorage.setItem(clave, fijar ? '1' : '0'); } catch { /* sin localStorage: dura mientras la pantalla está abierta */ }
};

export const useFijarColumnas = (modulo) => {
  const clave = claveFijarColumnas(modulo);
  const [fijar, setFijar] = useState(() => leerFijarColumnas(clave, esPantallaEscritorio()));
  const cambiarFijar = useCallback((valor) => {
    setFijar(valor);
    guardarFijarColumnas(clave, valor);
  }, [clave]);
  return [fijar, cambiarFijar];
};
