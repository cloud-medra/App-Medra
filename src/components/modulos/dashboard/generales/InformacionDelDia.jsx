import { Info, Sun, Leaf, Snowflake, Flower2, PartyPopper } from 'lucide-react';
import {
  obtenerFechaCompleta,
  obtenerDiaSemana,
  obtenerDiaDelAnio,
  obtenerSemanaDelAnio,
  obtenerEstacionChile,
  obtenerFeriadoChile
} from './utils/informacionDelDia';

const ICONO_ESTACION = { Verano: Sun, Otoño: Leaf, Invierno: Snowflake, Primavera: Flower2 };

const COLOR_ESTACION = {
  Verano: 'text-amber-500',
  Otoño: 'text-orange-500',
  Invierno: 'text-sky-500',
  Primavera: 'text-pink-500'
};

// Hoja 2 del carrusel de Agenda — misma "cáscara" de tarjeta que
// AgendaCalendar.jsx (mismo padding/bordes/tipografía) para que ambas
// hojas se vean como parte del mismo componente al deslizar entre ellas.
const InformacionDelDia = ({ fecha }) => {
  const { diaDelAnio, totalDias, porcentaje } = obtenerDiaDelAnio(fecha);
  const { semana, totalSemanas } = obtenerSemanaDelAnio(fecha);
  const estacion = obtenerEstacionChile(fecha);
  const feriado = obtenerFeriadoChile(fecha);
  const IconoEstacion = ICONO_ESTACION[estacion.nombre];

  return (
    <div className="h-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-3 flex flex-col justify-between">
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2 mb-2">
        <span className="text-titulo-seccion text-tinta-principal flex items-center gap-1 uppercase tracking-wide">
          <Info size={13} className="text-[#2383C2]" /> Información del Día
        </span>
      </div>

      <div className="flex flex-col gap-2.5 flex-1 min-h-0">
        <div className="text-center">
          <p className="text-subtitulo text-tinta-principal">{obtenerFechaCompleta(fecha)}</p>
          <p className="text-pequeno text-tinta-atenuada">{obtenerDiaSemana(fecha)}</p>
        </div>

        {feriado && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-pequeno">
            <PartyPopper size={12} className="shrink-0" /> Feriado: {feriado}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between text-pequeno text-tinta-secundaria mb-1">
            <span>Día {diaDelAnio} de {totalDias}</span>
            <span className="tabular-nums text-tinta-principal">{porcentaje.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#2383C2] rounded-full transition-all"
              style={{ width: `${Math.min(100, porcentaje)}%` }}
            />
          </div>
          <p className="text-pequeno text-tinta-atenuada mt-1">Semana {semana} de {totalSemanas}</p>
        </div>

        <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700">
          <IconoEstacion size={16} className={`shrink-0 ${COLOR_ESTACION[estacion.nombre]}`} />
          <div className="min-w-0">
            <p className="text-etiqueta text-tinta-principal">{estacion.nombre}</p>
            <p className="text-pequeno text-tinta-atenuada">
              {estacion.diasRestantes === 0
                ? `Cambia a ${estacion.proximaEstacion} mañana`
                : `${estacion.diasRestantes} día${estacion.diasRestantes === 1 ? '' : 's'} para ${estacion.proximaEstacion}`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InformacionDelDia;
