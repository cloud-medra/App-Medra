import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, X, PackageCheck } from 'lucide-react';
import { useCatalogo } from '../../../../../hooks/useCatalogo';
import { useColumnasPermitidas } from '../../../../../hooks/useColumnasPermitidas';
import CampoEscaneoBodega from '../escaneo/CampoEscaneoBodega';
import { identificarLectura, datosLoteDeLectura } from '../escaneo/identificarLectura';
import ModalVincularCodigo from '../ModalVincularCodigo';
import BuscadorProducto from '../BuscadorProducto';
import { mensajeError } from '../bodegaApi';
import { formatoCantidad } from '../catalogosBodega';
import { estadoVencimiento } from '../vencimientos';
import { formatoPesos } from '../../inventarioBodega/formato';
import { normalizarPrecioUnitario } from '../../../../../../functions/bodega/nucleo.mjs';
import {
  agregarLinea, campoFaltante, campoSugerido, cambiarCantidad, cambiarPrecio, quitarLinea, totalUnidades,
  totalLinea, totalValorLineas, precioSugerido, referenciaProducto,
} from './lineasDocumento';
import { useColumnasCarga } from './columnasCarga';

// Columnas de la tabla de líneas (permiso col_<key> en la sección "lineas"
// de la vista que monta el editor: Ingreso o Carga inicial).
const COLUMNAS = [
  { key: 'codigo', label: 'Código' },
  { key: 'producto', label: 'Producto', fija: true },
  { key: 'lote', label: 'Lote' },
  { key: 'vencimiento', label: 'Vencimiento' },
  { key: 'cantidad', label: 'Cantidad', alinear: 'text-right' },
  { key: 'quitar', label: '', fija: true },
];

const CLAVE_AUTO = 'bodega.autoAgregarEscaneo';
const leerAuto = () => { try { return localStorage.getItem(CLAVE_AUTO) !== 'no'; } catch { return true; } };
const guardarAuto = (v) => { try { localStorage.setItem(CLAVE_AUTO, v ? 'si' : 'no'); } catch { /* sin almacenamiento */ } };

const INPUT = 'h-9 px-2 border border-gray-300 dark:border-gray-600 rounded text-[13px] outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:border-[#2383C2]';

