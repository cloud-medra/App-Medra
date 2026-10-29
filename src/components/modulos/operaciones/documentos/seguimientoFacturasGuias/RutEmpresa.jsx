// RUT de la empresa elegida en el filtro, junto al select. Sale de
// Maestros → Empresas vía catalogosStore: una sola lectura por sesión,
// compartida con las demás pantallas (y solo se monta con una empresa
// elegida). El cruce es por nombre (ver utils/empresaMaestro.js).
//   - Con RUT: botón que lo copia, con "¡Copiado!" durante 2 s.
//   - En Maestros sin RUT: "Sin RUT".
//   - No encontrada: "No encontrada en Maestros", para detectar nombres
//     mal escritos en la planilla importada.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useCatalogo } from '../../../../../hooks/useCatalogo';
import { useToast } from '../../../../../context/ToastContext';
import { formatearRut } from '../../../../../utils/rut';
import { copiarAlPortapapeles } from '../../../../../utils/portapapeles';
import { buscarEmpresaMaestro } from './utils/empresaMaestro';

const DURACION_COPIADO = 2000;
const ETIQUETA = 'h-7 px-2 flex items-center rounded border text-[11px]';

const RutEmpresa = ({ nombre }) => {
  const { datos: empresas, cargando, error } = useCatalogo('empresas');
  const { showToast } = useToast();
  const [copiado, setCopiado] = useState(false);
  const temporizador = useRef(null);

  useEffect(() => () => clearTimeout(temporizador.current), []);

  const empresa = useMemo(() => buscarEmpresaMaestro(nombre, empresas), [nombre, empresas]);
  const rut = formatearRut(empresa?.rut);

  // Mientras carga, o si falló la lectura, no se afirma nada sobre la empresa.
  if (cargando || error) return null;

  if (!empresa) {
    return (
      <span className={`${ETIQUETA} border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20`}>
        No encontrada en Maestros
      </span>
    );
  }

  if (!rut) {
    return (
      <span className={`${ETIQUETA} border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-900`}>
        Sin RUT
      </span>
    );
  }

  const copiar = async () => {
    if (!(await copiarAlPortapapeles(rut))) {
      showToast('No se pudo copiar el RUT', 'error');
      return;
    }
    setCopiado(true);
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setCopiado(false), DURACION_COPIADO);
  };

  return (
    <button
      type="button"
      onClick={copiar}
      title="Clic para copiar"
      aria-label={`Copiar RUT ${rut}`}
      className={`${ETIQUETA} gap-1.5 cursor-pointer transition ${copiado
        ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
        : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900 hover:border-[#2383C2] hover:text-[#2383C2]'}`}
    >
      {copiado ? <Check size={12} /> : <Copy size={12} />}
      <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-gray-400">RUT</span>
      <span className="font-num font-semibold">{copiado ? '¡Copiado!' : rut}</span>
    </button>
  );
};

export default RutEmpresa;
