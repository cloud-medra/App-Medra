import { useEffect, useState } from 'react';

// Filtro con el que se abre una pantalla desde otra (ej. el panel del Inicio
// abre Gestión con el estado INCOMPLETO ya elegido). Quien navega lo fija con
// la ruta de destino; la pantalla lo lee al montarse y lo suelta, así una
// segunda visita abre con sus filtros de siempre. Solo memoria: no se guarda
// en Firestore ni en la URL.
const pendientes = new Map(); // ruta -> filtro

export const fijarFiltroInicial = (ruta, filtro) => {
  if (filtro) pendientes.set(ruta, filtro);
  else pendientes.delete(ruta);
};

export const leerFiltroInicial = (ruta) => pendientes.get(ruta) || null;

export const soltarFiltroInicial = (ruta) => pendientes.delete(ruta);

// Filtro pedido para `ruta` (o null), leído una vez al montar. Se suelta en
// un efecto y no en el render: en StrictMode el inicializador corre dos veces
// y la segunda lectura debe ver el mismo filtro.
export const useFiltroInicial = (ruta) => {
  const [filtro] = useState(() => (ruta ? leerFiltroInicial(ruta) : null));
  useEffect(() => { if (ruta) soltarFiltroInicial(ruta); }, [ruta]);
  return filtro;
};
