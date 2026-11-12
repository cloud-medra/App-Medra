import React from 'react';
import CambiarPasswordSeguro from './CambiarPasswordSeguro';
import { ShieldCheck } from 'lucide-react';

const Ajustes = () => {
  return (
    <div className="w-full h-full flex flex-col bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden p-0">
      
      <h2 className="text-titulo-seccion text-tinta-principal p-4 flex items-center gap-2 border-b border-gray-200">
        <ShieldCheck size={16} className="text-[#2383C2]" /> AJUSTES DE SEGURIDAD
      </h2>

      <div className="flex-grow p-6 flex justify-center items-start bg-gray-50/50 overflow-auto">
        <div className="w-full max-w-lg">
          <CambiarPasswordSeguro />
        </div>
      </div>
    </div>
  );
};

export default Ajustes;