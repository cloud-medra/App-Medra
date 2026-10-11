import React, { useState } from 'react';
import { LayoutDashboard } from 'lucide-react';

import BienvenidaCard from './generales/BienvenidaCard';
import BrandingCard from './generales/BrandingCard';
import NuevoModuloCard from './generales/NuevoModuloCard';
import AgendaCarrusel from './generales/AgendaCarrusel';
import AtajosCard from './generales/AtajosCard';
// AvanceInventario.jsx queda fuera de circulación a propósito (sin
// eliminar el archivo); en su lugar va el widget de Accesos rápidos.
// import AvanceInventario from './generales/AvanceInventario';

const ResumenGeneral = ({ userData, onAbrirAtajo }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const handleMonthChange = (e) => setCurrentDate(new Date(year, parseInt(e.target.value), 1));
  const handleYearChange = (e) => setCurrentDate(new Date(parseInt(e.target.value), month, 1));

  return (
    <div className="w-full h-full flex flex-col gap-3 overflow-hidden pr-1">

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm flex items-center justify-between p-2.5 flex-shrink-0">
        <h2 className="text-[12px] font-bold text-gray-700 dark:text-gray-100 flex items-center gap-2 uppercase tracking-wider">
          <LayoutDashboard size={14} className="text-[#2383C2]" /> Panel de Control General
        </h2>
        <span className="text-[9px] bg-blue-50 dark:bg-blue-900/30 text-[#2383C2] font-bold px-1.5 py-0.5 rounded border border-blue-100 dark:border-blue-800 uppercase tracking-wide">
          Entorno Activo
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 flex-grow min-h-0 items-stretch">

        {/* Columna Izquierda principal */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm flex flex-col justify-between p-4 min-h-0 h-full">

          <div className="flex flex-col gap-3 flex-1 min-h-0 h-full">
            <BienvenidaCard userData={userData} />

            <BrandingCard />

            {/* Accesos rápidos a la izquierda (y primero al apilar en móvil); aprovecha el espacio restante sin forzar el scroll global */}
            <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden">
              <AtajosCard permisos={userData?.permisos} onAbrir={onAbrirAtajo} />
            </div>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-700 pt-3 bg-gray-50/30 dark:bg-black/10 -mx-4 -mb-4 p-4 rounded-b-lg mt-3 flex-shrink-0">
            <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase block mb-0.5 tracking-wider">Seguridad y Permisos</span>
            <p className="text-[11.5px] text-gray-500 dark:text-gray-400">
              Tu perfil <span className="font-semibold text-gray-700 dark:text-gray-200 uppercase">{userData?.rol || 'Operador'}</span> registra acceso a <strong className="text-gray-700 dark:text-gray-200">{Object.keys(userData?.permisos || {}).length} secciones</strong> configuradas.
            </p>
          </div>
        </div>

        {/* Columna Derecha */}
        <div className="flex flex-col gap-3 min-h-0">
          <AgendaCarrusel
            currentDate={currentDate}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            handlePrevMonth={handlePrevMonth}
            handleNextMonth={handleNextMonth}
            handleMonthChange={handleMonthChange}
            handleYearChange={handleYearChange}
          />

          {/* <AvanceInventario /> */}
          {/* Notas a la derecha; ocupa el alto que deja la agenda */}
          <div className="flex-1 min-h-[240px] flex flex-col overflow-hidden">
            <NuevoModuloCard />
          </div>
        </div>

      </div>
    </div>
  );
};

export default ResumenGeneral;