import { useState } from 'react';
import { ScanBarcode, CornerDownLeft } from 'lucide-react';
import { esTeclaFinEscaneo } from './identificarLectura';

const ESTILOS = {
  ok: 'border-emerald-500 ring-2 ring-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 dark:ring-emerald-800',
  aviso: 'border-amber-500 ring-2 ring-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:ring-amber-800',
  error: 'border-red-500 ring-2 ring-red-300 bg-red-50 dark:bg-red-950/40 dark:ring-red-800'
};
const ESTILOS_MENSAJE = {
  ok: 'text-emerald-700 dark:text-emerald-300',
  aviso: 'text-amber-700 dark:text-amber-300',
  error: 'text-red-700 dark:text-red-300'
};

// Campo de lectura de la pistola (modo teclado: escribe el código y envía
// Enter). No está dentro de un <form>: el Enter cierra la lectura y nunca
// envía nada. También sirve para escribir el código a mano (Enter o "Leer").
// `ref` (React 19) apunta al input para devolverle el foco después de cada
// acción (la pantalla lo hace con `enfocar`); `autoFocus` lo enfoca al montar.
const CampoEscaneoBodega = ({ ref, onLectura, senal = null, mensaje = '', deshabilitado = false, placeholder, autoFocus = false }) => {
  const [texto, setTexto] = useState('');

  const leer = () => {
    const valor = texto;
    setTexto('');
    if (valor.trim()) onLectura(valor);
  };

  const handleKeyDown = (e) => {
    if (!esTeclaFinEscaneo(e)) return;
    // Tab con el campo vacío se deja pasar (navegación normal).
    if (e.key === 'Tab' && !texto.trim()) return;
    e.preventDefault();
    leer();
  };

  return (
    <div className="flex flex-col gap-1">
      <div className={`flex items-center gap-2 h-11 px-3 rounded-lg border-2 transition-colors bg-white dark:bg-gray-900 ${ESTILOS[senal] || 'border-[#2383C2]/60'}`}>
        <ScanBarcode size={20} className="text-[#2383C2] shrink-0" />
        <input
          ref={ref}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={deshabilitado}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Código de barra"
          placeholder={placeholder || 'Escanea o escribe un código y presiona Enter'}
          className="flex-1 min-w-0 h-full bg-transparent outline-none text-[14px] font-num text-gray-800 dark:text-gray-100 placeholder:text-gray-400 placeholder:font-sans placeholder:text-[12px] disabled:opacity-50"
        />
        <button
          type="button"
          onClick={leer}
          disabled={deshabilitado || !texto.trim()}
          className="h-7 px-2.5 rounded bg-[#2383C2] text-white text-[11px] font-bold flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <CornerDownLeft size={12} /> Leer
        </button>
      </div>
      <div role="status" aria-live="polite" className={`min-h-[16px] text-[11px] font-semibold ${ESTILOS_MENSAJE[senal] || 'text-gray-500 dark:text-gray-400'}`}>
        {mensaje}
      </div>
    </div>
  );
};

export default CampoEscaneoBodega;
