import React from 'react';
import { obtenerNombreMostrar } from '../../../../utils/nombreMostrar';

const BienvenidaCard = ({ userData }) => {
  const nombreMostrar = obtenerNombreMostrar(userData, { mayusculas: true }) || 'CARGANDO...';

  return (
    <div className="bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700/60 rounded-lg p-3 sm:p-4 min-w-0">
      <p className="text-titulo-seccion text-tinta-principal mb-1 [overflow-wrap:anywhere]">
        Hola, <strong className="text-[#2383C2]">{nombreMostrar}</strong>.
      </p>
      <p className="text-normal text-tinta-secundaria">
        Bienvenido al panel de control centralizado de <strong className="text-tinta-principal">Cloud - Medra</strong>. Desde el menú lateral izquierdo puedes gestionar y ejecutar las operaciones de los módulos autorizados para tu rol en el sistema.
      </p>
    </div>
  );
};

export default BienvenidaCard;