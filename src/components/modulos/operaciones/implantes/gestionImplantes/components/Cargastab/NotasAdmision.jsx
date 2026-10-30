import { useState } from 'react';
import { ChevronDown, ChevronUp, StickyNote, Copy, Pencil } from 'lucide-react';

// "Notas de la admisión" en Cargas: la Descripción / Nota Operatoria y el
// Texto Libre / Notas Adicionales de la gestión (los mismos campos de la
// pestaña Información, del formData ya en memoria: sin lecturas y con lo
// último editado, aunque aún no se haya guardado). Solo lectura: se ve
// también con el bloque imputado. Colapsable (se recuerda en este
// navegador); los textos largos se muestran recortados con "Ver más".

const CLAVE_ABIERTO = 'workcraft:cargas:notasAdmision:abierto';
// Más de esto se considera "largo" y se recorta.
const MAX_LINEAS = 4;
const MAX_CARACTERES = 320;

const leerAbierto = () => {
  try { return localStorage.getItem(CLAVE_ABIERTO) !== '0'; } catch { return true; }
};
const guardarAbierto = (abierto) => {
  try { localStorage.setItem(CLAVE_ABIERTO, abierto ? '1' : '0'); } catch { /* sin localStorage */ }
};

// 'P' es el valor de relleno de los campos vacíos de la gestión.
const textoUtil = (t) => {
  const s = String(t ?? '').trim();
  return s && s !== 'P' && s !== 'Cargando...' ? s : '';
};

const Seccion = ({ titulo, texto, onCopiar }) => {
  const [expandido, setExpandido] = useState(false);
  const largo = texto.split('\n').length > MAX_LINEAS || texto.length > MAX_CARACTERES;
  return (
    <section className="min-w-0 flex flex-col gap-1" aria-label={titulo}>
      <div className="flex items-center gap-2">
        <h4 className="text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-gray-400">{titulo}</h4>
        {texto && onCopiar && (
          <button type="button" onClick={() => onCopiar(texto)} title={`Copiar ${titulo}`} aria-label={`Copiar ${titulo}`}
            className="ml-auto p-1 md:p-0.5 rounded text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition">
            <Copy size={11} />
          </button>
        )}
      </div>
      {texto ? (
        <>
          <p
            data-expandido={largo ? String(expandido) : undefined}
            className={`text-[10.5px] leading-relaxed text-slate-700 dark:text-gray-200 whitespace-pre-wrap break-words ${
              largo && !expandido ? 'max-h-[4.6rem] overflow-hidden [mask-image:linear-gradient(to_bottom,black_60%,transparent)]' : largo ? 'max-h-60 overflow-y-auto pr-1' : ''
            }`}
          >
            {texto}
          </p>
          {largo && (
            <button type="button" onClick={() => setExpandido((v) => !v)} className="self-start text-[9.5px] font-semibold text-[#2383C2] hover:underline">
              {expandido ? 'Ver menos' : 'Ver más'}
            </button>
          )}
        </>
      ) : (
        <p className="text-[10.5px] italic text-slate-400 dark:text-gray-500">Sin información</p>
      )}
    </section>
  );
};

const NotasAdmision = ({ descripcion, observacion, onCopiar, onEditar, verDescripcion = true, verObservacion = true }) => {
  const [abierto, setAbierto] = useState(leerAbierto);
  if (!verDescripcion && !verObservacion) return null;
  const alternar = () => setAbierto((v) => { guardarAbierto(!v); return !v; });
  const desc = textoUtil(descripcion);
  const obs = textoUtil(observacion);

  return (
    <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700/80 rounded-lg shadow-xs overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50/80 dark:bg-gray-800/80">
        <button type="button" onClick={alternar} aria-expanded={abierto} className="flex items-center gap-1.5 text-left flex-grow">
          {abierto ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
          <StickyNote size={12} className="text-[#2383C2]" />
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-700 dark:text-gray-200">Notas de la admisión</span>
          {!abierto && (desc || obs) && <span className="text-[9.5px] text-slate-400 dark:text-gray-500 truncate">· {desc || obs}</span>}
        </button>
        {onEditar && (
          <button type="button" onClick={onEditar} className="shrink-0 inline-flex items-center gap-1 py-1.5 md:py-0 text-[9.5px] font-semibold text-[#2383C2] hover:underline">
            <Pencil size={10} /> Editar en Información
          </button>
        )}
      </div>
      {abierto && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 px-3 py-2.5 border-t border-slate-100 dark:border-gray-700/60">
          {verDescripcion && <Seccion titulo="Descripción / Nota Operatoria" texto={desc} onCopiar={onCopiar} />}
          {verObservacion && <Seccion titulo="Texto Libre / Notas Adicionales" texto={obs} onCopiar={onCopiar} />}
        </div>
      )}
    </div>
  );
};

export default NotasAdmision;
