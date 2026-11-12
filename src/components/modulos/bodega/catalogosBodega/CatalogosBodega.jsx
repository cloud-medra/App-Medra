import { useMemo, useState } from 'react';
import { Tags, Plus, Pencil, Check, X, RefreshCw } from 'lucide-react';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { useToast } from '../../../../context/ToastContext';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { TIPOS_CATALOGO, MAX } from '../../../../../functions/bodega/nucleo.mjs';
import { guardarCatalogo, mensajeError } from '../shared/bodegaApi';

const PATH_VISTA = '/bodega/catalogosBodega';
const INPUT = 'h-8 px-2 border border-gray-300 dark:border-gray-600 rounded text-normal outline-none bg-white dark:bg-gray-900 text-tinta-principal focus:border-[#2383C2]';

// Una lista (categorías o unidades): agregar, renombrar, activar/inactivar.
// No se borran: un producto puede seguir usando una inactiva.
const ListaCatalogo = ({ tipo, items, usos, puedeGuardar }) => {
  const { showToast } = useToast();
  const [nuevo, setNuevo] = useState('');
  const [editando, setEditando] = useState(null); // { id, nombre }
  const [ocupado, setOcupado] = useState(false);
  const def = TIPOS_CATALOGO[tipo];

  const guardar = async (datos, alTerminar) => {
    setOcupado(true);
    try {
      await guardarCatalogo({ tipo, ...datos });
      alTerminar?.();
    } catch (error) {
      showToast(mensajeError(error), 'error');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="flex-1 min-w-[280px] border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden flex flex-col">
      <h3 className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-etiqueta uppercase text-tinta-principal">
        {def.plural} <span className="text-secundario text-tinta-atenuada">({items.length})</span>
      </h3>
      {puedeGuardar && (
        <form className="p-2 flex gap-1.5 border-b border-gray-200 dark:border-gray-700" onSubmit={(e) => { e.preventDefault(); if (nuevo.trim()) guardar({ nombre: nuevo }, () => setNuevo('')); }}>
          <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} maxLength={MAX.catalogo} placeholder={`Nueva ${def.etiqueta.toLowerCase()}`} className={`${INPUT} flex-1`} disabled={ocupado} />
          <button type="submit" disabled={ocupado || !nuevo.trim()} className="h-8 px-3 rounded bg-[#2383C2] text-white text-etiqueta flex items-center gap-1 disabled:opacity-50"><Plus size={13} /> Agregar</button>
        </form>
      )}
      <ul className="divide-y divide-gray-100 dark:divide-gray-700 overflow-auto">
        {items.map((c) => (
          <li key={c.id} className={`px-3 py-1.5 flex items-center gap-2 text-normal ${c.activo === false ? 'opacity-60' : ''}`}>
            {editando?.id === c.id ? (
              <form className="flex-1 flex gap-1" onSubmit={(e) => { e.preventDefault(); guardar({ id: c.id, nombre: editando.nombre, activo: c.activo !== false }, () => setEditando(null)); }}>
                <input value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} maxLength={MAX.catalogo} autoFocus className={`${INPUT} flex-1`} disabled={ocupado} />
                <button type="submit" disabled={ocupado} title="Guardar" className="p-1.5 rounded text-emerald-600 hover:bg-emerald-50"><Check size={14} /></button>
                <button type="button" onClick={() => setEditando(null)} title="Cancelar" className="p-1.5 rounded text-tinta-secundaria hover:bg-gray-100"><X size={14} /></button>
              </form>
            ) : (
              <>
                <span className="flex-1 text-etiqueta text-tinta-principal">{c.nombre}</span>
                <span className="text-pequeno text-tinta-secundaria" title="Productos que la usan">{usos[c.id] || 0} prod.</span>
                {c.activo === false && <span className="text-pequeno px-1 rounded bg-gray-200 dark:bg-gray-700">INACTIVA</span>}
                {puedeGuardar && (
                  <>
                    <button type="button" onClick={() => setEditando({ id: c.id, nombre: c.nombre })} title="Renombrar" className="p-1.5 rounded text-tinta-secundaria hover:text-[#2383C2] hover:bg-gray-100 dark:hover:bg-gray-700"><Pencil size={13} /></button>
                    <button type="button" disabled={ocupado} onClick={() => guardar({ id: c.id, nombre: c.nombre, activo: c.activo === false })}
                      className="h-7 px-2 rounded border border-gray-300 dark:border-gray-600 text-etiqueta text-tinta-secundaria hover:border-[#2383C2]">
                      {c.activo === false ? 'Activar' : 'Inactivar'}
                    </button>
                  </>
                )}
              </>
            )}
          </li>
        ))}
        {items.length === 0 && <li className="px-3 py-3 text-tinta-atenuada italic text-normal">Sin registros.</li>}
      </ul>
    </section>
  );
};

// Categorías y unidades de medida de los productos de Bodega (permiso
// propio: ítem de menú + acción "Crear, editar, activar o inactivar").
const CatalogosBodega = () => {
  const { hasPermission } = useGranularPermission();
  const { datos: catalogos, refrescar } = useCatalogo('bodegaCatalogos');
  const { datos: productos } = useCatalogo('bodegaProductos');
  const puedeGuardar = hasPermission(PATH_VISTA, 'catalogos', 'btn_guardar');

  const porTipo = useMemo(() => Object.fromEntries(Object.keys(TIPOS_CATALOGO).map((tipo) => [
    tipo, catalogos.filter((c) => c.tipo === tipo).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
  ])), [catalogos]);
  const usos = useMemo(() => productos.reduce((acc, p) => {
    [p.categoriaId, p.unidadId].filter(Boolean).forEach((id) => { acc[id] = (acc[id] || 0) + 1; });
    return acc;
  }, {}), [productos]);

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden text-secundario">
      <div className="px-3 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="text-titulo-seccion text-tinta-principal flex items-center gap-1.5">
          <Tags size={14} className="text-[#2383C2]" /> Categorías y unidades · Bodega
        </h2>
        <button type="button" onClick={refrescar} className="h-7 px-2 rounded border border-gray-300 dark:border-gray-600 text-tinta-secundaria hover:text-[#2383C2] flex items-center gap-1 text-etiqueta">
          <RefreshCw size={12} /> Actualizar
        </button>
      </div>
      <div className="p-3 flex flex-wrap gap-3 overflow-auto">
        {Object.keys(TIPOS_CATALOGO).map((tipo) => (
          <ListaCatalogo key={tipo} tipo={tipo} items={porTipo[tipo]} usos={usos} puedeGuardar={puedeGuardar} />
        ))}
      </div>
    </div>
  );
};

export default CatalogosBodega;
