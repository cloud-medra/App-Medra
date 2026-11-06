import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import AgendaCalendar from './AgendaCalendar';
import InformacionDelDia from './InformacionDelDia';

const TOTAL_HOJAS = 2;

const variantes = {
  entra: (direccion) => ({ x: direccion > 0 ? 24 : -24, opacity: 0 }),
  centro: { x: 0, opacity: 1 },
  sale: (direccion) => ({ x: direccion > 0 ? -24 : 24, opacity: 0 })
};

// Carrusel de 2 hojas para la card de Agenda del Dashboard: Hoja 1 es
// AgendaCalendar.jsx sin ningún cambio (recibe exactamente las mismas
// props que antes recibía directo desde ResumenGeneral.jsx); Hoja 2 es
// InformacionDelDia.jsx, calculada sobre `selectedDate` (la fecha marcada
// en el calendario de la Hoja 1, no la fecha de hoy) — así, si el usuario
// hace clic en otro día, la Hoja 2 recalcula todo para esa fecha.
const AgendaCarrusel = (props) => {
  const { selectedDate } = props;
  const [hoja, setHoja] = useState(0);
  const [direccion, setDireccion] = useState(1);

  const irA = (indice) => {
    setDireccion(indice > hoja ? 1 : -1);
    setHoja(indice);
  };
  const irAnterior = () => hoja > 0 && irA(hoja - 1);
  const irSiguiente = () => hoja < TOTAL_HOJAS - 1 && irA(hoja + 1);

  return (
    <div className="flex flex-col gap-1.5 min-h-0">
      <div className="flex items-center justify-between px-0.5">
        <button
          type="button"
          onClick={irAnterior}
          disabled={hoja === 0}
          className="flex items-center gap-0.5 text-pequeno text-tinta-atenuada hover:text-[#2383C2] disabled:opacity-30 disabled:hover:text-tinta-atenuada disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={12} /> Anterior
        </button>

        <div className="flex items-center gap-1">
          {Array.from({ length: TOTAL_HOJAS }, (_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => irA(idx)}
              aria-label={`Ir a hoja ${idx + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                hoja === idx ? 'w-4 bg-[#2383C2]' : 'w-1.5 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500'
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={irSiguiente}
          disabled={hoja === TOTAL_HOJAS - 1}
          className="flex items-center gap-0.5 text-pequeno text-tinta-atenuada hover:text-[#2383C2] disabled:opacity-30 disabled:hover:text-tinta-atenuada disabled:cursor-not-allowed transition-colors"
        >
          Siguiente <ChevronRight size={12} />
        </button>
      </div>

      <div className="relative overflow-hidden">
        <AnimatePresence mode="wait" custom={direccion} initial={false}>
          <motion.div
            key={hoja}
            custom={direccion}
            variants={variantes}
            initial="entra"
            animate="centro"
            exit="sale"
            transition={{ duration: 0.22, ease: 'easeInOut' }}
          >
            {hoja === 0 ? <AgendaCalendar {...props} /> : <InformacionDelDia fecha={selectedDate} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default AgendaCarrusel;
