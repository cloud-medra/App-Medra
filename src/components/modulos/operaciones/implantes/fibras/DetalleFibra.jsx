import { useEffect, useState } from 'react';
import { X, Loader2, Undo2 } from 'lucide-react';
import { useGranularPermission } from '../../../../../hooks/useGranularPermission';
import { useColumnasPermitidas } from '../../../../../hooks/useColumnasPermitidas';
import { useColumnResize } from '../../../../../hooks/useColumnResize';
import { ThRedimensionable, ColgroupRedimensionable, ThRelleno, TdRelleno } from '../../../../ui/ThRedimensionable';
import {
  ordenarUsos, TIPO_USO, ESTADO_USO, TEXTO_MOTIVO_ANULACION, ubicacionDe, textoFibra, usosRealizadosDe, numerosPerdidosDe, textoNumeros,
} from './fibrasNucleo';
import NombreFibra from './NombreFibra';
import { formatearFechaTabla } from '../gestionImplantes/components/Cargastab/cargasHelpers';

const PATH_VISTA = '/implantes/fibrasReutilizables';
const COLUMNAS_DETALLE = [
  { key: 'numero', label: 'Uso', fija: true, ancho: 60, min: 50 },
  { key: 'tipo', label: 'Tipo', ancho: 210, min: 90 },
  { key: 'fecha', label: 'Fecha', ancho: 85, min: 70 },
  { key: 'gestionId', label: 'ID gestión', ancho: 85, min: 60 },
  { key: 'paciente', label: 'Paciente', ancho: 190, min: 90 },
  { key: 'medico', label: 'Médico', ancho: 190, min: 90 },
  { key: 'registradoPor', label: 'Registrado por', ancho: 150, min: 80 },
  { key: 'estado', label: 'Estado', ancho: 200, min: 80 },
  { key: 'acciones', label: '', fija: true, ancho: 40, min: 40 },
];

const TH = 'px-2 py-1.5 text-left text-pequeno uppercase text-tinta-secundaria border-b border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900/60';
const TD = 'px-2 py-1.5 border-b border-slate-100 dark:border-gray-700/60 truncate';

// Movimientos de ubicación (logs de la fibra) en palabras.
const TEXTO_MOVIMIENTO = {
  PUESTA_EN_USO: 'Puesta en uso',
  DEVUELTA_A_BODEGA: 'Devuelta a bodega',
  SALIDA_DE_USO: 'Fuera de uso (agotada o perdida)',
  UBICACION_INICIAL: 'Ubicación inicial',
};
const fechaCorta = (t) => {
  const d = t?.toDate ? t.toDate() : null;
  return d ? d.toLocaleDateString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
};
const textoMovimiento = (m) => {
  const base = m.accion === 'UBICACION_INICIAL' ? `Ubicación inicial: ${(m.detalles?.a || '').toLowerCase()}` : TEXTO_MOVIMIENTO[m.accion] || m.accion;
  return `${base} el ${fechaCorta(m.timestamp)} por ${m.usuario || ''}${m.detalles?.motivo ? ` (${m.detalles.motivo})` : ''}`;
};

const fechaHora = (t) => {
  const d = t?.toDate ? t.toDate() : null;
  return d ? d.toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' }) : '';
};

/**
 * Detalle de una fibra: todos sus usos y pérdidas en orden de número (el
 * mismo que muestra la línea de la gestión). Los anulados quedan tachados con
 * su motivo. `onAnularPerdida(uso)` solo si el usuario tiene la acción.
 */
