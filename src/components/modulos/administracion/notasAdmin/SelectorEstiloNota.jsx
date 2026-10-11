import React from 'react';
import { Palette, Bold, AlignLeft, CheckSquare, AlertTriangle, RotateCcw } from 'lucide-react';
import {
  PALETA_FONDO, PALETA_TEXTO, normalizarEstilo, estiloVisualNota,
  contrasteEstilo, CONTRASTE_MINIMO,
} from './notasConfig';

// Fila de muestras de color + selector libre. `null` = color por defecto.
const FilaColores = ({ etiqueta, paleta, valor, onChange, colorSelectorPorDefecto }) => (
  <div>
    <span className="block text-[10.5px] font-semibold text-gray-500 dark:text-gray-400 mb-1">{etiqueta}</span>
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={etiqueta}>
      <button
        type="button"
        role="radio"
        aria-checked={valor === null}
        onClick={() => onChange(null)}
        title="Por defecto"
        className={`h-5 px-1.5 rounded border text-[9px] font-semibold text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 ${
          valor === null ? 'border-[#2383C2] ring-1 ring-[#2383C2]' : 'border-gray-300 dark:border-gray-600'
        }`}
      >
        Auto
      </button>
      {paleta.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={valor === c}
          aria-label={c}
          title={c}
          onClick={() => onChange(c)}
          style={{ backgroundColor: c }}
          className={`w-5 h-5 rounded border ${
            valor === c ? 'border-[#2383C2] ring-2 ring-[#2383C2] ring-offset-1 dark:ring-offset-gray-800' : 'border-gray-300 dark:border-gray-600'
          }`}
        />
      ))}
      <label
        title="Otro color"
        className="relative w-5 h-5 rounded border border-dashed border-gray-400 dark:border-gray-500 overflow-hidden cursor-pointer"
        style={{ background: valor && !paleta.includes(valor) ? valor : 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}
      >
        <input
          type="color"
          aria-label={`${etiqueta}: otro color`}
          value={(valor || colorSelectorPorDefecto).toLowerCase()}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
      </label>
    </div>
  </div>
);

/**
 * Estilo de la nota (fondo, texto, negrita) con vista previa. La vista previa
 * usa el mismo cálculo que el Dashboard y el listado (estiloVisualNota).
 */
const SelectorEstiloNota = ({ estilo, onChange, vistaPrevia }) => {
  const e = normalizarEstilo(estilo);
  const cambiar = (cambios) => onChange({ ...e, ...cambios });
  const visual = estiloVisualNota({ estilo: e });
  const ratio = contrasteEstilo(e);
  const bajoContraste = ratio !== null && ratio < CONTRASTE_MINIMO;
  const personalizado = e.fondo || e.texto || e.negrita;

  const { tipo, titulo, contenido, items } = vistaPrevia;
  const claseTexto = visual.textoPropio ? '' : 'text-gray-600 dark:text-gray-300';

  return (
    <fieldset className="flex flex-col gap-2 p-2 rounded border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between">
        <legend className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 flex items-center gap-1">
          <Palette size={12} /> Estilo de la nota
        </legend>
        {personalizado && (
          <button
            type="button"
            onClick={() => onChange(normalizarEstilo(null))}
            className="text-[10px] text-gray-500 hover:text-[#2383C2] flex items-center gap-1"
          >
            <RotateCcw size={10} /> Restablecer
          </button>
        )}
      </div>

      <FilaColores
        etiqueta="Fondo"
        paleta={PALETA_FONDO}
        valor={e.fondo}
        onChange={(fondo) => cambiar({ fondo })}
        colorSelectorPorDefecto="#FFFFFF"
      />
      <FilaColores
        etiqueta="Texto"
        paleta={PALETA_TEXTO}
        valor={e.texto}
        onChange={(texto) => cambiar({ texto })}
        colorSelectorPorDefecto="#111827"
      />

      <label className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-200 cursor-pointer select-none w-fit">
        <input
          type="checkbox"
          checked={e.negrita}
          onChange={(ev) => cambiar({ negrita: ev.target.checked })}
          className="accent-[#2383C2]"
        />
        <Bold size={12} /> Texto en negrita
      </label>

      <div>
        <span className="block text-[10.5px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Vista previa</span>
        <div
          data-testid="vista-previa-nota"
          style={visual.contenedor}
          className={`p-2.5 border rounded flex flex-col gap-1.5 ${
            visual.fondoPropio ? '' : 'bg-gray-50 dark:bg-gray-900/50 border-gray-100 dark:border-gray-700/50'
          }`}
        >
          <div className="flex items-center gap-1.5">
            {tipo === 'checklist'
              ? <CheckSquare size={13} className="text-[#2383C2] shrink-0" />
              : <AlignLeft size={13} className="text-[#2383C2] shrink-0" />}
            <h4
              style={visual.textoPropio ? { color: visual.texto.color } : undefined}
              className={`text-[11px] font-bold truncate ${visual.textoPropio ? '' : 'text-gray-800 dark:text-gray-200'}`}
            >
              {titulo || 'Título de ejemplo'}
            </h4>
          </div>
          {tipo === 'checklist' ? (
            <ul className="flex flex-col gap-1">
              {(items.length ? items : ['Elemento de ejemplo']).slice(0, 3).map((t, i) => (
                <li key={i} style={visual.texto} className={`text-[10.5px] flex items-center gap-2 ${claseTexto}`}>
                  <span className="w-3 h-3 border border-gray-300 rounded bg-white shrink-0" />
                  {t}
                </li>
              ))}
            </ul>
          ) : (
            <p style={visual.texto} className={`text-[10.5px] leading-relaxed whitespace-pre-wrap line-clamp-3 ${claseTexto}`}>
              {contenido || 'Así se verá el contenido de la nota en el panel.'}
            </p>
          )}
        </div>
        {bajoContraste && (
          <p role="status" className="mt-1 text-[10.5px] text-amber-700 dark:text-amber-400 flex items-start gap-1">
            <AlertTriangle size={12} className="shrink-0 mt-px" />
            Contraste bajo ({ratio.toFixed(1)}:1, se recomienda al menos {CONTRASTE_MINIMO}:1). El texto puede costar leerse.
          </p>
        )}
      </div>
    </fieldset>
  );
};

export default SelectorEstiloNota;
