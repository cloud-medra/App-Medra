import { useState } from 'react';
import { FileUp } from 'lucide-react';
import OCSinPdf from './components/OCSinPdf';
import RegistrosOrdenes from './components/RegistrosOrdenes';

const PESTANAS = [
  { id: 'sinPdf', label: 'OC sin PDF' },
  { id: 'registros', label: 'Registros' }
];

// Ingreso de Órdenes. "OC sin PDF" (vista principal) sale del índice de OC
// en caché + el registro de PDF: 2 lecturas. "Registros" lee
// documentos_sistema y solo se monta al abrir esa pestaña. Una pestaña ya
// abierta queda montada (oculta) para no volver a leer al regresar.
// Misma pantalla en Documentos y en Implantes: `pathVista` es la ruta del
// menú que la monta (cada una con sus permisos granulares).
const IngresoOrdenes = ({ pathVista = '/documentos/ingresoOrdenes' }) => {
  const [pestana, setPestana] = useState('sinPdf');
  const [abiertas, setAbiertas] = useState(() => new Set(['sinPdf']));
  const abrir = (id) => { setPestana(id); setAbiertas(prev => (prev.has(id) ? prev : new Set([...prev, id]))); };

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-lg shadow-sm overflow-hidden font-sans text-[11px]">
      <header className="shrink-0 bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 px-3 py-2 flex items-center gap-2">
        <FileUp size={16} className="text-[#2383C2]" />
        <span className="text-[12px] font-normal text-slate-800 dark:text-gray-100 tracking-wide uppercase">
          Ingreso de Órdenes
        </span>
        <nav className="ml-3 flex items-center gap-1">
          {PESTANAS.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => abrir(p.id)}
              className={`px-2.5 py-1 rounded text-[11px] transition ${
                pestana === p.id
                  ? 'bg-[#2383C2] text-white'
                  : 'text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700/50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </nav>
      </header>

      {PESTANAS.filter(p => abiertas.has(p.id)).map(p => (
        <div key={p.id} className={pestana === p.id ? 'flex-grow flex flex-col min-h-0 overflow-hidden' : 'hidden'}>
          {p.id === 'sinPdf' ? <OCSinPdf /> : <RegistrosOrdenes pathVista={pathVista} />}
        </div>
      ))}
    </div>
  );
};

export default IngresoOrdenes;
