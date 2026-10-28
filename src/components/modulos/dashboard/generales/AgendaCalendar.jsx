import React from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

const AgendaCalendar = ({ 
  currentDate, 
  selectedDate, 
  setSelectedDate, 
  handlePrevMonth, 
  handleNextMonth, 
  handleMonthChange, 
  handleYearChange 
}) => {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const nombreMeses = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  const diasSemana = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sá"];
  const añoActual = new Date().getFullYear();
  const rangoAños = Array.from({ length: 11 }, (_, i) => añoActual - 5 + i);

  const primerDiaMes = new Date(year, month, 1).getDay();
  const totalDiasMes = new Date(year, month + 1, 0).getDate();

  const esHoy = (dia) => {
    const hoy = new Date();
    return hoy.getDate() === dia && hoy.getMonth() === month && hoy.getFullYear() === year;
  };

  const esSeleccionado = (dia) => {
    return selectedDate.getDate() === dia && selectedDate.getMonth() === month && selectedDate.getFullYear() === year;
  };

  const celdasVacias = Array(primerDiaMes).fill(null);
  const diasMes = Array.from({ length: totalDiasMes }, (_, i) => i + 1);

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-3 flex flex-col justify-between">
      <div className="flex flex-wrap items-center justify-between gap-1 border-b border-gray-100 dark:border-gray-700 pb-2 mb-2">
        <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1 uppercase tracking-wide">
          <CalendarIcon size={13} className="text-[#2383C2]" /> Agenda
        </span>

        <div className="flex items-center gap-1">
          <button onClick={handlePrevMonth} className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors">
            <ChevronLeft size={13} />
          </button>

          <select value={month} onChange={handleMonthChange} className="text-[10px] font-bold text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-1 py-0.5 cursor-pointer focus:outline-none">
            {nombreMeses.map((m, index) => (<option key={index} value={index}>{m.substring(0, 3)}</option>))}
          </select>

          <select value={year} onChange={handleYearChange} className="text-[10px] font-bold text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-1 py-0.5 cursor-pointer focus:outline-none">
            {rangoAños.map((a) => (<option key={a} value={a}>{a}</option>))}
          </select>

          <button onClick={handleNextMonth} className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors">
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 text-center text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase mb-1">
        {diasSemana.map((dia, idx) => <div key={idx}>{dia}</div>)}
      </div>

      <div className="grid grid-cols-7 text-center text-[10.5px] gap-0.5 font-medium justify-items-center mb-2">
        {celdasVacias.map((_, idx) => <div key={`empty-${idx}`} className="h-5.5 w-5.5 flex items-center justify-center text-transparent">.</div>)}
        {diasMes.map((dia) => {
          const seleccionado = esSeleccionado(dia);
          const hoy = esHoy(dia);

          // Clases dinámicas según el estado
          let estilosEstado = 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700';

          if (seleccionado) {
            estilosEstado = 'bg-[#2383C2] text-white font-bold shadow-xs';
          } else if (hoy) {
            estilosEstado = 'border border-[#2383C2] text-[#2383C2] dark:text-sky-400 bg-blue-50/50 dark:bg-blue-900/20 font-bold';
          }

          return (
            <button 
              key={dia} 
              onClick={() => setSelectedDate(new Date(year, month, dia))} 
              className={`h-5.5 w-5.5 rounded flex items-center justify-center font-num text-[10px] transition-all ${estilosEstado}`}
            >
              {dia}
            </button>
          );
        })}
      </div>

      <div className="pt-1.5 border-t border-gray-100 dark:border-gray-700 text-[9.5px] text-gray-400 flex items-center justify-between px-0.5">
        <span>Selección:</span>
        <span className="font-num font-bold text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 px-1.5 py-0.2 rounded border border-gray-200 dark:border-gray-700">
          {selectedDate.toLocaleDateString('es-CL')}
        </span>
      </div>
    </div>
  );
};

export default AgendaCalendar;