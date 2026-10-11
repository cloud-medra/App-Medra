import React from 'react';
import { db } from '../../../../firebaseConfig';
import { doc, updateDoc } from 'firebase/firestore';
import { upsertLocal } from '../../../../stores/catalogosStore';
import { useNotasPanel } from '../../administracion/notasAdmin/useNotasPanel';
import { estiloVisualNota } from '../../administracion/notasAdmin/notasConfig';
import { StickyNote, CheckSquare, AlignLeft, Check } from 'lucide-react';

const NuevoModuloCard = () => {
  const { notas } = useNotasPanel();

  const handleToggleCheck = async (notaId, itemIndex, currentItems) => {
    const nuevosItems = [...currentItems];
    nuevosItems[itemIndex] = {
      ...nuevosItems[itemIndex],
      completado: !nuevosItems[itemIndex].completado,
    };

    try {
      await updateDoc(doc(db, 'administracion_notas', notaId), {
        items: nuevosItems,
      });
      upsertLocal('notas', notaId, { items: nuevosItems });
    } catch (error) {
      console.error('Error al actualizar el checklist:', error);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-sm flex flex-col gap-2 h-full min-h-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2 flex-shrink-0">
        <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1.5 uppercase tracking-wide">
          <StickyNote size={13} className="text-[#2383C2]" /> Notas del Panel
        </span>
        <span className="text-[9px] bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded font-bold uppercase">
          {notas.length} {notas.length === 1 ? 'Nota' : 'Notas'}
        </span>
      </div>

      {/* Este contenedor absorbe todo el scroll interno de las notas */}
      <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto pr-1 h-full">
        {notas.length === 0 ? (
          <p className="text-[10.5px] text-gray-400 dark:text-gray-500 italic py-3 text-center">
            No hay notas ingresadas aún.
          </p>
        ) : (
          notas.map((nota) => {
            const visual = estiloVisualNota(nota);
            const claseTexto = visual.textoPropio ? '' : 'text-gray-600 dark:text-gray-300';
            return (
            <div
              key={nota.id}
              style={visual.contenedor}
              className={`p-2.5 border rounded flex flex-col gap-1.5 transition-colors flex-shrink-0 ${
                visual.fondoPropio
                  ? ''
                  : 'bg-gray-50 dark:bg-gray-900/50 border-gray-100 dark:border-gray-700/50 hover:border-gray-200 dark:hover:border-gray-600'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {nota.tipo === 'checklist' ? (
                  <CheckSquare size={13} className="text-[#2383C2] shrink-0" />
                ) : (
                  <AlignLeft size={13} className="text-[#2383C2] shrink-0" />
                )}
                {nota.titulo && (
                  <h4
                    style={visual.textoPropio ? { color: visual.texto.color } : undefined}
                    className={`text-[11px] font-bold truncate ${visual.textoPropio ? '' : 'text-gray-800 dark:text-gray-200'}`}
                  >
                    {nota.titulo}
                  </h4>
                )}
              </div>

              {nota.tipo === 'checklist' && nota.items ? (
                <div className="flex flex-col gap-1 my-0.5">
                  {nota.items.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleToggleCheck(nota.id, idx, nota.items)}
                      className="flex items-start gap-2 text-left group w-full"
                    >
                      <span className="mt-0.5 shrink-0 text-gray-400 group-hover:text-[#2383C2]">
                        {item.completado ? (
                          <div className="w-3.5 h-3.5 bg-emerald-500 text-white rounded flex items-center justify-center">
                            <Check size={10} strokeWidth={3} />
                          </div>
                        ) : (
                          <div className="w-3.5 h-3.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800" />
                        )}
                      </span>
                      <span
                        style={visual.texto}
                        className={`text-[10.5px] leading-tight ${
                          item.completado
                            ? `line-through ${visual.textoPropio ? 'opacity-60' : 'text-gray-400 dark:text-gray-500'}`
                            : claseTexto
                        }`}
                      >
                        {item.texto}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p style={visual.texto} className={`text-[10.5px] leading-relaxed whitespace-pre-wrap ${claseTexto}`}>
                  {nota.contenido}
                </p>
              )}

              <div
                style={visual.textoPropio ? { color: visual.texto.color } : undefined}
                className={`flex items-center justify-between border-t pt-1 mt-0.5 text-[8.5px] font-num ${
                  visual.fondoPropio
                    ? 'border-current/20 opacity-75'
                    : 'border-gray-200/40 dark:border-gray-700/40 text-gray-400 dark:text-gray-500'
                }`}
              >
                {nota.fecha?.seconds && (
                  <span>
                    {new Date(nota.fecha.seconds * 1000).toLocaleDateString('es-ES', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}
                {nota.autor && <span className="ml-auto">Por: {nota.autor}</span>}
              </div>
            </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default NuevoModuloCard;