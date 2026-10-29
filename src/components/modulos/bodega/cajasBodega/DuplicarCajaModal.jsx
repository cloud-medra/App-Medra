import { useState } from 'react';
import { X, Copy } from 'lucide-react';
import { nombreSugeridoCopia, validarDuplicadoCaja, idUnico, MAX_NOMBRE_CAJA } from '../../../../../functions/bodega/nucleo.mjs';
import { duplicarCaja, mensajeError } from '../shared/bodegaApi';

const INPUT = 'h-9 px-2 border border-gray-300 dark:border-gray-600 rounded text-[12px] outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:border-[#2383C2] disabled:opacity-60';

// Duplicar una caja: pide el nombre de la nueva (sugerido: el siguiente
// número o "(copia)"). Copia descripción, estado, productos, stock objetivo
// y orden; el stock actual queda en 0 y no se copia el historial. El nombre
// se revisa acá contra las cajas cargadas (`nombresOcupados`: ids de
// idUnico.caja) y el servidor lo vuelve a validar en la transacción.
const DuplicarCajaModal = ({ caja, nombresOcupados = new Set(), onCerrar, onDuplicada }) => {
  const [nombre, setNombre] = useState(() => nombreSugeridoCopia(caja.nombre));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const cantidad = Object.keys(caja.productos || {}).length;

  const duplicar = async () => {
    const { errores, nombre: limpio } = validarDuplicadoCaja({ cajaId: caja.id, nombre });
    if (errores.length) { setError(errores.join(' ')); return; }
    if (nombresOcupados.has(idUnico.caja(limpio))) { setError(`Ya existe una caja llamada "${limpio}". Elige otro nombre.`); return; }
    setGuardando(true);
    setError('');
    try {
      const r = await duplicarCaja({ cajaId: caja.id, nombre: limpio, version: caja.actualizadoEn?.toMillis?.() ?? null });
      onDuplicada(r.id);
    } catch (e) {
      setError(mensajeError(e, 'No se pudo duplicar la caja.'));
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Duplicar caja">
      <form onSubmit={(e) => { e.preventDefault(); duplicar(); }} className="w-full max-w-md flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 text-[12px]">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
          <h3 className="text-[13px] font-bold flex items-center gap-1.5"><Copy size={15} /> Duplicar caja · {caja.nombre}</h3>
          <button type="button" onClick={onCerrar} disabled={guardando} aria-label="Cerrar" className="p-1 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"><X size={16} /></button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <label className="flex flex-col">
            <span className="text-[10px] font-bold uppercase text-gray-500">Nombre de la nueva caja *</span>
            <input value={nombre} onChange={(e) => { setNombre(e.target.value); setError(''); }} maxLength={MAX_NOMBRE_CAJA} disabled={guardando} autoFocus onFocus={(e) => e.target.select()} className={INPUT} />
          </label>
          <p className="text-gray-500">
            Se copian la descripción y los {cantidad} producto(s) con su stock objetivo y su orden. El stock actual de la nueva caja parte en 0 y no se copian inventarios, reposiciones ni historial.
          </p>
          {error && <p className="text-red-600" role="alert">{error}</p>}
        </div>
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} disabled={guardando} className="h-9 px-3 rounded bg-gray-200 dark:bg-gray-700 font-semibold">Cancelar</button>
          <button type="submit" disabled={guardando} className="h-9 px-4 rounded bg-[#2383C2] text-white font-bold disabled:opacity-50">{guardando ? 'Duplicando…' : 'Duplicar'}</button>
        </div>
      </form>
    </div>
  );
};

export default DuplicarCajaModal;
