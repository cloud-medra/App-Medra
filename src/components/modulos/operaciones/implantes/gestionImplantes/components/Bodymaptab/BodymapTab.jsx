import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { PersonStanding, AlertTriangle, ArrowRight, Loader2, Info } from 'lucide-react';
import { db } from '../../../../../../../firebaseConfig';
import { useGranularPermission } from '../../../../../../../hooks/useGranularPermission';
import CuerpoCompleto from '../../../../../../ui/bodymap/CuerpoCompleto';
import DetalleZona from '../../../../../../ui/bodymap/DetalleZona';
import {
  nombreZona, esSinZonaEspecifica, nombreLado, ladoEfectivo, esDescripcionValida, normalizarDescripcion, idDescripcion, ESTADOS, LADO_POR_DEFECTO,
} from '../../../../../../../../functions/bodymap/nucleo.mjs';

// Implantes → Gestiones → "Bodymap": la(s) zona(s) del cuerpo de la gestión
// según su descripción (Maestro "Zonas por diagnóstico",
// maestros_zonas_diagnostico), en el cuerpo completo (anterior y posterior)
// y en un detalle por zona ("Sin zona específica": solo un aviso, sin cuerpo). El lado: el de la gestión ("Lado" en
// Información) y, si no lo especifica, el del Maestro; sin lado se
// resaltan ambos. Escucha solo el documento de esa descripción.

const RUTA_MAESTRO = '/maestros/zonasDiagnostico';
const COLECCION = 'maestros_zonas_diagnostico';

export const BodymapTab = ({ descripcion, lado: ladoGestion, onAbrirMaestro }) => {
  const { hasPermission } = useGranularPermission();
  const valida = esDescripcionValida(descripcion);
  const id = valida ? idDescripcion(descripcion) : null;
  const [estado, setEstado] = useState({ id: null, entrada: undefined });

  useEffect(() => {
    if (!id) return undefined;
    return onSnapshot(
      doc(db, COLECCION, id),
      (snap) => setEstado({ id, entrada: snap.exists() ? snap.data() : null }),
      (err) => { console.error('Error al leer la zona de la descripción:', err); setEstado({ id, entrada: null }); }
    );
  }, [id]);

  const cargando = valida && estado.id !== id;
  const entrada = estado.id === id ? estado.entrada : undefined;
  const zonas = entrada?.zonas || [];
  const sinZonaEspecifica = esSinZonaEspecifica(zonas);
  const lado = ladoEfectivo(ladoGestion, entrada?.lado);
  const puedeAsignar = Boolean(onAbrirMaestro) && hasPermission(RUTA_MAESTRO, 'tabla_datos', 'action_editar');

  return (
    <div className="flex flex-col gap-3 text-[11.5px]">
      <section className="rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-gray-700 bg-slate-50 dark:bg-gray-900/40">
          <PersonStanding size={13} className="text-[#2383C2]" />
          <h3 className="text-[11px] font-bold text-slate-700 dark:text-gray-200 uppercase tracking-wide">Bodymap</h3>
        </div>
        <div className="p-3 flex flex-col gap-1">
          <p className="text-gray-500 dark:text-gray-400">Descripción</p>
          <p className="text-[13px] font-semibold text-gray-800 dark:text-gray-100 break-words">{valida ? normalizarDescripcion(descripcion) : 'Sin descripción'}</p>
          {zonas.length > 0 && (
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-gray-600 dark:text-gray-300">
              <span>Zona{zonas.length > 1 ? 's' : ''}:</span>
              {zonas.map((z) => <span key={z} className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-[#2383C2]/10 text-[#1d6fa5] dark:text-blue-300">{nombreZona(z)}</span>)}
              {!sinZonaEspecifica && (
                <>
                  <span className="text-gray-400">·</span>
                  <span>Lado: <b>{nombreLado(lado)}</b>{ladoGestion && ladoGestion !== LADO_POR_DEFECTO ? ' (de la gestión)' : ''}</span>
                </>
              )}
              {entrada?.estado === ESTADOS.SUGERIDA && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" title="Asignada automáticamente por palabras clave; aún no confirmada en el Maestro">Sugerida</span>}
            </p>
          )}
          {zonas.length > 0 && !sinZonaEspecifica && lado === LADO_POR_DEFECTO && (
            <p className="text-amber-700 dark:text-amber-400 flex items-center gap-1"><Info size={12} /> Lado no especificado: se resaltan ambos lados.</p>
          )}
        </div>
      </section>

      {!valida ? (
        <p className="rounded-lg border border-slate-200 dark:border-gray-700 px-3 py-6 text-center text-gray-500">Esta gestión no tiene descripción: complétala en Información para ver su zona.</p>
      ) : cargando ? (
        <p className="py-10 text-center text-gray-400"><Loader2 size={14} className="inline animate-spin mr-1" />Cargando…</p>
      ) : sinZonaEspecifica ? (
        <p className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-gray-700 px-3 py-6 text-center text-gray-500 dark:text-gray-400">
          <Info size={13} className="shrink-0" /> Diagnóstico sin zona específica: depende de cada caso.
        </p>
      ) : zonas.length === 0 ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-3 text-amber-900 dark:text-amber-200">
          <AlertTriangle size={15} className="shrink-0" />
          <span className="flex-1 min-w-0">Esta descripción aún no tiene una zona asignada.</span>
          {puedeAsignar && (
            <button type="button" onClick={() => onAbrirMaestro(normalizarDescripcion(descripcion))} className="inline-flex items-center gap-1 font-semibold text-[#1d6fa5] dark:text-blue-300 hover:underline">
              Asignar en Zonas por diagnóstico <ArrowRight size={12} />
            </button>
          )}
        </div>
      ) : (
        <>
          <section className="rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3" aria-label="Cuerpo completo">
            <CuerpoCompleto zonas={zonas} lado={lado} />
          </section>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {zonas.map((z) => <DetalleZona key={z} zona={z} lado={lado} />)}
          </div>
        </>
      )}
    </div>
  );
};

export default BodymapTab;
