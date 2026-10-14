import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Package, Layers, Barcode, FileText, Trash2, RefreshCw, Truck, ListOrdered } from 'lucide-react';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { useToast } from '../../../../context/ToastContext';
import { useModal } from '../../../../context/ModalContext';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { useColumnasPermitidas } from '../../../../hooks/useColumnasPermitidas';
import { RUTAS, stockTotal } from '../../../../../functions/bodega/nucleo.mjs';
import { interpretarLectura } from '../../../../../functions/bodega/gs1.mjs';
import {
  guardarProducto, vincularCodigo, desvincularCodigo, leerCodigosDeProducto, leerLotesDeProducto,
  mensajeError, detalleError
} from '../shared/bodegaApi';
import FormProducto from '../shared/FormProducto';
import KardexProducto from './KardexProducto';
import CampoEscaneoBodega from '../shared/escaneo/CampoEscaneoBodega';
import { formatoCantidad, nombresPorId } from '../shared/catalogosBodega';
import { estadoVencimiento } from '../shared/vencimientos';

const PATH_VISTA = '/bodega/maestroBodega';
// Columnas de la tabla de lotes (permiso granular col_<key> en ficha_lotes).
const COLUMNAS_LOTES = [
  { key: 'lote', label: 'Lote', fija: true },
  { key: 'vencimiento', label: 'Vencimiento' },
  { key: 'disponible', label: 'Disponible', alinear: 'text-right' },
  { key: 'transito', label: 'Tránsito', alinear: 'text-right' },
  { key: 'centros', label: 'En centros' },
];

const PESTANAS = [
  { id: 'stock', label: 'Stock', icon: Layers },
  { id: 'kardex', label: 'Kardex', icon: ListOrdered },
  { id: 'codigos', label: 'Códigos de barra', icon: Barcode },
  { id: 'datos', label: 'Datos', icon: FileText },
];

const Tarjeta = ({ titulo, valor, clase = 'text-gray-800 dark:text-gray-100' }) => (
  <div className="flex flex-col px-2.5 py-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/60">
    <span className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400">{titulo}</span>
    <span className={`text-[16px] font-bold font-num ${clase}`}>{valor}</span>
  </div>
);

