import { useState } from 'react';
import { Plus, X, Loader2, AlertCircle } from 'lucide-react';

const getFechaActualISO = () => {
  const hoy = new Date();
  const mm = String(hoy.getMonth() + 1).padStart(2, '0');
  const dd = String(hoy.getDate()).padStart(2, '0');
  return `${hoy.getFullYear()}-${mm}-${dd}`;
};

/**
 * Formulario de alta rápida Fecha + Empresa, encima de las cards de la
 * columna "Empresas / Fechas" del detalle (Implantes y Hemodinamia).
 *  - EmpresaSelect: el select de Empresa del módulo (buscador, portal, teclado).
 *  - validar({ fecha, empresa }) → mensaje de error | null (validación local).
 *  - onAgregar({ fecha, empresa }) → Promise<{ error?: string }>.
 */
const AgregarEmpresaFechaForm = ({ EmpresaSelect, validar, onAgregar, onCancelar }) => {
  const [fecha, setFecha] = useState(getFechaActualISO);
  const [empresa, setEmpresa] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (guardando) return;
    const errorLocal = validar({ fecha, empresa });
    if (errorLocal) {
      setError(errorLocal);
      return;
    }
    setGuardando(true);
    setError('');
    try {
      const resultado = await onAgregar({ fecha, empresa });
      if (resultado?.error) setError(resultado.error);
    } finally {
      setGuardando(false);
    }
  };

  // Escape cancela, salvo cuando lo consumió el listado abierto de Empresa
  // (su buscador hace preventDefault y el evento llega aquí a través del portal).
  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && !e.defaultPrevented && !guardando) {
      e.preventDefault();
      onCancelar();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      className="m-1.5 mb-0 p-2 rounded-md border border-[#2383C2]/40 bg-blue-50/40 dark:bg-blue-950/20 flex flex-col gap-1.5"
    >
      <div>
        <label className="block text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-0.5">Fecha</label>
        <input
          type="date"
          autoFocus
          value={fecha}
          onChange={e => { setFecha(e.target.value); setError(''); }}
          className="w-full h-9 md:h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-base md:text-[11px] outline-none focus:border-[#2383C2] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100"
        />
      </div>

      <div>
        <label className="block text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-0.5">Empresa</label>
        <EmpresaSelect
          value={empresa}
          onChange={(emp) => { setEmpresa(emp.nombre); setError(''); }}
          placeholder="Seleccionar empresa..."
        />
      </div>

      {error && (
        <p className="text-[9px] text-red-600 dark:text-red-400 font-medium flex items-start gap-1">
          <AlertCircle size={11} className="shrink-0 mt-px" /> {error}
        </p>
      )}

      <div className="flex gap-1.5">
        <button
          type="submit"
          disabled={guardando}
          className="flex-1 h-9 md:h-7 rounded font-bold text-[11px] flex items-center justify-center gap-1 bg-[#2383C2] hover:bg-[#369BCE] text-white transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {guardando ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          Agregar
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={guardando}
          className="flex-1 h-9 md:h-7 rounded font-bold text-[11px] flex items-center justify-center gap-1 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition disabled:opacity-60"
        >
          <X size={12} /> Cancelar
        </button>
      </div>
    </form>
  );
};

export default AgregarEmpresaFechaForm;
