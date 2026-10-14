import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useCatalogo } from '../../../../../hooks/useCatalogo';
import { normalizarClave } from '../../../../../../functions/bodega/nucleo.mjs';

// Proveedor = empresa del maestro de Empresas (maestros_empresas, activas).
const SelectorProveedor = ({ valor, onCambiar, deshabilitado = false }) => {
  const { datos: empresas } = useCatalogo('empresas');
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const elegida = empresas.find((e) => e.id === valor);

  const opciones = useMemo(() => {
    const q = normalizarClave(texto);
    return empresas
      .filter((e) => e.nombre && e.estado !== 'INACTIVO' && (!q || normalizarClave(`${e.nombre} ${e.rut || ''}`).includes(q)))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .slice(0, 15);
  }, [empresas, texto]);

  if (elegida) {
    return (
      <div className="h-9 px-2 flex items-center gap-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-[12px]">
        <span className="flex-1 truncate font-semibold">{elegida.nombre}</span>
        {elegida.rut && <span className="font-num text-[11px] text-gray-500">{elegida.rut}</span>}
        {!deshabilitado && <button type="button" onClick={() => onCambiar('')} title="Cambiar proveedor" className="p-0.5 text-gray-400 hover:text-red-600"><X size={13} /></button>}
      </div>
    );
  }
  return (
    <div className="relative">
      <input
        value={texto}
        disabled={deshabilitado}
        onChange={(e) => { setTexto(e.target.value); setAbierto(true); }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder="Buscar proveedor por nombre o RUT…"
        className="w-full h-9 px-2 border border-gray-300 dark:border-gray-600 rounded text-[12px] outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:border-[#2383C2]"
      />
      {abierto && opciones.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full max-h-60 overflow-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded shadow-lg">
          {opciones.map((e) => (
            <li key={e.id}>
              <button type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={() => { onCambiar(e.id); setTexto(''); setAbierto(false); }}
                className="w-full text-left px-2 py-1.5 hover:bg-blue-50 dark:hover:bg-gray-800 text-[12px]">
                {e.nombre} {e.rut && <span className="font-num text-[11px] text-gray-500">{e.rut}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SelectorProveedor;
