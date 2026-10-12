import { useState } from 'react';
import { Hash, X, CheckCircle2, SearchX, Building2, Scale, GitFork, UserCheck, AlertTriangle, ChevronDown, ChevronUp, ArrowRightLeft } from 'lucide-react';
import { formatearFechaTabla } from '../../implantes/gestionImplantes/components/Cargastab/cargasHelpers';

const TIPOS = {
  SIN_COINCIDENCIA: { label: 'Sin coincidencia', clase: 'text-slate-600 dark:text-gray-300' },
  EMPRESA_NO_RECONOCIDA: { label: 'Empresa no reconocida', clase: 'text-amber-700 dark:text-amber-400' },
  CANTIDAD_DISTINTA: { label: 'Cantidad distinta', clase: 'text-rose-700 dark:text-rose-400' },
  AMBIGUA: { label: 'Ambigua', clase: 'text-purple-700 dark:text-purple-400' },
  REVISAR_NOMBRE: { label: 'Revisar nombre (OC asignada)', clase: 'text-sky-700 dark:text-sky-400' }
};

const observacion = (fila, modulo) => {
  if (fila.tipo === 'EMPRESA_NO_RECONOCIDA') return `${modulo}: ${fila.empresa} · Excel: ${fila.empresasExcel.join(', ')}`;
  if (fila.tipo === 'CANTIDAD_DISTINTA') return `Mismo código y empresa, pero cantidad Excel ${fila.cantidadExcel} vs ${modulo} ${fila.cantidadImplantes} (suma por código)`;
  if (fila.tipo === 'AMBIGUA') return `OC posibles: ${fila.ocs.join(', ')}`;
  if (fila.tipo === 'REVISAR_NOMBRE') return `OC ${fila.oc} · Excel: ${fila.pacienteExcel || '—'}`;
  return 'No está en el índice (admisión + fecha + código)';
};

