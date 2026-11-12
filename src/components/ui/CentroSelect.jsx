import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useCatalogo } from '../../hooks/useCatalogo';
import { ordenarPor } from '../../stores/catalogosStore';
import { ChevronDown, Check, Search } from 'lucide-react';

// "maestros_centros" viene del catalogosStore: se lee una sola vez por
// sesión y la comparten todas las pantallas. Se excluyen los inactivos y
// los que no tienen nombre (el orderBy('nombre') original los omitía).
// Por defecto (gestiones de Implantes y Consignación) solo los marcados
// "Usar en gestiones" (sin la marca = sí, como los centros anteriores a
// ella); con `todos` (centro de costo de un usuario), todos los activos.
const filtrarCentrosActivos = (datos, { todos = false } = {}) => datos
  .filter(centro => centro.nombre && centro.estado !== 'INACTIVO' && (todos || centro.usarEnGestiones !== false))
  .sort(ordenarPor('nombre'));

const CentroSelect = ({ value, onChange, placeholder = "Seleccionar centro...", disabled = false, todos = false }) => {
  const { datos: centrosCatalogo } = useCatalogo('centros');
  const centros = useMemo(() => filtrarCentrosActivos(centrosCatalogo, { todos }), [centrosCatalogo, todos]);
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const containerRef = useRef(null);
  const dropdownRef = useRef(null);

  // El dropdown se renderiza en un portal a document.body (ver más abajo),
  // así que "clic afuera" tiene que ignorar tanto la caja del select como el
  // propio dropdown portado — si solo mirara containerRef, un clic en una
  // opción cerraría el menú en el mousedown antes de que llegue el click.
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        containerRef.current && !containerRef.current.contains(event.target) &&
        dropdownRef.current && !dropdownRef.current.contains(event.target)
      ) {
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const actualizarPosicion = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, []);

  // Reposiciona mientras está abierto: si el contenedor scrollea (o la
  // ventana cambia de tamaño), el dropdown portado tiene que seguir al
  // input en vez de quedar flotando en una posición vieja. Capture:true en
  // "scroll" para detectar el scroll de CUALQUIER ancestro, no solo window.
  useEffect(() => {
    if (!abierto) return;
    actualizarPosicion();
    window.addEventListener('scroll', actualizarPosicion, true);
    window.addEventListener('resize', actualizarPosicion);
    return () => {
      window.removeEventListener('scroll', actualizarPosicion, true);
      window.removeEventListener('resize', actualizarPosicion);
    };
  }, [abierto, actualizarPosicion]);

  const centrosFiltrados = centros.filter(centro =>
    centro.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  const centroSeleccionado = centros.find(centro => centro.id === value || centro.nombre === value);
  // Valor que ya no se ofrece (centro inactivo o sin "Usar en gestiones"):
  // su nombre si sigue en el maestro; si no, lo guardado (las gestiones
  // guardan el nombre).
  const valorFueraDeLista = value
    ? centrosCatalogo.find(centro => centro.id === value || centro.nombre === value)?.nombre || value
    : '';

  const handleSelect = (centro) => {
    onChange(centro);
    setBusqueda('');
    setAbierto(false);
  };

  const handleToggle = () => {
    if (!abierto) actualizarPosicion();
    setAbierto(o => !o);
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <div
        onClick={disabled ? undefined : handleToggle}
        className={`w-full h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-secundario bg-white dark:bg-gray-900 text-tinta-principal flex items-center justify-between focus-within:border-[#2383C2] ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className={`truncate ${!centroSeleccionado && !value ? 'text-tinta-atenuada' : ''}`}>
          {/* Una gestión antigua guarda el nombre: se sigue mostrando aunque ese
              centro ya no se ofrezca (inactivo o sin "Usar en gestiones"). */}
          {centroSeleccionado ? centroSeleccionado.nombre : (valorFueraDeLista || placeholder)}
        </span>
        <ChevronDown size={13} className="text-gray-400 shrink-0 ml-1" />
      </div>

      {abierto && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width }}
          className="max-h-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-[1000] flex flex-col overflow-hidden"
        >
          <div className="p-1.5 border-b border-gray-200 dark:border-gray-700 flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900">
            <Search size={12} className="text-gray-400 shrink-0" />
            <input
              type="text"
              autoFocus
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre..."
              className="w-full text-secundario bg-transparent outline-none text-tinta-principal placeholder:text-tinta-atenuada"
            />
          </div>

          <ul className="overflow-y-auto max-h-44 text-secundario">
            {centrosFiltrados.length > 0 ? (
              centrosFiltrados.map((centro) => {
                const isSelected = value === centro.id || value === centro.nombre;
                return (
                  <li
                    key={centro.id}
                    onClick={() => handleSelect(centro)}
                    className={`px-2 py-1.5 flex items-center justify-between cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/60 ${
                      isSelected ? 'bg-blue-50 dark:bg-blue-900/30 text-[#2383C2]' : 'text-tinta-principal'
                    }`}
                  >
                    <div className="flex flex-col truncate">
                      <span className="truncate">{centro.nombre}</span>
                      {centro.comentario && (
                        <span className="text-pequeno text-tinta-atenuada truncate">{centro.comentario}</span>
                      )}
                    </div>
                    {isSelected && <Check size={12} className="text-[#2383C2] shrink-0 ml-1" />}
                  </li>
                );
              })
            ) : (
              <li className="px-2 py-2 text-center text-tinta-atenuada text-pequeno">
                No se encontraron coincidencias
              </li>
            )}
          </ul>
        </div>,
        document.body
      )}
    </div>
  );
};

export default CentroSelect;
