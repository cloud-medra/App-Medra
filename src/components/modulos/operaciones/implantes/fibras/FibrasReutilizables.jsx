import { useMemo, useState } from 'react';
import { Cable, Plus, RefreshCw, ListOrdered, Pencil, MinusCircle } from 'lucide-react';
import { useGranularPermission } from '../../../../../hooks/useGranularPermission';
import { useColumnasPermitidas } from '../../../../../hooks/useColumnasPermitidas';
import { useColumnResize } from '../../../../../hooks/useColumnResize';
import { useUser } from '../../../../../context/UserContext';
import { ThRedimensionable, ColgroupRedimensionable, ThRelleno, TdRelleno } from '../../../../ui/ThRedimensionable';
import { BotonRestablecerAnchos } from '../../../../ui/BotonRestablecerAnchos';
import BuscadorConLimpiar from '../../../../ui/BuscadorConLimpiar';
import { formatearFechaTabla } from '../gestionImplantes/components/Cargastab/cargasHelpers';
import { ESTADO_FIBRA, estadoVisible, usosConsumidosDe, usosRestantes } from './fibrasNucleo';
import { useFibrasReutilizablesData } from './useFibrasReutilizablesData';
import { RegistrarFibraDialogo, EditarFibraDialogo, PerdidaDialogo, AnularPerdidaDialogo } from './DialogosFibra';
import DetalleFibra from './DetalleFibra';

// Implantes → Fibras: fibras láser reutilizables (5 o 10 usos). Cada fibra
// física tiene su código interno; sus usos se registran desde Gestiones
// (Cargas) y las pérdidas desde aquí. Reglas en fibrasNucleo.js.

const PATH_VISTA = '/implantes/fibrasReutilizables';
const COLUMNAS = [
  { key: 'codigo', label: 'Código', fija: true, ancho: 85, min: 70 },
  { key: 'referencia', label: 'Referencia', ancho: 100, min: 70 },
  { key: 'descriptor', label: 'Descripción', ancho: 230, min: 100 },
  { key: 'lote', label: 'Lote', ancho: 100, min: 60 },
  { key: 'vencimiento', label: 'Vencimiento', ancho: 95, min: 80 },
  { key: 'usos', label: 'Usos', ancho: 120, min: 90 },
  { key: 'restantes', label: 'Restantes', ancho: 80, min: 60 },
  { key: 'estado', label: 'Estado', ancho: 90, min: 70 },
  { key: 'acciones', label: 'Acciones', fija: true, ancho: 95, min: 80 },
];

const ESTILO_ESTADO = {
  [ESTADO_FIBRA.ACTIVA]: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
  [ESTADO_FIBRA.AGOTADA]: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600',
  [ESTADO_FIBRA.VENCIDA]: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800',
};
const ETIQUETA_ESTADO = { ACTIVA: 'Activa', AGOTADA: 'Agotada', VENCIDA: 'Vencida' };

const TH = 'px-2 py-1.5 text-left text-[10px] font-bold uppercase text-slate-500 dark:text-gray-400 border-b border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900/60 sticky top-0 z-10';
const TD = 'px-2 py-1.5 border-b border-slate-100 dark:border-gray-700/60 truncate';