// Editor de líneas por escaneo, común a Ingreso y Carga inicial.
// Flujo: escanear (o buscar) producto -> cantidad -> lote -> vencimiento ->
// Enter agrega la línea y el foco vuelve al campo de escaneo. Si el código
// trae lote/vencimiento (GS1) se autocompletan; un segundo código con solo
// lote/vencimiento completa la línea en curso sin cambiar el producto. Con
// "Agregar al escanear", una lectura completa se agrega sola con cantidad 1
// (escanear 10 cajas iguales = 10 unidades). El mismo producto + lote +
// vencimiento se suma a la línea existente.
//
// `conPrecio` (solo Carga inicial): muestra la referencia del producto en vez
// del código maestro, agrega precio unitario (precargado desde el maestro
// clínico, editable), total por línea y total general; al tomar un producto
// el foco va a Cantidad con el valor seleccionado, y Enter pasa al siguiente
// campo (Precio, Lote, Vencimiento) hasta el último, que agrega la línea.
const EditorLineasStock = ({ rutaVista, lineas, onCambiar, deshabilitado = false, conPrecio = false }) => {
  const { datos: productos } = useCatalogo('bodegaProductos');
  const porId = useMemo(() => Object.fromEntries(productos.map((p) => [p.id, p])), [productos]);
  const columnasGenerales = useColumnasPermitidas(rutaVista, 'lineas', COLUMNAS);
  const columnasCarga = useColumnasCarga();
  const { columnasVisibles, ver } = conPrecio ? columnasCarga : columnasGenerales;
  const [pendiente, setPendiente] = useState(null); // { producto, cantidad, lote, vencimiento, codigoLeido }
  const [senal, setSenal] = useState({ tipo: null, mensaje: '' });
  const [lecturaSinVincular, setLecturaSinVincular] = useState(null);
  const [auto, setAuto] = useState(leerAuto);
  const escanerRef = useRef(null);
  const cantidadRef = useRef(null);
  const precioRef = useRef(null);
  const loteRef = useRef(null);
  const vencimientoRef = useRef(null);

  const refDe = (campo) => ({ cantidad: cantidadRef, precio: precioRef, lote: loteRef, vencimiento: vencimientoRef }[campo] || escanerRef);
  // El foco se mueve en un efecto, después de que React pinta el panel del
  // producto (con setTimeout el campo a veces aún no existía y el foco se
  // quedaba en el escáner). `seleccionar` deja el contenido seleccionado
  // para escribir encima (Carga inicial).
  const [foco, setFoco] = useState(null); // { campo, seleccionar, n }
  useEffect(() => {
    if (!foco) return;
    const destino = refDe(foco.campo).current;
    destino?.focus();
    if (foco.seleccionar && destino?.type !== 'date') destino?.select?.();
  }, [foco]);
  const enfocar = (campo, seleccionar = false) => setFoco((f) => ({ campo, seleccionar, n: (f?.n || 0) + 1 }));

  const agregar = (p) => {
    const r = agregarLinea(lineas, { ...p, productoId: p.producto.id });
    onCambiar(r.lineas);
    setPendiente(null);
    const lote = r.linea.lote ? ` lote ${r.linea.lote}` : '';
    setSenal({ tipo: 'ok', mensaje: r.sumada ? `+${p.cantidad} ${p.producto.nombre}${lote}: se sumó a la línea existente (total ${r.linea.cantidad}).` : `Agregado: ${p.cantidad} ${p.producto.nombre}${lote}.` });
    enfocar(null);
  };

  // Deja el producto en curso; si está completo y "Agregar al escanear"
  // está activo, lo agrega; si no, enfoca el primer dato que falta.
  const tomarProducto = (producto, lectura) => {
    if (producto.activo === false) {
      setSenal({ tipo: 'error', mensaje: `${producto.nombre} está inactivo.` });
      return;
    }
    const nuevo = {
      producto, cantidad: 1, ...datosLoteDeLectura(lectura), codigoLeido: lectura?.codigo || '',
      ...(conPrecio ? { precioUnitario: precioSugerido(producto) } : {}),
    };
    if (pendiente && pendiente.producto.id !== producto.id) {
      setSenal({ tipo: 'aviso', mensaje: `Se descartó ${pendiente.producto.nombre} (no se agregó).` });
    }
    const falta = campoFaltante(nuevo);
    const sugerido = campoSugerido(nuevo);
    if (!falta && !sugerido && auto) { agregar(nuevo); return; }
    setPendiente(nuevo);
    const indicacion = falta ? `ingresa ${falta}` : sugerido ? `ingresa ${sugerido} (opcional) y presiona Enter` : 'presiona Enter para agregar';
    if (!pendiente || pendiente.producto.id === producto.id) setSenal({ tipo: 'ok', mensaje: `${producto.nombre}: ${indicacion}.` });
    if (conPrecio) enfocar('cantidad', true);
    else enfocar(falta || sugerido || 'cantidad');
  };

  const onLectura = async (texto) => {
    try {
      const r = await identificarLectura(texto);
      if (!r) return;
      if (r.tipo === 'datosLote') {
        if (!pendiente) { setSenal({ tipo: 'aviso', mensaje: 'Ese código solo trae lote/vencimiento: escanea primero el producto.' }); return; }
        const datos = datosLoteDeLectura(r.lectura);
        const completado = {
          ...pendiente,
          lote: datos.lote || pendiente.lote,
          vencimiento: datos.vencimiento || pendiente.vencimiento,
        };
        const falta = campoFaltante(completado);
        const sugerido = campoSugerido(completado);
        if (!falta && !sugerido && auto) { agregar(completado); return; }
        setPendiente(completado);
        setSenal({ tipo: 'ok', mensaje: `Lote/vencimiento completados para ${pendiente.producto.nombre}.` });
        enfocar(falta || sugerido || 'cantidad');
        return;
      }
      if (r.tipo === 'sinVincular') { setLecturaSinVincular(r.lectura); return; }
      tomarProducto(r.producto, r.lectura);
    } catch (error) {
      setSenal({ tipo: 'error', mensaje: mensajeError(error) });
    }
  };

  const confirmarPendiente = () => {
    const falta = campoFaltante(pendiente);
    if (falta) { setSenal({ tipo: 'error', mensaje: `Falta ${falta}.` }); enfocar(falta); return; }
    if (conPrecio && normalizarPrecioUnitario(pendiente.precioUnitario).error) {
      setSenal({ tipo: 'error', mensaje: 'El precio unitario debe ser un número mayor o igual a cero.' });
      enfocar('precio', true);
      return;
    }
    agregar({ ...pendiente, cantidad: Number(pendiente.cantidad) });
  };
  // Campos del producto en curso, en orden (Carga inicial).
  const camposPendiente = () => [
    'cantidad', 'precio',
    ...(pendiente?.producto.manejaLote ? ['lote'] : []),
    ...(pendiente?.producto.manejaVencimiento ? ['vencimiento'] : []),
  ];
  // Enter: en Carga inicial pasa al siguiente campo y el último agrega la
  // línea; en Ingreso e Inventario agrega la línea desde cualquier campo.
  // El campo sale de data-campo del input.
  const alPresionarEnter = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (conPrecio) {
      const campos = camposPendiente();
      const i = campos.indexOf(e.currentTarget.dataset.campo);
      if (i >= 0 && i < campos.length - 1) { enfocar(campos[i + 1], true); return; }
    }
    confirmarPendiente();
  };
  const cambiar = (campo) => (e) => setPendiente((p) => ({ ...p, [campo]: e.target.value }));

  const total = totalUnidades(lineas);

  return (
    <div className="flex flex-col gap-2 text-[12px]">
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-2 items-start">
        <CampoEscaneoBodega ref={escanerRef} autoFocus onLectura={onLectura} deshabilitado={deshabilitado} senal={senal.tipo} mensaje={senal.mensaje} />
        <div className="flex flex-col gap-1">
          <BuscadorProducto deshabilitado={deshabilitado} onElegir={(p) => tomarProducto(p, null)} />
          <label className="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-300 font-semibold" title="Si el código trae todo lo necesario, se agrega con cantidad 1 sin presionar nada más">
            <input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); guardarAuto(e.target.checked); }} /> Agregar al escanear (cantidad 1)
          </label>
        </div>
      </div>

      {pendiente && (
        <div className="flex flex-wrap items-end gap-2 p-2 rounded-lg border-2 border-[#2383C2]/50 bg-blue-50/50 dark:bg-sky-950/20">
          <div className="flex-1 min-w-[180px]">
            <span className="block text-[10px] font-bold uppercase text-gray-500">Producto</span>
            <span className="font-bold text-gray-800 dark:text-gray-100">{pendiente.producto.nombre}</span>
            <span className="ml-1 font-num text-[11px] text-gray-500">
              {conPrecio ? (referenciaProducto(pendiente.producto) ? `Ref. ${referenciaProducto(pendiente.producto)}` : 'Sin referencia') : pendiente.producto.codigoMaestro}
            </span>
          </div>
          <label className="flex flex-col">
            <span className="text-[10px] font-bold uppercase text-gray-500">Cantidad</span>
            <input ref={cantidadRef} type="number" min="1" step="1" inputMode="numeric" value={pendiente.cantidad} onChange={cambiar('cantidad')} data-campo="cantidad" onKeyDown={alPresionarEnter} className={`${INPUT} w-24 font-num`} />
          </label>
          {conPrecio && (
            <label className="flex flex-col">
              <span className="text-[10px] font-bold uppercase text-gray-500">Precio unitario <span className="normal-case font-normal">(opcional)</span></span>
              <input ref={precioRef} type="number" min="0" step="1" inputMode="numeric" value={pendiente.precioUnitario ?? ''} onChange={cambiar('precioUnitario')} data-campo="precio" onKeyDown={alPresionarEnter} className={`${INPUT} w-32 font-num`} aria-label="Precio unitario" />
            </label>
          )}
          {pendiente.producto.manejaLote && (
            <label className="flex flex-col">
              <span className="text-[10px] font-bold uppercase text-gray-500">Lote <span className="normal-case font-normal">(opcional)</span></span>
              <input ref={loteRef} value={pendiente.lote} onChange={cambiar('lote')} data-campo="lote" onKeyDown={alPresionarEnter} maxLength={40} className={`${INPUT} w-36 font-num uppercase`} />
            </label>
          )}
          {pendiente.producto.manejaVencimiento && (
            <label className="flex flex-col">
              <span className="text-[10px] font-bold uppercase text-gray-500">Vencimiento <span className="normal-case font-normal">(opcional)</span></span>
              <input ref={vencimientoRef} type="date" value={pendiente.vencimiento} onChange={cambiar('vencimiento')} data-campo="vencimiento" onKeyDown={alPresionarEnter} className={`${INPUT} w-40 font-num`} />
            </label>
          )}
          <button type="button" onClick={confirmarPendiente} className="h-9 px-3 rounded bg-[#2383C2] text-white font-bold flex items-center gap-1"><Plus size={14} /> Agregar</button>
          <button type="button" onClick={() => { setPendiente(null); enfocar(null); }} title="Descartar" className="h-9 px-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-200"><X size={14} /></button>
        </div>
      )}

      <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto">
        <table className="w-full text-left text-[12px] border-collapse">
          <thead className="bg-gray-100 dark:bg-gray-900 text-[10px] uppercase text-gray-600 dark:text-gray-400">
            <tr>{columnasVisibles.map((c) => <th key={c.key} className={`px-2 py-1.5 ${c.alinear || ''}`}>{c.label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {lineas.length === 0 && (
              <tr><td colSpan={columnasVisibles.length} className="px-2 py-6 text-center text-gray-400 italic">Escanea o busca un producto para agregar líneas.</td></tr>
            )}
            {lineas.map((l) => {
              const p = porId[l.productoId];
              const venc = estadoVencimiento(l.vencimiento);
              return (
                <tr key={l.key} className={venc.fila}>
                  {ver('codigo') && <td className="px-2 py-1 font-num text-[#2383C2]">{p?.codigoMaestro || '—'}</td>}
                  {ver('referencia') && <td className="px-2 py-1 font-num text-[#2383C2]">{referenciaProducto(p) || '—'}</td>}
                  <td className="px-2 py-1 font-semibold text-gray-800 dark:text-gray-100">{p?.nombre || <span className="text-red-600">Producto no encontrado</span>}</td>
                  {ver('lote') && <td className="px-2 py-1 font-num">{l.lote || '—'}</td>}
                  {ver('vencimiento') && (
                    <td className="px-2 py-1 font-num">{l.vencimiento || '—'} {venc.etiqueta && <span className={`ml-1 px-1 rounded text-[9px] font-bold ${venc.badge}`}>{venc.etiqueta}</span>}</td>
                  )}
                  {ver('cantidad') && (
                    <td className="px-2 py-1 text-right">
                      <input type="number" min="1" step="1" inputMode="numeric" value={l.cantidad} disabled={deshabilitado}
                        onChange={(e) => onCambiar(cambiarCantidad(lineas, l.key, e.target.value === '' ? '' : Number(e.target.value)))}
                        className="w-20 h-8 px-1.5 text-right font-num border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900" aria-label="Cantidad" />
                    </td>
                  )}
                  {ver('precio') && (
                    <td className="px-2 py-1 text-right">
                      <input type="number" min="0" step="1" inputMode="numeric" value={l.precioUnitario ?? ''} disabled={deshabilitado}
                        onChange={(e) => onCambiar(cambiarPrecio(lineas, l.key, e.target.value))}
                        className="w-28 h-8 px-1.5 text-right font-num border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900" aria-label="Precio unitario" />
                    </td>
                  )}
                  {ver('total') && <td className="px-2 py-1 text-right font-num font-semibold">{formatoPesos(totalLinea(l))}</td>}
                  <td className="px-2 py-1 text-center">
                    <button type="button" disabled={deshabilitado} onClick={() => onCambiar(quitarLinea(lineas, l.key))} title="Quitar línea" className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {lineas.length > 0 && (
            <tfoot className="bg-gray-50 dark:bg-gray-900 font-bold text-[11px]">
              <tr>
                <td colSpan={columnasVisibles.length} className="px-2 py-1.5 text-right">
                  <PackageCheck size={13} className="inline mr-1 text-emerald-600" />{lineas.length} línea(s) · {formatoCantidad(total)} unidad(es)
                  {conPrecio && <> · Total carga <span className="font-num">{formatoPesos(totalValorLineas(lineas))}</span></>}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {lecturaSinVincular && (
        <ModalVincularCodigo
          lectura={lecturaSinVincular}
          productoSugerido={pendiente?.producto || null}
          onCerrar={() => { setLecturaSinVincular(null); enfocar(null); }}
          onVinculado={(producto) => { const lectura = lecturaSinVincular; setLecturaSinVincular(null); tomarProducto(producto, lectura); }}
        />
      )}
    </div>
  );
};

export default EditorLineasStock;
