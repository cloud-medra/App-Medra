import { useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, AlertTriangle, Lock, FileSearch } from 'lucide-react';
import { useToast } from '../../../../../context/ToastContext';
import { CotizacionCard } from '../../implantes/gestionImplantes/components/Cargastab/CotizacionCard';
import NotasAdmision from '../../implantes/gestionImplantes/components/Cargastab/NotasAdmision';
import { formatearFechaTabla } from '../../implantes/gestionImplantes/components/Cargastab/cargasHelpers';
import { periodosImputacionDeBloque } from '../../shared/periodoImputacion';
import { formatearPesos } from '../../../../../utils/formatearMoneda';
import BadgeGestionImplante from './BadgeGestionImplante';
import {
  cargarDetalleAdmision, estadoGestion, resumenCarga, ETIQUETAS_ESTADO, CLASE_GESTION,
} from './gestionImplante';

// Reporte Info → detalle de la gestión de una admisión, sin salir de Reporte
// Info (reemplaza la tabla hasta "Volver"). Solo lectura: reutiliza las
// tarjetas de Cargas (CotizacionCard en modoLectura) y "Notas de la
// admisión". Los datos se leen solo al abrirlo: la marca de la admisión y
// cada una de sus gestiones por su ruta. `fila`: la fila de Reporte Info de
// donde se abrió (paciente / médico de respaldo; null si se abrió desde la
// URL). `onAbrirEnGestiones` (solo con permiso): enlace secundario a
// Implantes → Gestiones.

const noop = () => {};
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const util = (t) => {
  const s = String(t ?? '').trim();
  return s && s !== 'P' && s !== 'Cargando...' ? s : '';
};
const textoPeriodo = (datos) => {
  const items = (datos?.cotizaciones || []).flatMap((c) => c.items || []);
  const lista = periodosImputacionDeBloque(datos, items)
    .sort((a, b) => `${a.anio}${String(MESES.indexOf(a.mes)).padStart(2, '0')}`.localeCompare(`${b.anio}${String(MESES.indexOf(b.mes)).padStart(2, '0')}`))
    .map((p) => `${p.mes.charAt(0).toUpperCase()}${p.mes.slice(1)} ${p.anio}`);
  return lista.join(', ');
};

const Dato = ({ etiqueta, valor }) => (
  <div className="min-w-0">
    <dt className="text-pequeno uppercase tracking-wide text-tinta-atenuada">{etiqueta}</dt>
    <dd className="text-secundario text-tinta-principal truncate" title={valor || undefined}>{valor || '—'}</dd>
  </div>
);

const Cifra = ({ etiqueta, valor, clase = 'text-tinta-principal' }) => (
  <div className="px-3 py-1.5 border-r last:border-r-0 border-slate-200 dark:border-gray-700">
    <p className="text-pequeno uppercase tracking-wide text-tinta-atenuada">{etiqueta}</p>
    <p className={`text-subtitulo tabular-nums ${clase}`}>{valor}</p>
  </div>
);