const FibrasReutilizables = () => {
  const { hasPermission } = useGranularPermission();
  const { userData } = useUser();
  const { fibras, hoy, recargar, registrar, editar, registrarPerdida, anularPerdida, leerUsos } = useFibrasReutilizablesData();
  const { columnasVisibles } = useColumnasPermitidas(PATH_VISTA, 'tabla_fibras', COLUMNAS);
  const { anchos, handleResize, restablecerAnchos, personalizados } = useColumnResize(columnasVisibles, { clave: 'implantes.fibras', usuario: userData?.uid });

  const [texto, setTexto] = useState('');
  const [filtroEstado, setFiltroEstado] = useState(ESTADO_FIBRA.ACTIVA);
  const [dialogo, setDialogo] = useState(null); // { tipo, fibra?, uso? }
  const [detalle, setDetalle] = useState(null);
  const [versionDetalle, setVersionDetalle] = useState(0);

  const puede = (seccion, accion) => hasPermission(PATH_VISTA, seccion, accion);

  const filtradas = useMemo(() => {
    const t = texto.trim().toUpperCase();
    return (fibras || [])
      .map((f) => ({ ...f, estadoVisible: estadoVisible(f, hoy) }))
      .filter((f) => !filtroEstado || f.estadoVisible === filtroEstado)
      .filter((f) => !t || [f.codigoInterno, f.referencia, f.lote, f.descriptor].some((v) => String(v || '').toUpperCase().includes(t)))
      .sort((a, b) => (a.codigoInterno || '').localeCompare(b.codigoInterno || ''));
  }, [fibras, hoy, texto, filtroEstado]);

  const conteo = useMemo(() => {
    const c = { ACTIVA: 0, AGOTADA: 0, VENCIDA: 0 };
    (fibras || []).forEach((f) => { c[estadoVisible(f, hoy)]++; });
    return c;
  }, [fibras, hoy]);

  // Tras una acción sobre la fibra abierta en Detalle, se relee su detalle.
  const despuesDeAccion = (ok) => { if (ok) setVersionDetalle((v) => v + 1); return ok; };
  const fibraActual = (f) => (fibras || []).find((x) => x.id === f?.id) || f;

  const celda = (f, key) => {
    switch (key) {
      case 'codigo': return <span className="font-mono font-bold text-[#2383C2]">{f.codigoInterno}</span>;
      case 'referencia': return f.referencia;
      case 'descriptor': return <span title={f.descriptor}>{f.descriptor}</span>;
      case 'lote': return f.lote;
      case 'vencimiento': return formatearFechaTabla(f.vencimiento);
      case 'usos': {
        const pct = Math.round((usosConsumidosDe(f) / f.usosTotales) * 100);
        return (
          <span className="flex items-center gap-1.5">
            <span className="font-num font-semibold">{usosConsumidosDe(f)}/{f.usosTotales}</span>
            <span className="flex-1 h-1.5 rounded bg-slate-200 dark:bg-gray-700 overflow-hidden" aria-hidden>
              <span className={`block h-full ${usosRestantes(f) <= 1 ? 'bg-amber-500' : 'bg-teal-600'}`} style={{ width: `${pct}%` }} />
            </span>
          </span>
        );
      }
      case 'restantes': return <span className={`font-num font-bold ${usosRestantes(f) === 1 ? 'text-amber-600' : ''}`}>{usosRestantes(f)}</span>;
      case 'estado': return <span className={`inline-flex px-1.5 py-0.5 rounded border text-[9px] font-bold ${ESTILO_ESTADO[f.estadoVisible]}`}>{ETIQUETA_ESTADO[f.estadoVisible]}</span>;
      case 'acciones': return (
        <span className="flex items-center gap-1">
          {puede('tabla_fibras', 'action_ver_detalle') && (
            <button type="button" onClick={() => setDetalle(f)} title="Detalle de usos" aria-label={`Detalle ${f.codigoInterno}`} className="p-0.5 text-[#2383C2] hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded"><ListOrdered size={13} /></button>
          )}
          {puede('tabla_fibras', 'action_editar') && (
            <button type="button" onClick={() => setDialogo({ tipo: 'editar', fibra: f })} title="Corregir" aria-label={`Corregir ${f.codigoInterno}`} className="p-0.5 text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700 rounded"><Pencil size={12} /></button>
          )}
          {puede('tabla_fibras', 'action_registrar_perdida') && usosRestantes(f) > 0 && (
            <button type="button" onClick={() => setDialogo({ tipo: 'perdida', fibra: f })} title="Registrar pérdida de un uso" aria-label={`Registrar pérdida ${f.codigoInterno}`} className="p-0.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded"><MinusCircle size={13} /></button>
          )}
        </span>
      );
      default: return null;
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden text-[11px]">
      <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="text-[12px] font-bold text-gray-700 dark:text-gray-100 flex items-center gap-1.5 uppercase"><Cable size={14} className="text-[#2383C2]" /> Fibras reutilizables</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <select aria-label="Estado" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="h-7 px-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900">
            <option value={ESTADO_FIBRA.ACTIVA}>Activas ({conteo.ACTIVA})</option>
            <option value={ESTADO_FIBRA.VENCIDA}>Vencidas ({conteo.VENCIDA})</option>
            <option value={ESTADO_FIBRA.AGOTADA}>Agotadas ({conteo.AGOTADA})</option>
            <option value="">Todas ({(fibras || []).length})</option>
          </select>
          <BuscadorConLimpiar value={texto} onChange={setTexto} className="w-56" placeholder="Buscar código, referencia, lote…" />
          <button type="button" onClick={recargar} className="h-7 px-2 rounded border border-gray-300 dark:border-gray-600 font-semibold flex items-center gap-1 text-gray-600 dark:text-gray-300"><RefreshCw size={12} /> Actualizar</button>
          {puede('encabezado', 'btn_registrar_fibra') && (
            <button type="button" onClick={() => setDialogo({ tipo: 'registrar' })} className="h-7 px-2.5 rounded bg-[#2383C2] hover:bg-[#1d6fa5] text-white font-semibold flex items-center gap-1"><Plus size={13} /> Registrar fibra</button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 flex flex-col gap-1.5">
        <div className="flex justify-end"><BotonRestablecerAnchos onClick={restablecerAnchos} personalizados={personalizados} /></div>
        <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto">
          <table className="border-collapse" style={{ tableLayout: 'fixed', minWidth: '100%' }}>
            <ColgroupRedimensionable columnas={columnasVisibles} anchos={anchos} relleno />
            <thead>
              <tr>
                {columnasVisibles.map((col) => (
                  <ThRedimensionable key={col.key} col={col} anchos={anchos} onResize={handleResize} className={TH}>{col.label}</ThRedimensionable>
                ))}
                <ThRelleno className={TH} />
              </tr>
            </thead>
            <tbody>
              {fibras === null ? (
                <tr><td colSpan={columnasVisibles.length + 1} className={`${TD} text-slate-400 italic`}>Cargando…</td></tr>
              ) : filtradas.length === 0 ? (
                <tr><td colSpan={columnasVisibles.length + 1} className={`${TD} text-slate-400 italic`}>No hay fibras con este filtro.</td></tr>
              ) : filtradas.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50 dark:hover:bg-gray-700/30">
                  {columnasVisibles.map((col) => <td key={col.key} className={TD}>{celda(f, col.key)}</td>)}
                  <TdRelleno className="border-b border-slate-100 dark:border-gray-700/60" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detalle && (
        <DetalleFibra
          fibra={fibraActual(detalle)}
          leerUsos={leerUsos}
          version={versionDetalle}
          onAnularPerdida={(uso) => setDialogo({ tipo: 'anular', fibra: fibraActual(detalle), uso })}
          onCerrar={() => setDetalle(null)}
        />
      )}

      {dialogo?.tipo === 'registrar' && <RegistrarFibraDialogo onGuardar={registrar} onCerrar={() => setDialogo(null)} />}
      {dialogo?.tipo === 'editar' && (
        <EditarFibraDialogo fibra={dialogo.fibra} onGuardar={(valores) => editar(dialogo.fibra.id, valores)} onCerrar={() => setDialogo(null)} />
      )}
      {dialogo?.tipo === 'perdida' && (
        <PerdidaDialogo fibra={dialogo.fibra} onGuardar={async (motivo) => despuesDeAccion(await registrarPerdida(dialogo.fibra.id, motivo))} onCerrar={() => setDialogo(null)} />
      )}
      {dialogo?.tipo === 'anular' && (
        <AnularPerdidaDialogo fibra={dialogo.fibra} uso={dialogo.uso} onGuardar={async (motivo) => despuesDeAccion(await anularPerdida(dialogo.fibra.id, dialogo.uso.id, motivo))} onCerrar={() => setDialogo(null)} />
      )}
    </div>
  );
};

export default FibrasReutilizables;