// --- Pestaña Stock: totales, tránsito por centro y lotes ---
const PestanaStock = ({ producto, nombreCentro }) => {
  const [lotes, setLotes] = useState(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const { columnasVisibles, ver } = useColumnasPermitidas(PATH_VISTA, 'ficha_lotes', COLUMNAS_LOTES);

  useEffect(() => {
    let vigente = true;
    leerLotesDeProducto(producto.id)
      .then((l) => { if (vigente) { setLotes(l); setError(''); } })
      .catch((e) => { if (vigente) { setError(mensajeError(e, 'No se pudieron leer los lotes.')); setLotes([]); } });
    return () => { vigente = false; };
  }, [producto.id, version]);
  const recargar = () => { setLotes(null); setVersion((v) => v + 1); };

  const porCentro = Object.entries(producto.transitoPorCentro || {})
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => nombreCentro(a).localeCompare(nombreCentro(b), 'es'));
  const lotesConStock = (lotes || []).filter((l) => (l.disponible || 0) > 0 || (l.transito || 0) > 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Tarjeta titulo="Disponible B. General" valor={formatoCantidad(producto.disponible)} clase="text-emerald-600 dark:text-emerald-400" />
        <Tarjeta titulo="En tránsito" valor={formatoCantidad(producto.transito)} clase="text-amber-600 dark:text-amber-400" />
        <Tarjeta titulo="Total" valor={formatoCantidad(stockTotal(producto))} />
        <Tarjeta titulo="Mínimo" valor={producto.stockMinimo ?? '—'} />
      </div>

      <section>
        <h4 className="text-[11px] font-bold uppercase text-gray-600 dark:text-gray-300 mb-1 flex items-center gap-1"><Truck size={12} /> Tránsito por centro</h4>
        {porCentro.length === 0 ? (
          <p className="text-[11px] text-gray-400 italic">Sin unidades en tránsito.</p>
        ) : (
          <table className="w-full text-[11px] border border-gray-200 dark:border-gray-700">
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {porCentro.map(([centroId, n]) => (
                <tr key={centroId}>
                  <td className="px-2 py-1">{nombreCentro(centroId)}</td>
                  <td className="px-2 py-1 text-right font-bold font-num text-amber-600 dark:text-amber-400">{formatoCantidad(n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-[11px] font-bold uppercase text-gray-600 dark:text-gray-300 flex items-center gap-1"><Layers size={12} /> Lotes con stock</h4>
          <button type="button" onClick={recargar} title="Actualizar lotes" className="p-1 rounded text-gray-500 hover:text-[#2383C2] hover:bg-gray-100 dark:hover:bg-gray-700"><RefreshCw size={12} /></button>
        </div>
        {error && <p className="text-[11px] text-red-600">{error}</p>}
        {lotes === null ? (
          <p className="text-[11px] text-gray-400 italic">Cargando lotes…</p>
        ) : lotesConStock.length === 0 ? (
          <p className="text-[11px] text-gray-400 italic">Sin lotes con stock.</p>
        ) : (
          <table className="w-full text-[11px] border border-gray-200 dark:border-gray-700">
            <thead className="bg-gray-100 dark:bg-gray-900 text-[10px] uppercase text-gray-600 dark:text-gray-400">
              <tr>
                {columnasVisibles.map((c) => <th key={c.key} className={`px-2 py-1 ${c.alinear || 'text-left'}`}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {lotesConStock.map((l) => {
                const venc = estadoVencimiento(l.vencimiento);
                return (
                  <tr key={l.id} className={venc.fila}>
                    <td className="px-2 py-1 font-num">{l.lote || 'S/L'}</td>
                    {ver('vencimiento') && (
                      <td className="px-2 py-1 font-num">
                        {l.vencimiento || '—'} {venc.etiqueta && <span className={`ml-1 px-1 rounded text-[9px] font-bold ${venc.badge}`}>{venc.etiqueta}</span>}
                      </td>
                    )}
                    {ver('disponible') && <td className="px-2 py-1 text-right font-num font-bold text-emerald-600 dark:text-emerald-400">{formatoCantidad(l.disponible)}</td>}
                    {ver('transito') && <td className="px-2 py-1 text-right font-num text-amber-600 dark:text-amber-400">{formatoCantidad(l.transito)}</td>}
                    {ver('centros') && (
                      <td className="px-2 py-1 text-[10px] text-gray-600 dark:text-gray-300">
                        {Object.entries(l.transitoPorCentro || {}).map(([c, n]) => `${nombreCentro(c)}: ${n}`).join(' · ') || '—'}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
};

// --- Pestaña Códigos: lista, escanear para agregar, quitar ---
const PestanaCodigos = ({ producto }) => {
  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { hasPermission } = useGranularPermission();
  const puedeVincular = hasPermission(RUTAS.maestro, 'codigos', 'btn_vincular') && producto.activo !== false;
  const puedeQuitar = hasPermission(RUTAS.maestro, 'codigos', 'btn_desvincular');
  const [codigos, setCodigos] = useState(null);
  const [senal, setSenal] = useState({ tipo: null, mensaje: '' });
  const [ocupado, setOcupado] = useState(false);
  const campoRef = useRef(null);

  const cargar = useCallback(() => {
    leerCodigosDeProducto(producto.id).then(setCodigos).catch((e) => { showToast(mensajeError(e), 'error'); setCodigos([]); });
  }, [producto.id, showToast]);
  useEffect(() => { cargar(); }, [cargar]);

  const vincular = async (codigoLeido, reasignar = false) => {
    setOcupado(true);
    try {
      const r = await vincularCodigo({ productoId: producto.id, codigoLeido, reasignar });
      setSenal(r.yaVinculado ? { tipo: 'aviso', mensaje: 'Ese código ya estaba vinculado a este producto.' } : { tipo: 'ok', mensaje: `Código ${r.clave} vinculado.` });
      cargar();
    } catch (error) {
      const detalle = detalleError(error);
      if (detalle?.motivo === 'vinculado-a-otro' && puedeQuitar && !reasignar) {
        confirmAction('Código vinculado a otro producto', `${mensajeError(error)} ¿Reasignarlo a este producto?`, () => vincular(codigoLeido, true), { type: 'warning', confirmText: 'Reasignar' });
      }
      setSenal({ tipo: 'error', mensaje: mensajeError(error) });
    } finally {
      setOcupado(false);
      campoRef.current?.focus();
    }
  };

  const onLectura = (texto) => {
    const lectura = interpretarLectura(texto);
    if (!lectura) return;
    if (lectura.soloDatosLote) {
      setSenal({ tipo: 'aviso', mensaje: 'Ese código solo trae lote/vencimiento: no identifica el producto.' });
      return;
    }
    vincular(lectura.codigo);
  };

  const quitar = (c) => confirmAction('Quitar código', `¿Quitar el código ${c.codigoLeido || c.clave} de este producto?`, async () => {
    try {
      await desvincularCodigo({ productoId: producto.id, clave: c.clave });
      showToast('Código quitado.', 'info');
      cargar();
    } catch (error) {
      showToast(mensajeError(error), 'error');
    }
  }, { type: 'danger', confirmText: 'Quitar' });

  return (
    <div className="flex flex-col gap-2">
      {puedeVincular && (
        <CampoEscaneoBodega ref={campoRef} autoFocus onLectura={onLectura} deshabilitado={ocupado} senal={senal.tipo} mensaje={senal.mensaje}
          placeholder="Escanea un código para vincularlo a este producto" />
      )}
      {codigos === null ? (
        <p className="text-[11px] text-gray-400 italic">Cargando códigos…</p>
      ) : codigos.length === 0 ? (
        <p className="text-[11px] text-gray-400 italic">Sin códigos de barra vinculados.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded">
          {codigos.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-2 py-1.5 text-[11px]">
              <Barcode size={14} className="text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-num font-bold text-gray-800 dark:text-gray-100 break-all">{c.clave}</div>
                {c.codigoLeido && c.codigoLeido !== c.clave && <div className="font-num text-[10px] text-gray-500 break-all">Leído: {c.codigoLeido}</div>}
                <div className="text-[10px] text-gray-400">{c.creadoPor?.nombre || ''}</div>
              </div>
              {puedeQuitar && (
                <button type="button" onClick={() => quitar(c)} title="Quitar código" className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40">
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// --- Pestaña Datos: editar ---
const PestanaDatos = ({ producto }) => {
  const { showToast } = useToast();
  const { hasPermission } = useGranularPermission();
  const [guardando, setGuardando] = useState(false);

  const guardar = async (form) => {
    setGuardando(true);
    try {
      await guardarProducto({ id: producto.id, producto: form });
      showToast('Producto actualizado.', 'success');
    } catch (error) {
      showToast(mensajeError(error), 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <FormProducto
      key={producto.id}
      inicial={producto}
      esNuevo={false}
      onGuardar={guardar}
      guardando={guardando}
      puedeEditar={hasPermission(RUTAS.maestro, 'productos', 'btn_editar')}
      puedeInactivar={hasPermission(RUTAS.maestro, 'productos', 'btn_inactivar')}
    />
  );
};

// Ficha del producto (panel lateral): stock por lote y por centro,
// kardex, códigos de barra vinculados y datos.
const ProductoDrawer = ({ productoId, pestanaInicial = 'stock', onCerrar }) => {
  const { datos: productos } = useCatalogo('bodegaProductos');
  const { datos: catalogos } = useCatalogo('bodegaCatalogos');
  const { datos: centros } = useCatalogo('centros');
  const [pestana, setPestana] = useState(pestanaInicial);
  const producto = productos.find((p) => p.id === productoId);
  const categorias = useMemo(() => nombresPorId(catalogos, 'CATEGORIA'), [catalogos]);
  const unidades = useMemo(() => nombresPorId(catalogos, 'UNIDAD'), [catalogos]);
  const nombresCentros = useMemo(() => Object.fromEntries(centros.map((c) => [c.id, c.nombre])), [centros]);
  const nombreCentro = useCallback((id) => nombresCentros[id] || `Centro ${id}`, [nombresCentros]);

  useEffect(() => {
    const alPresionar = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [onCerrar]);

  if (!producto) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-[2px] flex justify-end">
      <div className="absolute inset-0" onClick={onCerrar} />
      <div className="relative w-full max-w-2xl bg-gray-50 dark:bg-gray-800 h-full shadow-2xl flex flex-col border-l border-gray-200 dark:border-gray-700 z-10 animate-in slide-in-from-right duration-200 text-[12px]">
        <div className="px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <Package className="text-[#2383C2] shrink-0 mt-0.5" size={18} />
            <div className="min-w-0">
              <h3 className="text-[14px] font-bold text-gray-800 dark:text-gray-100 truncate">{producto.nombre}</h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                <span className="font-num font-bold text-[#2383C2]">{producto.codigoMaestro}</span>
                {producto.referencia && <> · Ref. {producto.referencia}</>}
                {' · '}{categorias[producto.categoriaId] || 'Sin categoría'} · {unidades[producto.unidadId] || '—'}
                {producto.ubicacion && <> · Ubic. {producto.ubicacion}</>}
                {producto.activo === false && <span className="ml-1 px-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold">INACTIVO</span>}
              </p>
              {producto.maestroCodigo && (
                <p className="text-[10px] text-gray-500">Maestro clínico: {producto.maestroCodigo.codigo || 'S/C'} · {producto.maestroCodigo.descriptor}</p>
              )}
            </div>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full">
            <X size={18} />
          </button>
        </div>

        <div className="px-4 pt-2 flex gap-1 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          {PESTANAS.map(({ id, label, icon: Icono }) => (
            <button key={id} type="button" onClick={() => setPestana(id)}
              className={`h-8 px-3 -mb-px border-b-2 font-semibold flex items-center gap-1.5 ${pestana === id ? 'border-[#2383C2] text-[#2383C2]' : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}>
              <Icono size={13} /> {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-4">
          {pestana === 'stock' && <PestanaStock producto={producto} nombreCentro={nombreCentro} />}
          {pestana === 'kardex' && <KardexProducto producto={producto} />}
          {pestana === 'codigos' && <PestanaCodigos producto={producto} />}
          {pestana === 'datos' && <PestanaDatos producto={producto} />}
        </div>
      </div>
    </div>
  );
};

export default ProductoDrawer;
