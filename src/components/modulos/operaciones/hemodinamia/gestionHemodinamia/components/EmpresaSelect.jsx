import { useState, useMemo, useCallback, useRef, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { useCatalogo } from '../../../../../../hooks/useCatalogo';
import { useDropdownFlotante } from '../../../../../../hooks/useDropdownFlotante';
import { ordenarPor } from '../../../../../../stores/catalogosStore';
import { ChevronDown, Check, Search } from 'lucide-react';

// "maestros_empresas" viene del catalogosStore: se lee una sola vez por
// sesión y la comparten todas las pantallas. Se excluyen los inactivos y
// los que no tienen nombre (el orderBy('nombre') original los omitía).
const filtrarEmpresasActivas = (datos) => datos
  .filter(emp => emp.nombre && emp.estado !== 'INACTIVO')
  .sort(ordenarPor('nombre'));

// Teclas imprimibles que, con el campo cerrado y enfocado, abren el listado
// y comienzan la búsqueda con ese carácter.
const esTeclaImprimible = (e) => e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;

const EmpresaSelect = ({ value, onChange, placeholder = "Seleccionar empresa...", disabled = false }) => {
  const { datos: empresasCatalogo } = useCatalogo('empresas');
  const empresas = useMemo(() => filtrarEmpresasActivas(empresasCatalogo), [empresasCatalogo]);
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const triggerRef = useRef(null);
  const listaRef = useRef(null);
  const listboxId = useId();
  const cerrar = useCallback(() => setAbierto(false), []);
  // El panel va en un portal a document.body: el formulario vive dentro de
  // un contenedor con overflow-hidden (animación de colapso) que lo recortaba.
  const { anclaRef, panelRef, estilo } = useDropdownFlotante({ abierto, cerrar, anchoIgual: true });

  const empresasFiltradas = empresas.filter(emp =>
    emp.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    (emp.rut && emp.rut.toLowerCase().includes(busqueda.toLowerCase()))
  );

  const empresaSeleccionada = empresas.find(emp => emp.id === value || emp.nombre === value);

  // Mantiene visible la opción resaltada al moverse con las flechas.
  useEffect(() => {
    if (!abierto) return;
    listaRef.current?.children[activo]?.scrollIntoView({ block: 'nearest' });
  }, [abierto, activo]);

  const abrir = (textoInicial = '') => {
    const indiceSeleccionado = textoInicial ? -1 : empresas.indexOf(empresaSeleccionada);
    setBusqueda(textoInicial);
    setActivo(Math.max(0, indiceSeleccionado));
    setAbierto(true);
  };

  // Cierra y devuelve el foco al campo: el buscador vive en el portal (fuera
  // del formulario), así que sin esto el foco quedaría en <body>.
  const cerrarYEnfocar = () => {
    setAbierto(false);
    setBusqueda('');
    triggerRef.current?.focus();
  };

  const handleSelect = (empresa) => {
    onChange(empresa);
    cerrarYEnfocar();
  };

  const handleTriggerKeyDown = (e) => {
    if (disabled || abierto) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      abrir();
    } else if (esTeclaImprimible(e)) {
      e.preventDefault();
      abrir(e.key);
    }
  };

  const handleBusquedaKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActivo(i => Math.min(i + 1, empresasFiltradas.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActivo(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        // preventDefault también evita que Enter envíe el formulario.
        e.preventDefault();
        if (empresasFiltradas[activo]) handleSelect(empresasFiltradas[activo]);
        break;
      case 'Escape':
        e.preventDefault();
        cerrarYEnfocar();
        break;
      case 'Tab':
        // Sin preventDefault: al devolver el foco al campo antes de la acción
        // por defecto, Tab / Shift+Tab continúan desde Empresa hacia
        // Informe / Fecha según el orden normal del DOM.
        cerrarYEnfocar();
        break;
      default:
    }
  };

  return (
    <div className="relative w-full" ref={anclaRef}>
      <div
        ref={triggerRef}
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={abierto ? listboxId : undefined}
        aria-disabled={disabled || undefined}
        onClick={disabled ? undefined : () => (abierto ? cerrar() : abrir())}
        onKeyDown={handleTriggerKeyDown}
        className={`w-full h-9 md:h-7 px-2 border rounded text-[11px] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 flex items-center justify-between outline-none focus:border-[#2383C2] ${abierto ? 'border-[#2383C2]' : 'border-gray-300 dark:border-gray-600'} ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className={`truncate ${!empresaSeleccionada ? 'text-gray-400' : ''}`}>
          {empresaSeleccionada ? `${empresaSeleccionada.nombre} (${empresaSeleccionada.rut})` : placeholder}
        </span>
        <ChevronDown size={13} className="text-gray-400 shrink-0 ml-1" />
      </div>

      {abierto && createPortal(
        <div
          ref={panelRef}
          style={estilo}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-[1000] flex flex-col overflow-hidden"
        >
          <div className="shrink-0 p-1.5 border-b border-gray-200 dark:border-gray-700 flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900">
            <Search size={12} className="text-gray-400 shrink-0" />
            <input
              type="text"
              autoFocus
              value={busqueda}
              onChange={(e) => { setBusqueda(e.target.value); setActivo(0); }}
              onFocus={(e) => { const fin = e.target.value.length; e.target.setSelectionRange(fin, fin); }}
              onKeyDown={handleBusquedaKeyDown}
              role="searchbox"
              aria-controls={listboxId}
              aria-activedescendant={empresasFiltradas[activo] ? `${listboxId}-${activo}` : undefined}
              placeholder="Buscar por nombre o RUT..."
              className="w-full text-base md:text-[11px] bg-transparent outline-none text-gray-800 dark:text-gray-100 placeholder-gray-400"
            />
          </div>

          <ul id={listboxId} role="listbox" ref={listaRef} className="flex-1 min-h-0 overflow-y-auto text-[11px]">
            {empresasFiltradas.length > 0 ? (
              empresasFiltradas.map((emp, i) => {
                const isSelected = value === emp.id || value === emp.nombre;
                const isActivo = i === activo;
                return (
                  <li
                    key={emp.id}
                    id={`${listboxId}-${i}`}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(emp)}
                    onMouseEnter={() => setActivo(i)}
                    className={`px-2 py-2.5 md:py-1.5 flex items-center justify-between cursor-pointer ${
                      isActivo ? 'bg-gray-100 dark:bg-gray-700/60' : ''
                    } ${
                      isSelected ? 'text-[#2383C2] font-semibold' : 'text-gray-700 dark:text-gray-200'
                    } ${isSelected && !isActivo ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}
                  >
                    <div className="flex flex-col truncate">
                      <span className="truncate">{emp.nombre}</span>
                      <span className="text-[9px] text-gray-400">{emp.rut}</span>
                    </div>
                    {isSelected && <Check size={12} className="text-[#2383C2] shrink-0 ml-1" />}
                  </li>
                );
              })
            ) : (
              <li className="px-2 py-2 text-center text-gray-400 text-[10px]">
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

export default EmpresaSelect;