const DetalleFibra = ({ fibra, leerUsos, leerMovimientos, version, onAnularPerdida, onCerrar }) => {
  const { hasPermission } = useGranularPermission();
  const { columnasVisibles } = useColumnasPermitidas(PATH_VISTA, 'detalle_usos', COLUMNAS_DETALLE);
  const { anchos, handleResize } = useColumnResize(columnasVisibles);
  // Usos leídos, con la clave (fibra y versión) que los pidió: mientras no
  // coincida con la actual se muestra "Cargando".
  const clave = `${fibra.id}:${version}`;
  const [leidos, setLeidos] = useState({ clave: '', usos: [], movimientos: [] });
  const usos = leidos.clave === clave ? leidos.usos : null;
  const movimientos = leidos.clave === clave ? leidos.movimientos : [];
  const puedeAnular = hasPermission(PATH_VISTA, 'tabla_fibras', 'action_anular_perdida') && Boolean(onAnularPerdida);

  useEffect(() => {
    let vigente = true;
    Promise.all([leerUsos(fibra.id), leerMovimientos ? leerMovimientos(fibra.id).catch(() => []) : []])
      .then(([lista, movs]) => { if (vigente) setLeidos({ clave, usos: ordenarUsos(lista), movimientos: movs }); })
      .catch(() => { if (vigente) setLeidos({ clave, usos: [], movimientos: [] }); });
    return () => { vigente = false; };
  }, [fibra.id, leerUsos, leerMovimientos, clave]);

  const celda = (u, key) => {
    const anulado = u.estado === ESTADO_USO.ANULADO;
    const perdida = u.tipo === TIPO_USO.PERDIDA;
    // Pérdida nueva: todos los números perdidos en una fila; antigua: uno.
    const numeros = u.numerosPerdidos || [u.numeroUso];
    switch (key) {
      case 'numero': return <span className={`text-numero-tabla ${anulado ? 'line-through text-tinta-atenuada' : ''}`} title={textoNumeros(numeros, u.usosTotales)}>{numeros.length > 1 ? `${numeros[0]}–${numeros[numeros.length - 1]}` : numeros[0]}/{u.usosTotales}</span>;
      case 'tipo': return perdida
        ? (
          <span className="text-red-700 dark:text-red-400 text-etiqueta" title={[u.motivo, u.observacion].filter(Boolean).join(' · ')}>
            {u.numerosPerdidos ? `Pérdida de ${numeros.length} uso${numeros.length === 1 ? '' : 's'}` : 'Pérdida'}: {u.motivo}{u.observacion ? ` · ${u.observacion}` : ''}
          </span>
        )
        : <span>Uso en gestión</span>;
      case 'fecha': return formatearFechaTabla(u.fecha);
      case 'gestionId': return perdida ? '—' : u.gestionId;
      case 'paciente': return perdida ? '—' : u.paciente;
      case 'medico': return perdida ? '—' : u.medico;
      case 'registradoPor': return <span title={fechaHora(u.registradoEl)}>{u.registradoPor?.nombre || ''}</span>;
      case 'estado': return anulado
        ? <span className="text-tinta-secundaria" title={`${fechaHora(u.anuladoEl)} · ${u.anuladoPor?.nombre || ''}`}>Anulado: {TEXTO_MOTIVO_ANULACION[u.motivoAnulacion] || u.motivoAnulacion}{u.detalleAnulacion ? ` (${u.detalleAnulacion})` : ''}</span>
        : <span className="text-emerald-700 dark:text-emerald-400 text-etiqueta">Vigente</span>;
      case 'acciones': return puedeAnular && perdida && !anulado
        ? <button type="button" onClick={() => onAnularPerdida(u)} title="Anular pérdida" aria-label={`Anular pérdida ${u.numeroUso}`} className="text-red-600 hover:text-red-800 p-0.5"><Undo2 size={13} /></button>
        : null;
      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onCerrar}>
      <div className="h-full w-full max-w-5xl bg-white dark:bg-gray-800 shadow-xl flex flex-col text-secundario" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Detalle ${textoFibra(fibra)}`}>
        <div className="px-4 py-3 border-b border-slate-200 dark:border-gray-700 flex items-start justify-between gap-2">
          <div>
            <h3 className="text-subtitulo"><NombreFibra fibra={fibra} claseReferencia="text-etiqueta text-tinta-principal" /></h3>
            <p className="text-tinta-secundaria">
              Lote {fibra.lote} · vence {formatearFechaTabla(fibra.vencimiento)} · {ubicacionDe(fibra).toLowerCase()}
            </p>
            {/* Usos reales y perdidos por separado. */}
            <p className="text-tinta-principal text-etiqueta">
              {usosRealizadosDe(fibra)} uso{usosRealizadosDe(fibra) === 1 ? '' : 's'} realizado{usosRealizadosDe(fibra) === 1 ? '' : 's'} de {fibra.usosTotales}
              {numerosPerdidosDe(fibra).length > 0 && (
                <span className="text-red-700 dark:text-red-400">
                  {' · '}{numerosPerdidosDe(fibra).length} perdido{numerosPerdidosDe(fibra).length === 1 ? '' : 's'} ({textoNumeros(numerosPerdidosDe(fibra), fibra.usosTotales)})
                  {' '}<span className="px-1 rounded text-pequeno bg-red-600 text-white">Pérdida</span>
                </span>
              )}
            </p>
            {movimientos.length > 0 && (
              <ul className="mt-1.5 text-pequeno text-tinta-secundaria space-y-0.5" aria-label="Movimientos de ubicación">
                {movimientos.map((m) => <li key={m.id}>{textoMovimiento(m)}</li>)}
              </ul>
            )}
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-tinta-atenuada hover:text-tinta-secundaria"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-auto p-3">
          {usos === null ? (
            <p className="text-tinta-atenuada flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Cargando usos…</p>
          ) : (
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
                {Number(fibra.usosPrevios) > 0 && (
                  <tr className="bg-slate-50/70 dark:bg-gray-900/30">
                    <td colSpan={columnasVisibles.length + 1} className={`${TD} text-tinta-secundaria italic`}>
                      Usos 1{Number(fibra.usosPrevios) > 1 ? `–${fibra.usosPrevios}` : ''}/{fibra.usosTotales}: previos al registro en el sistema (sin detalle).
                    </td>
                  </tr>
                )}
                {usos.length === 0 && (
                  <tr><td colSpan={columnasVisibles.length + 1} className={`${TD} text-tinta-atenuada italic`}>Sin usos registrados en el sistema.</td></tr>
                )}
                {usos.map((u) => (
                  <tr key={u.id} className={u.estado === ESTADO_USO.ANULADO ? 'opacity-60' : u.tipo === TIPO_USO.PERDIDA ? 'bg-red-50/50 dark:bg-red-950/10' : ''}>
                    {columnasVisibles.map((col) => <td key={col.key} className={TD}>{celda(u, col.key)}</td>)}
                    <TdRelleno className="border-b border-slate-100 dark:border-gray-700/60" />
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default DetalleFibra;
