import { useMemo, useState } from 'react';
import { X, Link2, PackagePlus, Search, ScanBarcode } from 'lucide-react';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { useToast } from '../../../../context/ToastContext';
import { useModal } from '../../../../context/ModalContext';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { RUTAS, textoBusquedaProducto, normalizarClave } from '../../../../../functions/bodega/nucleo.mjs';
import { guardarProducto, vincularCodigo, mensajeError, detalleError } from './bodegaApi';
import FormProducto from './FormProducto';
import { PRODUCTO_VACIO } from './productoFormulario';

const MAX_RESULTADOS = 30;

// Código leído que no está vinculado a ningún producto: buscar el producto
// en el maestro de Bodega y vincularlo, o crear uno nuevo con el código ya
// vinculado. Al terminar llama a onVinculado(producto) para que la pantalla
// siga con su flujo sin perder lo que se estaba ingresando.
//   lectura: interpretarLectura (codigo, clave, gs1)
//   productoSugerido: producto en curso (ofrece vincular a él con un clic)
const ModalVincularCodigo = ({ lectura, productoSugerido = null, onVinculado, onCerrar }) => {
  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { hasPermission } = useGranularPermission();
  const puedeVincular = hasPermission(RUTAS.maestro, 'codigos', 'btn_vincular');
  const puedeCrear = hasPermission(RUTAS.maestro, 'productos', 'btn_crear') && puedeVincular;
  const puedeReasignar = hasPermission(RUTAS.maestro, 'codigos', 'btn_desvincular');
  const { datos: productos } = useCatalogo('bodegaProductos');
  const [modo, setModo] = useState('buscar');
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);

  const resultados = useMemo(() => {
    const q = normalizarClave(texto);
    if (!q) return [];
    const palabras = q.split(' ');
    return productos
      .filter((p) => p.activo !== false && palabras.every((w) => textoBusquedaProducto(p).includes(w)))
      .slice(0, MAX_RESULTADOS);
  }, [productos, texto]);

  // Vincula; si el código pasó a estar vinculado a otro producto, ofrece
  // reasignarlo (requiere el permiso de quitar códigos).
  const vincular = async (producto, reasignar = false) => {
    setGuardando(true);
    try {
      await vincularCodigo({ productoId: producto.id, codigoLeido: lectura.codigo, reasignar });
      showToast(`Código vinculado a ${producto.nombre}.`, 'success');
      onVinculado({ ...producto, codigosBarra: [...new Set([...(producto.codigosBarra || []), lectura.clave])] });
    } catch (error) {
      const detalle = detalleError(error);
      if (detalle?.motivo === 'vinculado-a-otro' && puedeReasignar && !reasignar) {
        confirmAction('Código vinculado a otro producto', `${mensajeError(error)} ¿Reasignarlo a ${producto.nombre}?`, () => vincular(producto, true), { type: 'warning', confirmText: 'Reasignar' });
      } else {
        showToast(mensajeError(error), 'error');
      }
    } finally {
      setGuardando(false);
    }
  };

  const crear = async (form) => {
    setGuardando(true);
    try {
      const r = await guardarProducto({ producto: form, codigos: [lectura.codigo] });
      showToast(`Producto ${r.producto.codigoMaestro} creado y código vinculado.`, 'success');
      onVinculado({ id: r.id, ...r.producto });
    } catch (error) {
      showToast(mensajeError(error), 'error');
    } finally {
      setGuardando(false);
    }
  };

  const gs1 = lectura?.gs1;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Vincular código de barra">
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 text-[12px]">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between gap-3 bg-amber-50 dark:bg-amber-950/30 rounded-t-lg">
          <div>
            <h3 className="text-[13px] font-bold text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
              <ScanBarcode size={16} className="text-amber-600" /> Código sin vincular
            </h3>
            <p className="font-num text-[13px] text-gray-700 dark:text-gray-200 break-all">{lectura.codigo}</p>
            {gs1?.esGS1 && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                GS1 · GTIN <span className="font-num">{gs1.gtin}</span>
                {gs1.lote && <> · Lote <span className="font-num">{gs1.lote}</span></>}
                {gs1.vencimiento && <> · Vence <span className="font-num">{gs1.vencimiento}</span></>}
              </p>
            )}
          </div>
          <button type="button" onClick={onCerrar} disabled={guardando} aria-label="Cerrar" className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700">
            <X size={16} />
          </button>
        </div>

        {!puedeVincular ? (
          <p className="p-4 text-gray-600 dark:text-gray-300">No tienes permiso para vincular códigos de barra. Pide a un administrador que lo vincule desde el Maestro de Bodega.</p>
        ) : (
          <>
            <div className="px-4 pt-3 flex gap-1.5">
              <button type="button" onClick={() => setModo('buscar')} className={`h-8 px-3 rounded font-semibold flex items-center gap-1.5 ${modo === 'buscar' ? 'bg-[#2383C2] text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'}`}>
                <Link2 size={13} /> Vincular a un producto existente
              </button>
              {puedeCrear && (
                <button type="button" onClick={() => setModo('crear')} className={`h-8 px-3 rounded font-semibold flex items-center gap-1.5 ${modo === 'crear' ? 'bg-[#2383C2] text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'}`}>
                  <PackagePlus size={13} /> Crear producto nuevo
                </button>
              )}
            </div>

            <div className="p-4 overflow-auto">
              {modo === 'buscar' ? (
                <div className="flex flex-col gap-2">
                  {productoSugerido && (
                    <button type="button" disabled={guardando} onClick={() => vincular(productoSugerido)}
                      className="text-left px-3 py-2 rounded border-2 border-[#2383C2] bg-blue-50 dark:bg-sky-950/30 hover:bg-blue-100 disabled:opacity-50">
                      <span className="text-[10px] font-bold uppercase text-[#2383C2]">Producto en curso</span>
                      <div className="font-semibold">{productoSugerido.codigoMaestro} · {productoSugerido.nombre}</div>
                    </button>
                  )}
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 text-gray-400" size={14} />
                    <input value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus
                      placeholder="Buscar por nombre, código maestro, referencia…"
                      className="w-full h-9 pl-8 pr-2 border border-gray-300 dark:border-gray-600 rounded outline-none bg-white dark:bg-gray-900 focus:border-[#2383C2]" />
                  </div>
                  <ul className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded max-h-72 overflow-auto">
                    {resultados.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 px-2 py-1.5">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-gray-800 dark:text-gray-100 truncate">{p.nombre}</div>
                          <div className="text-[11px] text-gray-500 font-num">{p.codigoMaestro}{p.referencia ? ` · ${p.referencia}` : ''}</div>
                        </div>
                        <button type="button" disabled={guardando} onClick={() => vincular(p)} className="h-8 px-3 rounded bg-[#2383C2] text-white font-bold disabled:opacity-50">
                          Vincular
                        </button>
                      </li>
                    ))}
                    {texto.trim() && resultados.length === 0 && (
                      <li className="px-2 py-3 text-gray-500 italic">
                        Sin coincidencias.{puedeCrear && <> Usa <strong>Crear producto nuevo</strong>.</>}
                      </li>
                    )}
                    {!texto.trim() && <li className="px-2 py-3 text-gray-400 italic">Escribe para buscar en el maestro de Bodega.</li>}
                  </ul>
                </div>
              ) : (
                <FormProducto esNuevo inicial={PRODUCTO_VACIO} guardando={guardando} onGuardar={crear} onCancelar={() => setModo('buscar')} textoGuardar="Crear y vincular código" />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ModalVincularCodigo;
