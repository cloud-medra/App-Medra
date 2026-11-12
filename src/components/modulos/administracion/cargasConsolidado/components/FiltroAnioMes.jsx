import { Loader2 } from 'lucide-react';
import { MESES } from '../../controlMensual/constants';

const TODOS_LOS_MESES = 'TODOS';

// Selector Año/Mes reutilizado por Gestión (filtra sobre "fecha") e
// Imputadas (filtra sobre "período") — el campo real que filtra lo decide
// quien use este componente; acá solo se listan las opciones ya
// calculadas (años/meses con datos reales) y se dispara el cambio.
const FiltroAnioMes = ({ anio, setAnio, mes, setMes, aniosDisponibles, mesesDisponibles, cargandoAnios, labelCampo, sinTodosLosMeses = false }) => {
  return (
    <div className="flex items-center gap-2 text-pequeno">
      {cargandoAnios ? (
        <span className="flex items-center gap-1.5 text-tinta-atenuada">
          <Loader2 size={13} className="animate-spin" /> Buscando años con datos...
        </span>
      ) : (
        <>
          <label className="flex items-center gap-1.5 text-tinta-secundaria text-etiqueta">
            Año{labelCampo ? ` (${labelCampo})` : ''}:
            <select
              value={anio}
              onChange={(e) => setAnio(e.target.value)}
              className="h-7 px-2 border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-tinta-principal outline-none focus:ring-1 focus:ring-[#2383C2]"
            >
              <option value="">Seleccionar...</option>
              {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>

          {anio && (
            <label className="flex items-center gap-1.5 text-tinta-secundaria text-etiqueta">
              Mes:
              <select
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                className="h-7 px-2 border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-tinta-principal outline-none focus:ring-1 focus:ring-[#2383C2]"
              >
                {!sinTodosLosMeses && <option value={TODOS_LOS_MESES}>Todos los meses</option>}
                {mesesDisponibles.map(m => {
                  const meta = MESES.find(x => x.id === m || x.num === Number(m));
                  return <option key={m} value={m}>{meta?.nombre || m}</option>;
                })}
              </select>
            </label>
          )}

          {!anio && (
            <span className="text-tinta-atenuada italic">Elegí un año para ver los datos</span>
          )}
        </>
      )}
    </div>
  );
};

export default FiltroAnioMes;