const DetalleGestionReporte = ({ admision, fila, onVolver, onAbrirEnGestiones }) => {
  const { showToast } = useToast();
  const [detalle, setDetalle] = useState(null);
  const [error, setError] = useState(false);
  const [seleccion, setSeleccion] = useState(0);

  useEffect(() => {
    let activo = true;
    cargarDetalleAdmision(admision)
      .then((d) => { if (activo) setDetalle(d); })
      .catch((err) => { console.error('Error al cargar la gestión:', err); if (activo) setError(true); });
    return () => { activo = false; };
  }, [admision]);

  const copiar = (texto) => {
    navigator.clipboard?.writeText(texto)
      .then(() => showToast('Texto copiado', 'success'))
      .catch(() => showToast('No se pudo copiar', 'error'));
  };

  const gestiones = detalle?.gestiones || [];
  const existentes = gestiones.filter((g) => g.datos);
  const actual = existentes[Math.min(seleccion, existentes.length - 1)] || null;
  const datos = actual?.datos || null;
  const resumen = datos ? resumenCarga(datos) : null;
  const faltantes = gestiones.length - existentes.length;

  let cuerpo;
  if (error) {
    cuerpo = <Aviso titulo="No se pudo cargar la gestión" texto="Revisa tu conexión e intenta de nuevo." />;
  } else if (!detalle) {
    cuerpo = (
      <div className="p-3 flex flex-col gap-3 animate-pulse" aria-busy="true" aria-label="Cargando gestión">
        <div className="h-10 rounded bg-slate-200/70 dark:bg-gray-700/60" />
        <div className="h-14 rounded bg-slate-200/70 dark:bg-gray-700/60" />
        <div className="h-48 rounded bg-slate-200/70 dark:bg-gray-700/60" />
      </div>
    );
  } else if (!datos) {
    cuerpo = (
      <Aviso
        titulo="Gestión no encontrada"
        texto={detalle.marca
          ? 'La gestión de esta admisión fue eliminada o movida. Vuelve a Reporte Info; el estado se actualiza solo.'
          : 'Esta admisión ya no tiene gestión en Implantes (pudo ser eliminada).'}
      />
    );
  } else {
    const periodo = textoPeriodo(datos);
    cuerpo = (
      <div className="flex-1 min-h-0 overflow-auto p-3 flex flex-col gap-3">
        {existentes.length > 1 && (
          <div role="tablist" aria-label="Gestiones de la admisión" className="flex flex-wrap gap-1.5">
            {existentes.map((g, i) => {
              const estado = estadoGestion(g.datos);
              const activa = g === actual;
              return (
                <button key={g.refPath} type="button" role="tab" aria-selected={activa} onClick={() => setSeleccion(i)}
                  className={`text-left px-2.5 py-1.5 rounded-md border text-pequeno transition ${activa ? 'border-[#2383C2] bg-blue-50 dark:bg-blue-950/30' : 'border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-[#2383C2]/60'}`}>
                  <span className="block text-etiqueta text-tinta-principal truncate max-w-[220px]">{g.datos.empresa || 'Sin empresa'}</span>
                  <span className="flex items-center gap-1.5 text-tinta-secundaria">
                    {formatearFechaTabla(g.datos.fecha)}
                    <span className={`px-1 rounded-full border text-pequeno ${CLASE_GESTION[estado]}`}>{ETIQUETAS_ESTADO[estado]}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {faltantes > 0 && (
          <p className="flex items-center gap-1.5 text-pequeno text-amber-700 dark:text-amber-400">
            <AlertTriangle size={12} /> {faltantes} gestión(es) de esta admisión ya no existen (eliminadas o movidas).
          </p>
        )}

        <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <Dato etiqueta="Empresa" valor={util(datos.empresa)} />
          <Dato etiqueta="Fecha" valor={formatearFechaTabla(datos.fecha)} />
          <Dato etiqueta="Período" valor={periodo} />
          <Dato etiqueta="Estado de la gestión" valor={util(datos.estado)} />
        </dl>

        <div className="flex flex-wrap items-stretch rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 w-fit" aria-label="Resumen de la carga">
          <Cifra etiqueta="Ítems" valor={resumen.total} />
          <Cifra etiqueta="Cargados" valor={resumen.cargados} clase="text-emerald-700 dark:text-emerald-400" />
          <Cifra etiqueta="Pendientes" valor={resumen.pendientes} clase={resumen.pendientes ? 'text-amber-600 dark:text-amber-400' : 'text-tinta-principal'} />
          <Cifra etiqueta="Monto total" valor={`$${formatearPesos(resumen.monto)}`} />
          <Cifra etiqueta="Imputada" valor={resumen.imputada ? <span className="inline-flex items-center gap-1"><Lock size={12} /> Sí</span> : 'No'} clase={resumen.imputada ? 'text-emerald-800 dark:text-emerald-300' : 'text-tinta-secundaria'} />
        </div>

        <NotasAdmision descripcion={datos.descripcion} observacion={datos.observacion} onCopiar={copiar} />

        {(datos.cotizaciones || []).length === 0 ? (
          <p className="text-secundario text-tinta-atenuada px-1">Esta gestión aún no tiene cotizaciones ni ítems.</p>
        ) : (
          (datos.cotizaciones || []).map((cot, i) => (
            <CotizacionCard
              key={`${actual.refPath}-${cot.id || i}`}
              cotizacion={cot}
              bloqueEmpresa={datos.empresa}
              bloqueFecha={datos.fecha}
              gestionId={util(datos.gestionId) || String(admision)}
              defaultOpen
              soloLectura
              modoLectura
              onAgregarItem={noop}
              onEliminarItem={noop}
              onEliminarCotizacion={noop}
              onActualizarEstadoItem={noop}
              onEditarItem={noop}
            />
          ))
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col" aria-label="Detalle de la gestión">
      <div className="shrink-0 px-3 py-2 border-b border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" onClick={onVolver}
          className="h-7 px-2.5 inline-flex items-center gap-1.5 rounded border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-etiqueta text-tinta-principal hover:border-[#2383C2] hover:text-[#2383C2] transition">
          <ArrowLeft size={13} /> Volver a Reporte Info
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <FileSearch size={14} className="text-[#2383C2] shrink-0" />
          <span className="text-etiqueta text-tinta-principal">Admisión {admision}</span>
          {detalle?.marca && <BadgeGestionImplante marca={detalle.marca} />}
        </div>
        <dl className="flex flex-wrap gap-x-4 gap-y-1">
          <Dato etiqueta="Paciente" valor={util(datos?.nombre) || util(fila?.["Paciente"])} />
          <Dato etiqueta="Médico" valor={util(datos?.medico) || util(fila?.["1° Cirujano"])} />
        </dl>
        {onAbrirEnGestiones && datos && (
          <button type="button" onClick={() => onAbrirEnGestiones(actual.refPath)}
            className="ml-auto inline-flex items-center gap-1 text-pequeno text-tinta-atenuada hover:text-[#2383C2] hover:underline">
            <ExternalLink size={10} /> Abrir en Gestiones
          </button>
        )}
      </div>
      {cuerpo}
    </div>
  );
};

const Aviso = ({ titulo, texto }) => (
  <div role="alert" className="flex-1 flex flex-col items-center justify-center gap-1.5 p-8 text-center">
    <AlertTriangle size={20} className="text-amber-500" />
    <p className="text-etiqueta text-tinta-principal">{titulo}</p>
    <p className="text-secundario text-tinta-secundaria max-w-sm">{texto}</p>
  </div>
);

export default DetalleGestionReporte;
