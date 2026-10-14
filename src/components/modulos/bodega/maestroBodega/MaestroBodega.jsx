import { Fragment, useMemo, useRef, useState } from 'react';
import { Boxes, RefreshCw, PackagePlus, Info, ChevronDown, ChevronRight, AlertCircle, X } from 'lucide-react';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { useToast } from '../../../../context/ToastContext';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { useColumnasPermitidas } from '../../../../hooks/useColumnasPermitidas';
import Spinner from '../../../ui/Spinner';
import BuscadorConLimpiar from '../../../ui/BuscadorConLimpiar';
import { stockTotal, bajoMinimo } from '../../../../../functions/bodega/nucleo.mjs';
import { filtrarProductos } from './filtrarProductos';
import { formatoCantidad, nombresPorId, opcionesCatalogo } from '../shared/catalogosBodega';
import { identificarLectura } from '../shared/escaneo/identificarLectura';
import { guardarProducto, mensajeError } from '../shared/bodegaApi';
import FormProducto from '../shared/FormProducto';
import { PRODUCTO_VACIO } from '../shared/productoFormulario';
import ModalVincularCodigo from '../shared/ModalVincularCodigo';
import ProductoDrawer from './ProductoDrawer';

// Literal (no RUTAS.maestro) para que coberturaPermisos.test.js la verifique.
const PATH_VISTA = '/bodega/maestroBodega';
const TH = 'py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700';
const TD = 'py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70';
// Columnas del listado (permiso granular col_<key> en la sección listado).
const COLUMNAS = [
  { key: 'codigo', label: 'Código' },
  { key: 'producto', label: 'Producto', fija: true },
  { key: 'categoria', label: 'Categoría' },
  { key: 'unidad', label: 'Unidad' },
  { key: 'ubicacion', label: 'Ubicación' },
  { key: 'loteVencimiento', label: 'Lote / Venc.', alinear: 'text-center' },
  { key: 'disponible', label: 'Disponible B.G.', alinear: 'text-right' },
  { key: 'transito', label: 'En tránsito', alinear: 'text-right' },
  { key: 'total', label: 'Total', alinear: 'text-right' },
  { key: 'minimo', label: 'Mínimo', alinear: 'text-right' },
  { key: 'ficha', label: 'Ficha', alinear: 'text-center', fija: true },
];
const SELECT = 'h-7 px-1.5 border border-gray-300 dark:border-gray-600 rounded text-[11px] outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100';