const Contador = ({ Icon, valor, label, clase }) => (
  <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-slate-200 dark:border-gray-700 ${clase}`}>
    <Icon size={13} className="shrink-0" />
    <span className="font-bold text-[12px]">{valor}</span>
    <span className="text-[10px]">{label}</span>
  </div>
);

// `modulo` y `unidad` adaptan los textos: Implantes revisa gestiones;
// Consignación, registros (un ítem cada uno).
export const SincronizarOCResumenModal = ({ resumen, onClose, modulo = 'Implantes', unidad = 'gestión(es)' }) => {
  const [verDetalle, setVerDetalle] = useState(false);
  if (!resumen) return null;
  const { contadores, detalle, erroresEscritura, invalidacion } = resumen;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-[1px] p-4">
      <div className="bg-white dark:bg-gray-800 w-full max-w-4xl max-h-[85vh] flex flex-col rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2 bg-gray-50/60 dark:bg-gray-900/40">
          <Hash size={16} className="text-[#2383C2] shrink-0" />
          <h3 className="text-[12px] font-bold text-gray-800 dark:text-gray-100">Resultado de Sincronizar OC</h3>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition" aria-label="Cerrar">
            <X size={15} />
          </button>
        </div>

        <div className="px-4 py-3 flex flex-col gap-3 overflow-auto text-[11px]">
          <p className="text-gray-600 dark:text-gray-300">
            Se revisaron <strong>{resumen.gestionesRevisadas}</strong> {unidad} con OC pendiente;
            se guardaron OC en <strong>{resumen.gestionesActualizadas}</strong>.
          </p>

          {invalidacion && (
            <div className={`flex items-start gap-1.5 rounded px-2.5 py-1.5 border ${invalidacion.error
              ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40'
              : 'text-sky-800 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/20 border-sky-200 dark:border-sky-900/40'}`}>
              <ArrowRightLeft size={13} className="shrink-0 mt-0.5" />
              {invalidacion.error ? (
                <span>
                  No se pudieron aplicar {invalidacion.correcciones} corrección(es) pendiente(s) de OC cambiadas: {invalidacion.error} Siguen pendientes para la próxima sincronización.
                </span>
              ) : (
                <span>
                  Se aplicaron <strong>{invalidacion.correcciones}</strong> corrección(es) pendiente(s) de OC cambiadas (de una importación de Detalles OC):
                  se quitó la OC antigua de <strong>{invalidacion.itemsLiberados}</strong> ítem(s) en <strong>{invalidacion.gestionesActualizadas}</strong> gestión(es),
                  que entraron en esta sincronización para recibir la OC nueva.
                </span>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Contador Icon={CheckCircle2} valor={resumen.itemsActualizados} label="filas actualizadas" clase="text-emerald-700 dark:text-emerald-400" />
            <Contador Icon={SearchX} valor={contadores.sinCoincidencia} label="sin coincidencia" clase="text-slate-600 dark:text-gray-300" />
            <Contador Icon={Building2} valor={contadores.empresaNoReconocida} label="empresa no reconocida" clase="text-amber-700 dark:text-amber-400" />
            <Contador Icon={Scale} valor={contadores.cantidadDistinta} label="cantidad distinta" clase="text-rose-700 dark:text-rose-400" />
            <Contador Icon={GitFork} valor={contadores.ambiguas} label="ambiguas" clase="text-purple-700 dark:text-purple-400" />
            <Contador Icon={UserCheck} valor={contadores.revisarNombre} label="revisar nombre" clase="text-sky-700 dark:text-sky-400" />
          </div>

          {erroresEscritura.length > 0 && (
            <div className="flex items-start gap-1.5 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded px-2.5 py-1.5">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span>
                {erroresEscritura.length} {unidad} no se pudieron guardar ({erroresEscritura[0].error}). Quedan pendientes: vuelve a sincronizar.
              </span>
            </div>
          )}

          <div className="text-[10px] text-gray-400 dark:text-gray-500">
            Firestore: ~{resumen.lecturasFirestore} lectura(s) · ~{resumen.escriturasFirestore} escritura(s)
          </div>

          {detalle.length > 0 && (
            <div className="border border-slate-200 dark:border-gray-700 rounded">
              <button
                type="button"
                onClick={() => setVerDetalle(v => !v)}
                className="w-full flex items-center gap-1.5 px-2.5 py-1.5 font-semibold text-[#2383C2] hover:bg-slate-50 dark:hover:bg-gray-700/40 transition"
              >
                {verDetalle ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                {verDetalle ? 'Ocultar' : 'Ver'} detalle de filas no asignadas o por revisar ({detalle.length})
              </button>
              {verDetalle && (
                <div className="overflow-auto max-h-[45vh]">
                  <table className="w-full text-left text-[10px] border-collapse">
                    <thead className="bg-slate-50 dark:bg-gray-900/60 sticky top-0">
                      <tr className="text-slate-500 dark:text-gray-400 uppercase font-bold text-[9px]">
                        <th className="px-2 py-1.5 border-b border-slate-200 dark:border-gray-700">Admisión</th>
                        <th className="px-2 py-1.5 border-b border-slate-200 dark:border-gray-700">Paciente</th>
                        <th className="px-2 py-1.5 border-b border-slate-200 dark:border-gray-700">Fecha</th>
                        <th className="px-2 py-1.5 border-b border-slate-200 dark:border-gray-700">Empresa</th>
                        <th className="px-2 py-1.5 border-b border-slate-200 dark:border-gray-700">Código</th>
                        <th className="px-2 py-1.5 border-b border-slate-200 dark:border-gray-700 text-center">Cant.</th>
                        <th className="px-2 py-1.5 border-b border-slate-200 dark:border-gray-700">Motivo</th>
                        <th className="px-2 py-1.5 border-b border-slate-200 dark:border-gray-700">Observación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalle.map((fila, i) => (
                        <tr key={`${fila.refPath}_${fila.codigo}_${i}`} className="hover:bg-gray-50/80 dark:hover:bg-gray-700/40">
                          <td className="px-2 py-1 border-b border-slate-100 dark:border-gray-700/60 font-num">{fila.admision}</td>
                          <td className="px-2 py-1 border-b border-slate-100 dark:border-gray-700/60">{fila.nombre}</td>
                          <td className="px-2 py-1 border-b border-slate-100 dark:border-gray-700/60">{formatearFechaTabla(fila.fecha)}</td>
                          <td className="px-2 py-1 border-b border-slate-100 dark:border-gray-700/60">{fila.empresa}</td>
                          <td className="px-2 py-1 border-b border-slate-100 dark:border-gray-700/60 font-num">{fila.codigo}</td>
                          <td className="px-2 py-1 border-b border-slate-100 dark:border-gray-700/60 text-center">{fila.cantidad}</td>
                          <td className={`px-2 py-1 border-b border-slate-100 dark:border-gray-700/60 font-semibold ${TIPOS[fila.tipo]?.clase || ''}`}>{TIPOS[fila.tipo]?.label || fila.tipo}</td>
                          <td className="px-2 py-1 border-b border-slate-100 dark:border-gray-700/60 text-slate-500 dark:text-gray-400">{observacion(fila, modulo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-4 py-2.5 bg-gray-50/60 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="h-7 px-4 bg-[#2383C2] hover:bg-[#1d6fa5] text-white rounded font-semibold transition text-[11px]"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
