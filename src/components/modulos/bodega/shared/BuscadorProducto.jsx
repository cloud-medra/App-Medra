import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { textoBusquedaProducto, normalizarClave } from '../../../../../functions/bodega/nucleo.mjs';

const MAX = 12;

// Búsqueda manual en el maestro de Bodega (sin pistola): nombre, código
// maestro, referencia o código de barra. Solo productos activos.
const BuscadorProducto = ({ onElegir, deshabilitado = false, placeholder = 'Buscar producto por nombre o código…', filtro }) => {
  const { datos: productos } = useCatalogo('bodegaProductos');
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);

  const resultados = useMemo(() => {
    const palabras = normalizarClave(texto).split(' ').filter(Boolean);
    if (!palabras.length) return [];
    return productos
      .filter((p) => p.activo !== false && (!filtro || filtro(p)) && palabras.every((w) => textoBusquedaProducto(p).includes(w)))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .slice(0, MAX);
  }, [productos, texto, filtro]);

  const elegir = (p) => {
    setTexto('');
    setAbierto(false);
    onElegir(p);
  };

  return (
    <div className="relative">
      <Search className="absolute left-2 top-2.5 text-gray-400" size={14} />
      <input
        value={texto}
        disabled={deshabilitado}
        onChange={(e) => { setTexto(e.target.value); setAbierto(true); }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => { if (e.key === 'Enter' && resultados.length === 1) { e.preventDefault(); elegir(resultados[0]); } }}
        placeholder={placeholder}
        className="w-full h-9 pl-8 pr-2 border border-gray-300 dark:border-gray-600 rounded text-normal outline-none bg-white dark:bg-gray-900 text-tinta-principal focus:border-[#2383C2]"
      />
      {abierto && resultados.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full max-h-64 overflow-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded shadow-lg divide-y divide-gray-100 dark:divide-gray-800">
          {resultados.map((p) => (
            <li key={p.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(p)} className="w-full text-left px-2 py-1.5 hover:bg-blue-50 dark:hover:bg-gray-800 text-normal">
                <span className="text-etiqueta text-tinta-principal">{p.nombre}</span>
                <span className="ml-1 text-numero-tabla text-tinta-secundaria">{p.codigoMaestro}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default BuscadorProducto;
