import React, { useState } from 'react';
import { LayoutGrid, LayoutList } from 'lucide-react';
import CodigosMaestros from '../codigosMaestros/CodigosMaestros';
import CodigosMaestrosV2 from './CodigosMaestrosV2';

// Pantalla de Códigos (Maestros, Implantes y Hemodinamia) con el switch
// "Vista clásica / Vista nueva". La preferencia se guarda por navegador en
// localStorage; por defecto, la vista clásica. Solo una vista está montada
// a la vez y ambas leen del mismo catalogosStore (listener compartido que
// no se cierra al cambiar de vista), así que cambiar no duplica lecturas.
const CLAVE_VISTA = 'workcraft:codigos:vista';

const leerVista = () => {
  try {
    return localStorage.getItem(CLAVE_VISTA) === 'nueva' ? 'nueva' : 'clasica';
  } catch {
    return 'clasica';
  }
};

const SelectorVista = ({ vista, onCambiar }) => (
  <div role="radiogroup" aria-label="Vista de Códigos" className="inline-flex shrink-0 p-0.5 rounded-md bg-slate-100 dark:bg-gray-800 border border-slate-200 dark:border-gray-700">
    {[
      { id: 'clasica', label: 'Vista clásica', Icono: LayoutList },
      { id: 'nueva', label: 'Vista nueva', Icono: LayoutGrid }
    ].map(({ id, label, Icono }) => (
      <button
        key={id}
        type="button"
        role="radio"
        aria-checked={vista === id}
        onClick={() => onCambiar(id)}
        className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[12px] font-medium transition-colors ${vista === id
          ? 'bg-white dark:bg-gray-900 text-slate-900 dark:text-gray-50 shadow-sm'
          : 'text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200'}`}
      >
        <Icono size={13} className={vista === id ? 'text-[#2383C2]' : ''} />
        {label}
      </button>
    ))}
  </div>
);

const CodigosConSelectorVista = ({ rutaBase }) => {
  const [vista, setVista] = useState(leerVista);
  const cambiar = (nueva) => {
    setVista(nueva);
    try { localStorage.setItem(CLAVE_VISTA, nueva); } catch { /* sin localStorage */ }
  };
  const selector = <SelectorVista vista={vista} onCambiar={cambiar} />;

  if (vista === 'nueva') return <CodigosMaestrosV2 rutaBase={rutaBase} selectorVista={selector} />;

  // La vista clásica no se modifica: el switch va en una franja sobre su encabezado.
  return (
    <div className="w-full h-full flex flex-col gap-2">
      <div className="shrink-0 flex justify-end">{selector}</div>
      <div className="flex-1 min-h-0">
        <CodigosMaestros rutaBase={rutaBase} />
      </div>
    </div>
  );
};

export default CodigosConSelectorVista;
