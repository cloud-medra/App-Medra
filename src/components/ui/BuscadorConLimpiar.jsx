import { useRef } from 'react';
import { Search, X } from 'lucide-react';

// Buscador de las tablas de Gestiones (Implantes, Hemodinamia): la "X" aparece
// solo con texto y, igual que Escape, borra la búsqueda y deja el cursor en
// el campo para escribir de nuevo.
export const BuscadorConLimpiar = ({ value, onChange, placeholder, className = 'w-64' }) => {
  const inputRef = useRef(null);
  const limpiar = () => {
    onChange('');
    inputRef.current?.focus();
  };

  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-2 top-1.5 text-gray-400 dark:text-gray-500" size={13} />
      <input
        ref={inputRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape' && value) { e.preventDefault(); limpiar(); } }}
        className="w-full h-7 pl-7 pr-7 border border-gray-300 dark:border-gray-600 rounded text-secundario outline-none bg-white dark:bg-gray-900 text-tinta-principal focus:border-[#2383C2]"
        placeholder={placeholder}
      />
      {value && (
        <button
          type="button"
          onClick={limpiar}
          title="Limpiar búsqueda"
          aria-label="Limpiar búsqueda"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded cursor-pointer text-gray-400 dark:text-gray-500 hover:text-[#2383C2] hover:bg-gray-100 dark:hover:bg-gray-700 transition"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
};

export default BuscadorConLimpiar;
