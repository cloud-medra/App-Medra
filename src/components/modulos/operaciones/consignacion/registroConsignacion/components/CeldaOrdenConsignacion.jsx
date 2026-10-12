import { useState } from 'react';
import { Lock } from 'lucide-react';
import { esOrdenSincronizada, normalizarOrdenManual } from '../../utils/registroConsignacionService';

// Celda ORDEN de Registro de Consignación.
//   - Orden sincronizada (ordenOrigen 'oc'): solo lectura, con candado. Ni
//     borrar ni editar; firestore.rules también lo impide.
//   - Si no: se escribe a mano, solo números separados por coma. Al salir
//     de la celda se normaliza ("123,456" -> "123, 456"); si el formato no
//     sirve se avisa (onInvalido) y se vuelve al valor guardado (también si
//     onGuardar devuelve false).
export const CeldaOrdenConsignacion = ({ registro, onGuardar, onInvalido }) => {
  const valorGuardado = registro?.orden || '';
  const [valor, setValor] = useState(valorGuardado);

  if (esOrdenSincronizada(registro)) {
    return (
      <span
        title="Sincronizada desde OC (Importar Detalles OC): no se puede editar"
        aria-label={`Orden ${valorGuardado}, sincronizada desde OC`}
        className="flex items-center gap-1 h-6 px-1.5 rounded text-[10px] font-num font-semibold text-slate-600 dark:text-gray-300 bg-slate-100 dark:bg-gray-700/50 cursor-not-allowed"
      >
        <Lock size={10} className="shrink-0 text-slate-400" />
        <span className="truncate">{valorGuardado}</span>
      </span>
    );
  }

  const confirmar = () => {
    const r = normalizarOrdenManual(valor);
    if (!r.ok) {
      onInvalido?.(r.error);
      setValor(valorGuardado);
      return;
    }
    setValor(r.valor);
    if (r.valor === valorGuardado) return;
    // onGuardar devuelve false si no se pudo guardar: vuelve al valor guardado.
    Promise.resolve(onGuardar(r.valor)).then((ok) => { if (ok === false) setValor(valorGuardado); });
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label="N° Orden"
      value={valor}
      // Solo dígitos, coma y espacio mientras se escribe.
      onChange={e => setValor(e.target.value.replace(/[^\d,\s]/g, ''))}
      onBlur={confirmar}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      placeholder="N° Orden"
      title="Solo números; varias órdenes separadas por coma"
      className="w-full h-6 px-1.5 border border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-[#2383C2] rounded text-[10px] outline-none bg-transparent focus:bg-white dark:focus:bg-gray-900 text-gray-700 dark:text-gray-200 transition"
    />
  );
};

export default CeldaOrdenConsignacion;