// Modal simple para crear un producto desde el Maestro.
const ModalNuevoProducto = ({ onCerrar, onCreado }) => {
  const { showToast } = useToast();
  const [guardando, setGuardando] = useState(false);
  const crear = async (form) => {
    setGuardando(true);
    try {
      const r = await guardarProducto({ producto: form });
      showToast(`Producto ${r.producto.codigoMaestro} creado.`, 'success');
      onCreado(r.id);
    } catch (error) {
      showToast(mensajeError(error), 'error');
    } finally {
      setGuardando(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Nuevo producto">
      <div className="w-full max-w-2xl max-h-[92vh] overflow-auto bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-[13px] font-bold text-gray-800 dark:text-gray-100 flex items-center gap-1.5"><PackagePlus size={16} className="text-[#2383C2]" /> Nuevo producto</h3>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700"><X size={16} /></button>
        </div>
        <div className="p-4">
          <FormProducto esNuevo inicial={PRODUCTO_VACIO} guardando={guardando} onGuardar={crear} onCancelar={onCerrar} />
        </div>
      </div>
    </div>
  );
};

// Maestro de productos de Bodega: listado con stock (disponible en la
// Bodega General, en tránsito y su desglose por centro), buscador que
// también acepta la pistola (Enter busca el código de barra), filtros y la
// ficha de cada producto. Lecturas: la copia del catalogosStore (una
// lectura por sesión; "Actualizar" vuelve a leer).
const MaestroBodega = () => {
  const { hasPermission } = useGranularPermission();
  const { showToast } = useToast();
  const { columnasVisibles } = useColumnasPermitidas(PATH_VISTA, 'listado', COLUMNAS);
  const { datos: productos, cargando, error, refrescar } = useCatalogo('bodegaProductos');
  const { datos: catalogos, refrescar: refrescarCatalogos } = useCatalogo('bodegaCatalogos');
  const { datos: centros } = useCatalogo('centros');
  const [texto, setTexto] = useState('');
  const [filtros, setFiltros] = useState({ categoriaId: '', estado: 'activos', conStock: false, soloBajoMinimo: false });
  const [expandidos, setExpandidos] = useState(() => new Set());
  const [abierto, setAbierto] = useState(null); // { id, pestana }
  const [lecturaSinVincular, setLecturaSinVincular] = useState(null);
  const [creando, setCreando] = useState(false);
  const buscandoRef = useRef(false);

  const categorias = useMemo(() => nombresPorId(catalogos, 'CATEGORIA'), [catalogos]);
  const unidades = useMemo(() => nombresPorId(catalogos, 'UNIDAD'), [catalogos]);
  const nombresCentros = useMemo(() => Object.fromEntries(centros.map((c) => [c.id, c.nombre])), [centros]);
  const filtrados = useMemo(
    () => filtrarProductos(productos, { texto, ...filtros }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [productos, texto, filtros]
  );
  const totales = useMemo(() => filtrados.reduce((acc, p) => ({
    disponible: acc.disponible + (p.disponible || 0), transito: acc.transito + (p.transito || 0)
  }), { disponible: 0, transito: 0 }), [filtrados]);

  const cambiarFiltro = (campo) => (e) => {
    const valor = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setFiltros((f) => ({ ...f, [campo]: valor }));
  };
  const alternar = (id) => setExpandidos((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  // Enter en el buscador (pistola o a mano): un solo resultado -> abre su
  // ficha; si no, busca el texto como código de barra; si no está
  // vinculado y nada coincide, ofrece vincularlo.
  const alPresionarEnter = async (e) => {
    if (e.key !== 'Enter' || buscandoRef.current) return;
    const valor = e.target.value ?? '';
    if (!valor.trim()) return;
    e.preventDefault();
    if (filtrados.length === 1) { setAbierto({ id: filtrados[0].id, pestana: 'stock' }); return; }
    buscandoRef.current = true;
    try {
      const r = await identificarLectura(valor);
      if (r?.tipo === 'producto') {
        setTexto('');
        setAbierto({ id: r.producto.id, pestana: 'stock' });
      } else if (r?.tipo === 'datosLote') {
        showToast('Ese código solo trae lote/vencimiento: escanea el código del producto.', 'info');
      } else if (r?.tipo === 'sinVincular' && filtrados.length === 0) {
        setTexto('');
        setLecturaSinVincular(r.lectura);
      }
    } catch (err) {
      showToast(mensajeError(err), 'error');
    } finally {
      buscandoRef.current = false;
    }
  };

  const actualizar = () => { refrescar(); refrescarCatalogos(); };

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden relative text-[11px]">
      {cargando && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-gray-500/20 dark:bg-black/40 backdrop-blur-[2px]">
          <div className="bg-white/90 dark:bg-gray-800/90 p-4 rounded-xl shadow-xl flex flex-col items-center gap-3">
            <Spinner size="md" color="#2383C2" />
            <h3 className="text-[#2383C2] font-bold text-[13px]">Cargando productos...</h3>
          </div>
        </div>
      )}

      {/* Encabezado */}
      <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="text-[12px] font-bold text-gray-700 dark:text-gray-100 flex items-center gap-1.5 uppercase">
          <Boxes size={14} className="text-[#2383C2]" />
          Maestro de productos · Bodega General
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 dark:text-gray-400 font-bold bg-gray-100 dark:bg-gray-700/60 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-600">
            {filtrados.length} de {productos.length} producto(s)
          </span>
          {hasPermission(PATH_VISTA, 'listado', 'btn_actualizar') && (
            <button type="button" onClick={actualizar} title="Volver a leer productos y stock" className="h-7 px-2 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:text-[#2383C2] flex items-center gap-1 font-semibold">
              <RefreshCw size={12} /> Actualizar
            </button>
          )}
          {hasPermission(PATH_VISTA, 'productos', 'btn_crear') && (
            <button type="button" onClick={() => setCreando(true)} className="h-7 px-2.5 rounded bg-[#2383C2] hover:bg-blue-600 text-white flex items-center gap-1 font-bold">
              <PackagePlus size={13} /> Nuevo producto
            </button>
          )}
        </div>
      </div>

      {/* Buscador y filtros */}
      <div className="px-3 py-1.5 flex flex-wrap items-center gap-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-800/20">
        <div onKeyDown={alPresionarEnter}>
          <BuscadorConLimpiar value={texto} onChange={setTexto} className="w-72" placeholder="Buscar o escanear: nombre, código, referencia, ubicación…" />
        </div>
        <select value={filtros.categoriaId} onChange={cambiarFiltro('categoriaId')} className={SELECT} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {opcionesCatalogo(catalogos, 'CATEGORIA').map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select value={filtros.estado} onChange={cambiarFiltro('estado')} className={SELECT} aria-label="Estado">
          <option value="activos">Activos</option>
          <option value="inactivos">Inactivos</option>
          <option value="todos">Todos</option>
        </select>
        <label className="flex items-center gap-1 font-semibold text-gray-600 dark:text-gray-300">
          <input type="checkbox" checked={filtros.conStock} onChange={cambiarFiltro('conStock')} /> Con stock
        </label>
        <label className="flex items-center gap-1 font-semibold text-gray-600 dark:text-gray-300">
          <input type="checkbox" checked={filtros.soloBajoMinimo} onChange={cambiarFiltro('soloBajoMinimo')} /> Bajo mínimo
        </label>
        <div className="ml-auto flex items-center gap-3 font-medium text-gray-600 dark:text-gray-300">
          <span>Disponible: <strong className="text-emerald-600 dark:text-emerald-400 font-num">{formatoCantidad(totales.disponible)}</strong></span>
          <span>En tránsito: <strong className="text-amber-600 dark:text-amber-400 font-num">{formatoCantidad(totales.transito)}</strong></span>
        </div>
      </div>

      {/* Tabla */}
      <div className="flex-grow overflow-auto">
        {error ? (
          <div className="p-8 text-center text-red-600 flex flex-col items-center gap-1"><AlertCircle size={20} /> No se pudieron leer los productos: {mensajeError(error)}</div>
        ) : !cargando && filtrados.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400 italic flex flex-col items-center gap-1">
            <AlertCircle size={20} className="text-gray-400 mb-1" />
            {productos.length === 0 ? 'Aún no hay productos en Bodega.' : 'Ningún producto coincide con la búsqueda o los filtros.'}
          </div>
        ) : (
          <table className="w-full text-left text-[11px] border-collapse">
            <thead className="bg-gray-100 dark:bg-gray-900 sticky top-0 z-10">
              <tr className="text-gray-600 dark:text-gray-400 uppercase font-bold text-[10px]">
                {columnasVisibles.map((col) => <th key={col.key} className={`${TH} ${col.alinear || ''}`}>{col.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => {
                const centrosConTransito = Object.entries(p.transitoPorCentro || {}).filter(([, n]) => n > 0);
                const expandido = expandidos.has(p.id);
                const alerta = bajoMinimo(p);
                const celdas = {
                  codigo: <td className={`${TD} font-num font-bold text-[#2383C2] dark:text-sky-400 whitespace-nowrap`}>{p.codigoMaestro}</td>,
                  producto: (
                    <td className={`${TD} text-gray-800 dark:text-gray-100`}>
                      <button type="button" onClick={() => setAbierto({ id: p.id, pestana: 'stock' })} className="text-left font-semibold hover:text-[#2383C2] hover:underline">{p.nombre}</button>
                      {p.referencia && <div className="text-[10px] text-gray-500">Ref. {p.referencia}</div>}
                      {p.activo === false && <span className="text-[9px] font-bold px-1 rounded bg-gray-200 dark:bg-gray-700">INACTIVO</span>}
                    </td>
                  ),
                  categoria: <td className={TD}>{categorias[p.categoriaId] || '—'}</td>,
                  unidad: <td className={TD}>{unidades[p.unidadId] || '—'}</td>,
                  ubicacion: <td className={TD}>{p.ubicacion || '—'}</td>,
                  loteVencimiento: <td className={`${TD} text-center text-[10px]`}>{p.manejaLote ? 'Lote' : '—'} / {p.manejaVencimiento ? 'Venc.' : '—'}</td>,
                  disponible: <td className={`${TD} text-right font-num font-bold text-emerald-600 dark:text-emerald-400`}>{formatoCantidad(p.disponible)}</td>,
                  transito: (
                    <td className={`${TD} text-right font-num`}>
                      {centrosConTransito.length > 0 ? (
                        <button type="button" onClick={() => alternar(p.id)} title="Ver desglose por centro" className="inline-flex items-center gap-0.5 font-bold text-amber-600 dark:text-amber-400 hover:underline">
                          {expandido ? <ChevronDown size={11} /> : <ChevronRight size={11} />} {formatoCantidad(p.transito)}
                        </button>
                      ) : <span className="text-gray-400">0</span>}
                    </td>
                  ),
                  total: <td className={`${TD} text-right font-num font-bold`}>{formatoCantidad(stockTotal(p))}</td>,
                  minimo: <td className={`${TD} text-right font-num ${alerta ? 'text-red-600 font-bold' : ''}`} title={alerta ? 'Disponible bajo el mínimo' : ''}>{p.stockMinimo ?? '—'}</td>,
                  ficha: (
                    <td className={`${TD} text-center`}>
                      <button type="button" onClick={() => setAbierto({ id: p.id, pestana: 'stock' })} title="Ver ficha del producto" className="p-1 text-gray-500 hover:text-[#2383C2] hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
                        <Info size={14} />
                      </button>
                    </td>
                  ),
                };
                return (
                  <Fragment key={p.id}>
                    <tr className={`hover:bg-gray-100/80 dark:hover:bg-gray-700/50 ${p.activo === false ? 'opacity-60' : ''}`}>
                      {columnasVisibles.map((col) => <Fragment key={col.key}>{celdas[col.key]}</Fragment>)}
                    </tr>
                    {expandido && (
                      <tr className="bg-amber-50/50 dark:bg-amber-950/10">
                        <td colSpan={columnasVisibles.length} className="py-1 px-2 border-b border-gray-200 dark:border-gray-700/70">
                          <div className="ml-auto max-w-sm">
                            <div className="text-[10px] font-bold uppercase text-gray-500 mb-0.5">En tránsito por centro</div>
                            {centrosConTransito
                              .sort(([a], [b]) => (nombresCentros[a] || a).localeCompare(nombresCentros[b] || b, 'es'))
                              .map(([centroId, n]) => (
                                <div key={centroId} className="flex justify-between gap-3 text-[10.5px]">
                                  <span>{nombresCentros[centroId] || `Centro ${centroId}`}</span>
                                  <span className="font-num font-bold text-amber-600 dark:text-amber-400">{formatoCantidad(n)}</span>
                                </div>
                              ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {abierto && <ProductoDrawer key={abierto.id} productoId={abierto.id} pestanaInicial={abierto.pestana} onCerrar={() => setAbierto(null)} />}
      {creando && <ModalNuevoProducto onCerrar={() => setCreando(false)} onCreado={(id) => { setCreando(false); setAbierto({ id, pestana: 'codigos' }); }} />}
      {lecturaSinVincular && (
        <ModalVincularCodigo
          lectura={lecturaSinVincular}
          onCerrar={() => setLecturaSinVincular(null)}
          onVinculado={(p) => { setLecturaSinVincular(null); setAbierto({ id: p.id, pestana: 'codigos' }); }}
        />
      )}
    </div>
  );
};

export default MaestroBodega;
