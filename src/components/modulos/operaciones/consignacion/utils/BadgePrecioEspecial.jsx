import React from 'react';
import { BadgeDollarSign } from 'lucide-react';

// Indicador sutil de que el precio de una carga fue editado (precio especial,
// ver utils/precioEspecial.js). El tooltip muestra el precio del maestro.
const BadgePrecioEspecial = ({ costoMaestro }) => (
  <span
    title={`Precio especial (maestro: $${Number(costoMaestro || 0).toLocaleString('es-CL')})`}
    className="inline-flex items-center gap-0.5 ml-1 px-1 rounded-full text-[8px] font-bold uppercase bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 align-middle whitespace-nowrap"
  >
    <BadgeDollarSign size={9} /> Especial
  </span>
);

export default BadgePrecioEspecial;
