import { useMemo, useState } from 'react';
import { ScanBarcode, X } from 'lucide-react';
import { useToast } from '../../../../context/ToastContext';
import { useModal } from '../../../../context/ModalContext';
import { interpretarLectura } from '../../../../../functions/bodega/gs1.mjs';
import { referenciaDeProducto } from '../../../../../functions/bodega/nucleo.mjs';
import { detalleError, mensajeError } from '../../bodega/shared/bodegaApi';
import { esTeclaFinEscaneo } from '../../bodega/shared/escaneo/identificarLectura';
import BuscadorProducto from '../../bodega/shared/BuscadorProducto';
import { gestionarCodigoBarra } from './codigosBarraApi';
import { referenciaVisible } from './filasCodigos';

const TITULOS = { AGREGAR: 'Agregar código', EDITAR: 'Editar código', MOVER: 'Mover código', ELIMINAR: 'Eliminar vínculo' };
const BOTONES = { AGREGAR: 'Agregar', EDITAR: 'Guardar', MOVER: 'Mover', ELIMINAR: 'Eliminar' };

const nombreProducto = (p) => `${referenciaDeProducto(p) || p.codigoMaestro} · ${p.nombre}`;

// Una acción sobre un código. `fila`: el vínculo afectado (null al agregar).
// Editar, mover y eliminar piden confirmación mostrando código y referencia;
// el servidor vuelve a validar todo dentro de la transacción.
const AccionCodigoModal = ({ accion, fila = null, codigoInicial = '', onCerrar, onHecho }) => {
  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const [codigo, setCodigo] = useState(codigoInicial);
  const [producto, setProducto] = useState(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const pideCodigo = accion === 'AGREGAR' || accion === 'EDITAR';
  const pideProducto = accion === 'AGREGAR' || accion === 'MOVER';
  const lectura = useMemo(() => (pideCodigo ? interpretarLectura(codigo) : null), [pideCodigo, codigo]);
  const filtroDestino = useMemo(() => (fila ? (p) => p.id !== fila.productoId : undefined), [fila]);

  const ejecutar = async () => {
    setGuardando(true);
    setError('');
    const base = fila ? { clave: fila.clave, esperadoProductoId: fila.productoId } : {};
    try {
      await gestionarCodigoBarra({
        accion, ...base,
        ...(pideCodigo ? { codigoLeido: codigo } : {}),
        ...(accion === 'AGREGAR' ? { productoId: producto.id } : {}),
        ...(accion === 'MOVER' ? { productoDestinoId: producto.id } : {}),
      });
      showToast('Cambio guardado.', 'success');
      onHecho();
    } catch (e) {
      if (detalleError(e)?.motivo === 'cambio-concurrente') {
        showToast(mensajeError(e), 'error');
        onHecho();
        return;
      }
      setError(mensajeError(e, 'No se pudo guardar el cambio.'));
    } finally {
      setGuardando(false);
    }
  };

  const confirmar = () => {
    setError('');
    if (pideCodigo && (!lectura || lectura.soloDatosLote)) { setError(lectura ? 'Ese código solo trae lote o vencimiento: no identifica un producto.' : 'Ingresa o escanea un código.'); return; }
    if (pideProducto && !producto) { setError('Elige la referencia.'); return; }
    if (accion === 'AGREGAR') { ejecutar(); return; }
    const afectado = `Código ${fila.codigo}, referencia ${referenciaVisible(fila)} (${fila.nombre}).`;
    const mensajes = {
      EDITAR: `${afectado} Su valor cambiará a ${lectura?.clave}.`,
      MOVER: `${afectado} Pasará a ${producto ? nombreProducto(producto) : ''}.`,
      ELIMINAR: `${afectado} Se quitará el vínculo; el stock y el kardex no cambian.`,
    };
    confirmAction(TITULOS[accion], mensajes[accion], ejecutar, { confirmText: BOTONES[accion], type: accion === 'ELIMINAR' ? 'danger' : 'warning' });
  };

  return (
    <div className="font-app text-tinta-principal fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label={TITULOS[accion]}>
      <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 text-secundario">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
          <h3 className="text-subtitulo flex items-center gap-1.5"><ScanBarcode size={15} /> {TITULOS[accion]}</h3>
          <button type="button" onClick={onCerrar} disabled={guardando} aria-label="Cerrar" className="p-1 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"><X size={16} /></button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          {fila && (
            <dl className="flex flex-col gap-1">
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-tinta-secundaria">Código</dt><dd className="text-etiqueta break-all">{fila.codigo}</dd></div>
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-tinta-secundaria">Referencia</dt><dd className="text-etiqueta">{referenciaVisible(fila)}</dd></div>
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-tinta-secundaria">Producto</dt><dd className="text-etiqueta">{fila.nombre}</dd></div>
            </dl>
          )}
          {pideCodigo && (
            <label className="flex flex-col gap-1">
              <span className="text-etiqueta">{accion === 'EDITAR' ? 'Valor nuevo' : 'Código de barras'}</span>
              <input
                value={codigo} autoFocus autoComplete="off" spellCheck={false}
                onChange={(e) => setCodigo(e.target.value)}
                onKeyDown={(e) => { if (esTeclaFinEscaneo(e) && codigo.trim()) e.preventDefault(); }}
                placeholder="Escanea o escribe el código"
                className="h-8 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 outline-none focus:border-[#2383C2] text-numero-tabla"
              />
              {lectura && lectura.clave && lectura.clave !== lectura.codigo && <span className="text-pequeno text-tinta-secundaria">Se guardará como {lectura.clave}.</span>}
            </label>
          )}
          {pideProducto && (
            <div className="flex flex-col gap-1">
              <span className="text-etiqueta">{accion === 'MOVER' ? 'Referencia de destino' : 'Referencia'}</span>
              {producto && (
                <p className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-blue-50 dark:bg-sky-950/30">
                  <span className="text-etiqueta">{nombreProducto(producto)}</span>
                  <button type="button" onClick={() => setProducto(null)} className="text-pequeno text-[#2383C2]">Cambiar</button>
                </p>
              )}
              {!producto && <BuscadorProducto onElegir={setProducto} deshabilitado={guardando} filtro={filtroDestino} placeholder="Busca por referencia, nombre o código…" />}
            </div>
          )}
          {error && <p className="text-red-600">{error}</p>}
        </div>
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} disabled={guardando} className="h-8 px-3 rounded bg-gray-200 dark:bg-gray-700 text-etiqueta">Cancelar</button>
          <button type="button" onClick={confirmar} disabled={guardando} className={`h-8 px-3 rounded text-white text-etiqueta disabled:opacity-50 ${accion === 'ELIMINAR' ? 'bg-red-600' : 'bg-[#2383C2]'}`}>{guardando ? 'Guardando…' : BOTONES[accion]}</button>
        </div>
      </div>
    </div>
  );
};

export default AccionCodigoModal;
