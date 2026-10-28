import React from 'react';
import { obtenerNombreMostrar } from '../../../../utils/nombreMostrar';

const BienvenidaCard = ({ userData }) => {
  const nombreMostrar = obtenerNombreMostrar(userData, { mayusculas: true }) || 'CARGANDO...';

  return (
    <div className="bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700/60 rounded-lg p-3 sm:p-4 min-w-0">
      <p className="text-[14px] font-medium text-gray-700 dark:text-gray-200 mb-1 [overflow-wrap:anywhere]">
        Hola, <span className="text-[#2383C2] font-bold">{nombreMostrar}</span>.
      </p>
      <p className="text-[11.5px] leading-relaxed text-gray-500 dark:text-gray-400">
        Bienvenido al panel de control centralizado de <strong className="text-gray-600 dark:text-gray-300">Cloud - Medra</strong>. Desde el menú lateral izquierdo puedes gestionar y ejecutar las operaciones de los módulos autorizados para tu rol en el sistema.
      </p>
    </div>
  );
};

export default BienvenidaCard;