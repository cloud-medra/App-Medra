import { useState } from 'react';
import { Pencil, Trash2, Check, X, AlertCircle } from 'lucide-react';
import { PadContenidoRow } from './PadContenidoRow';
import { formatearFechaTabla } from './cargasHelpers';
import { SIN_LOTE, SIN_FECHA, aBorrador, validarContenidoPad, deBorrador } from './contenidoPadHelpers';

// Líneas de "Contenido del PAD" ya registradas en el formulario de
// cotización (antes de "Agregar"). Cada una se puede editar en la misma
// fila (mismo editor que "Agregar contenido" de la tabla de ítems,
// PadContenidoRow) o quitar. Al editar: Guardar / Cancelar, Enter guarda y
// Escape cancela (restaura lo anterior). Mismas validaciones que al
// registrar: referencia y cantidad > 0 obligatorias; vencimiento vacío o
// fecha AAAA-MM-DD. Lote / vencimiento vacíos = "Sin lote" / "Sin fecha".

// `FilaEditor`: fila de edición con su autocompletado (Hemodinamia pasa la
// suya, que busca solo en el segmento HEMODINAMIA de Códigos).
const ContenidoPadRegistrado = ({ filas, onActualizar, onEliminar, deshabilitado = false, FilaEditor = PadContenidoRow }) => {
  const [editandoId, setEditandoId] = useState(null);
  const [borrador, setBorrador] = useState(null);
  const [errores, setErrores] = useState({});

  const editar = (fila) => { setEditandoId(fila.tempId); setBorrador(aBorrador(fila)); setErrores({}); };
  const cancelar = () => { setEditandoId(null); setBorrador(null); setErrores({}); };
  const guardar = () => {
    const err = validarContenidoPad(borrador);
    if (Object.keys(err).length) { setErrores(err); return; }
    onActualizar(editandoId, deBorrador(borrador));
    cancelar();
  };
  const alTeclear = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); guardar(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelar(); }
  };
  const th = 'px-2 py-1 border-b border-r last:border-r-0 border-fuchsia-200 dark:border-fuchsia-900/60';
  const td = 'px-2 py-1 border-b border-r last:border-r-0 border-fuchsia-100 dark:border-fuchsia-900/40';

  return (
    <div className="overflow-x-auto rounded border border-fuchsia-200 dark:border-fuchsia-900/60">
      <table className="w-full text-left text-[10px] border-collapse" aria-label="Contenido del PAD registrado">
        <thead className="bg-fuchsia-100/60 dark:bg-fuchsia-950/30">
          <tr className="text-fuchsia-700 dark:text-fuchsia-400 uppercase font-bold text-[9px]">
            <th className={th}>Referencia</th>
            <th className={`${th} text-center`}>Cant.</th>
            <th className={th}>Lote</th>
            <th className={th}>Vencimiento</th>
            <th className={`${th} text-center w-16`}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (editandoId === fila.tempId ? (
            <tr key={fila.tempId} className="bg-blue-50/60 dark:bg-blue-950/20">
              <td colSpan={5} className="p-2 border-b border-fuchsia-100 dark:border-fuchsia-900/40">
                {/* Enter guarda, Escape cancela (en cualquier campo de la fila). */}
                <div onKeyDown={alTeclear} className="flex flex-col gap-1.5" role="group" aria-label={`Editar ${fila.referencia}`}>
                  <FilaEditor fila={borrador} onChange={(nueva) => { setBorrador(nueva); setErrores({}); }} puedeEliminar={false} />
                  {Object.keys(errores).length > 0 && (
                    <div role="alert" className="text-[9px] text-red-500 font-medium flex items-center gap-1">
                      <AlertCircle size={10} />
                      {[errores.referencia && 'la referencia es obligatoria', errores.cantidad && 'la cantidad debe ser mayor a 0', errores.vencimiento && 'el vencimiento no es una fecha válida']
                        .filter(Boolean).join(' · ').replace(/^./, (c) => c.toUpperCase())}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={guardar} className="h-9 md:h-7 px-3 bg-[#2383C2] hover:bg-[#1d6fa5] text-white rounded font-semibold text-[10px] inline-flex items-center gap-1">
                      <Check size={12} /> Guardar
                    </button>
                    <button type="button" onClick={cancelar} className="h-9 md:h-7 px-3 text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200 font-medium text-[10px] inline-flex items-center gap-1">
                      <X size={12} /> Cancelar
                    </button>
                    <span className="text-[9px] text-slate-400 dark:text-gray-500">Enter guarda · Esc cancela</span>
                  </div>
                </div>
              </td>
            </tr>
          ) : (
            <tr key={fila.tempId} className="border-l-2 border-transparent hover:border-[#2383C2] bg-white dark:bg-gray-900/40 hover:bg-fuchsia-50/40 dark:hover:bg-fuchsia-950/10">
              <td className={`${td} font-semibold text-slate-700 dark:text-gray-200 truncate max-w-[220px]`} title={fila.referencia}>{fila.referencia}</td>
              <td className={`${td} text-center text-slate-600 dark:text-gray-300`}>{fila.cantidad}</td>
              <td className={`${td} text-slate-600 dark:text-gray-300`}>
                {fila.lote === SIN_LOTE ? <span className="italic text-slate-400 dark:text-gray-500">{SIN_LOTE}</span> : fila.lote}
              </td>
              <td className={`${td} text-slate-600 dark:text-gray-300`}>
                {fila.vencimiento === SIN_FECHA ? <span className="italic text-slate-400 dark:text-gray-500">{SIN_FECHA}</span> : formatearFechaTabla(fila.vencimiento)}
              </td>
              <td className={`${td} text-center`}>
                <span className="inline-flex items-center gap-1">
                  <button type="button" onClick={() => editar(fila)} disabled={deshabilitado || Boolean(editandoId)}
                    title={deshabilitado ? 'Bloqueado: desbloquea el candado para editar' : 'Editar esta línea'} aria-label={`Editar ${fila.referencia}`}
                    className="text-blue-600 hover:text-blue-800 p-1 md:p-0.5 rounded hover:bg-blue-50 dark:hover:bg-blue-950/30 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent">
                    <Pencil size={12} />
                  </button>
                  <button type="button" onClick={() => onEliminar(fila.tempId)} disabled={deshabilitado || Boolean(editandoId)}
                    title="Quitar esta línea" aria-label={`Quitar ${fila.referencia}`}
                    className="text-red-500 hover:text-red-700 p-1 md:p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent">
                    <Trash2 size={12} />
                  </button>
                </span>
              </td>
            </tr>
          )))}
        </tbody>
      </table>
    </div>
  );
};

export default ContenidoPadRegistrado;
