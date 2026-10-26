import React from 'react';
import { COLOR_MENU_POR_DEFECTO } from '../../config/modulesConfig.jsx';

// Ícono de módulo o ítem del menú dentro de un cuadrito con un tinte suave de
// su color (en oscuro, tinte más fuerte e ícono aclarado). El color sale de
// la configuración (PALETA_MENU en config/modulesConfig.jsx).
// tamano: 'md' (módulos, 28 px) | 'sm' (ítems del sidebar, 24 px) | 'lg' (tarjetas, 36 px).
const TAMANOS = {
  sm: { caja: 'w-6 h-6', icono: 14 },
  md: { caja: 'w-7 h-7', icono: 16 },
  lg: { caja: 'w-9 h-9', icono: 18 },
};

const CuadritoIcono = ({ icon, color = COLOR_MENU_POR_DEFECTO, tamano = 'md', className = '' }) => {
  const t = TAMANOS[tamano] || TAMANOS.md;
  return (
    <span
      className={`${t.caja} rounded-md inline-flex items-center justify-center flex-shrink-0 bg-[color:color-mix(in_srgb,var(--c)_12%,transparent)] text-[color:var(--c)] dark:bg-[color:color-mix(in_srgb,var(--c)_28%,transparent)] dark:text-[color:color-mix(in_srgb,var(--c)_45%,white)] ${className}`}
      style={{ '--c': color }}
    >
      {React.isValidElement(icon) ? React.cloneElement(icon, { size: t.icono }) : icon}
    </span>
  );
};

export default CuadritoIcono;
