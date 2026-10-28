import { useMemo, useState } from 'react';
import { Cable, Plus, RefreshCw, ListOrdered, Pencil, MinusCircle, PlayCircle, Warehouse, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { useGranularPermission } from '../../../../../hooks/useGranularPermission';
import { useColumnasPermitidas } from '../../../../../hooks/useColumnasPermitidas';
import { useModal } from '../../../../../context/ModalContext';
import { BotonRestablecerAnchos } from '../../../../ui/BotonRestablecerAnchos';
import BuscadorConLimpiar from '../../../../ui/BuscadorConLimpiar';
// Mismo diseño de tabla que Gestiones de Implantes (bordes verticales y hover
// con barra lateral azul), ya empaquetado para Bodega.
import { TablaBodega, FilaBodega, FilaAnchoCompleto } from '../../../bodega/shared/TablaBodega';
import { TD_BODEGA as TD, useAnchosTablaBodega } from '../../../bodega/shared/anchosTablaBodega';
import { formatearFechaTabla } from '../gestionImplantes/components/Cargastab/cargasHelpers';
import {
  UBICACION, RUTA_FIBRAS, usosConsumidosDe, usosRestantes, ubicacionDe, motivoNoPonerEnUso, normalizarReferencia,
} from './fibrasNucleo';
import { seccionesFibras, alertaFibra, estaVencida } from './seccionesFibras';
import { useFibrasReutilizablesData } from './useFibrasReutilizablesData';
import { RegistrarFibraDialogo, EditarFibraDialogo, PerdidaDialogo, AnularPerdidaDialogo } from './DialogosFibra';
import DetalleFibra from './DetalleFibra';
import { useFiltroInicial } from '../../../../../stores/filtroInicialStore';

// Implantes → Fibras: fibras láser reutilizables (5 o 10 usos). Cada fibra
// física tiene su código interno; sus usos se registran desde Gestiones
// (Cargas) y las pérdidas desde aquí. Reglas en fibrasNucleo.js.
// Tres secciones (seccionesFibras.js): En uso (tarjetas, una por referencia),
// En bodega (tabla) y Agotadas (tabla plegada). La búsqueda aplica a las tres.

const PATH_VISTA = '/implantes/fibrasReutilizables';
// Tabla "En bodega" (y campos de las tarjetas, con los mismos permisos de columna).
const COLUMNAS = [
  { key: 'codigo', label: 'Código', fija: true, ancho: 85, min: 70 },
  { key: 'referencia', label: 'Referencia', ancho: 100, min: 70 },
  { key: 'descriptor', label: 'Descripción', ancho: 230, min: 100 },
  { key: 'lote', label: 'Lote', ancho: 100, min: 60 },
  { key: 'vencimiento', label: 'Vencimiento', ancho: 120, min: 80 },
  { key: 'usos', label: 'Usos', ancho: 120, min: 90 },
  { key: 'restantes', label: 'Restantes', ancho: 80, min: 60 },
  { key: 'acciones', label: 'Acciones', fija: true, ancho: 120, min: 100 },
];
const COLUMNAS_AGOTADAS = [
  { key: 'codigo', label: 'Código', fija: true, ancho: 85, min: 70 },
  { key: 'referencia', label: 'Referencia', ancho: 100, min: 70 },
  { key: 'descriptor', label: 'Descripción', ancho: 230, min: 100 },
  { key: 'lote', label: 'Lote', ancho: 100, min: 60 },
  { key: 'vencimiento', label: 'Vencimiento', ancho: 95, min: 80 },
  { key: 'usos', label: 'Usos', ancho: 120, min: 90 },
  { key: 'ultimoUso', label: 'Último uso', ancho: 95, min: 80 },
  { key: 'acciones', label: 'Acciones', fija: true, ancho: 120, min: 100 },
];

const ESTILO_TARJETA = {
  rojo: 'border-red-300 bg-red-50/60 dark:border-red-800 dark:bg-red-950/20',
  ambar: 'border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20',
  normal: 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800',
};
const ETIQUETA_VENCIDA = 'px-1 rounded text-[9px] font-bold bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300';

// Barra de usos consumidos (grande en las tarjetas).
const BarraUsos = ({ fibra, grande = false }) => {
  const consumidos = usosConsumidosDe(fibra);
  const pct = Math.round((consumidos / fibra.usosTotales) * 100);
  return (
    <span className="flex items-center gap-1.5 w-full">
      <span className={`font-num font-bold ${grande ? 'text-[15px]' : ''}`}>{consumidos}/{fibra.usosTotales}</span>
      <span className={`flex-1 ${grande ? 'h-2.5' : 'h-1.5'} rounded bg-gray-200 dark:bg-gray-700 overflow-hidden`} aria-hidden>
        <span className={`block h-full ${usosRestantes(fibra) <= 1 ? 'bg-amber-500' : 'bg-teal-600'}`} style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
};

// Encabezado de sección con su contador (plegable si recibe onAlternar).
const TituloSeccion = ({ titulo, cantidad, abierta = true, onAlternar }) => {
  const contenido = (
    <>
      {onAlternar && (abierta ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}
      {titulo} <span className="font-num text-gray-500 dark:text-gray-400">({cantidad})</span>
    </>
  );
  const clase = 'text-[11px] font-bold uppercase text-gray-700 dark:text-gray-200 flex items-center gap-1';
  return onAlternar
    ? <button type="button" onClick={onAlternar} aria-expanded={abierta} className={`${clase} hover:text-[#2383C2]`}>{contenido}</button>
    : <h3 className={clase}>{contenido}</h3>;
};

const FibrasReutilizables = () => {
  const { hasPermission } = useGranularPermission();
  const { confirmAction } = useModal();
  const {
    fibras, hoy, recargar, registrar, editar, registrarPerdida, anularPerdida, ponerEnUso, devolverABodega, leerUsos, leerMovimientos,
  } = useFibrasReutilizablesData();
  const { columnasVisibles, ver } = useColumnasPermitidas(PATH_VISTA, 'tabla_fibras', COLUMNAS);
  const { columnasVisibles: columnasAgotadas } = useColumnasPermitidas(PATH_VISTA, 'tabla_fibras', COLUMNAS_AGOTADAS);
  const anchosBodega = useAnchosTablaBodega(columnasVisibles, 'implantes.fibras.bodega');
  const anchosAgotadas = useAnchosTablaBodega(columnasAgotadas, 'implantes.fibras.agotadas');

  // Búsqueda inicial si se abrió desde el panel del Inicio (filtroInicialStore).
  const filtroInicial = useFiltroInicial(RUTA_FIBRAS);
  const [texto, setTexto] = useState(filtroInicial?.texto || '');
  const [agotadasAbiertas, setAgotadasAbiertas] = useState(false);
  const [dialogo, setDialogo] = useState(null); // { tipo, fibra?, uso? }
  const [detalle, setDetalle] = useState(null);
  const [versionDetalle, setVersionDetalle] = useState(0);

  const puede = (seccion, accion) => hasPermission(PATH_VISTA, seccion, accion);
  const secciones = useMemo(() => seccionesFibras(fibras || [], hoy, texto), [fibras, hoy, texto]);

  // Poner en uso: si otra fibra de la referencia está en uso, se pregunta si
  // vuelve a bodega (solo puede haber una EN USO por referencia); cancelar no
  // cambia nada.
  const pedirPonerEnUso = (f) => {
    const otra = (fibras || []).find((x) => x.id !== f.id && ubicacionDe(x) === UBICACION.EN_USO
      && normalizarReferencia(x.referencia) === normalizarReferencia(f.referencia));
    confirmAction(
      `Poner en uso ${f.codigoInterno}`,
      otra
        ? `Solo puede haber una fibra ${f.referencia} en uso. La ${otra.codigoInterno} (lote ${otra.lote}) volverá a bodega. ¿Continuar?`
        : `La fibra ${f.codigoInterno} (lote ${f.lote}) pasará a EN USO.`,
      async () => despuesDeAccion(await ponerEnUso(f)),
      { type: 'warning', confirmText: otra ? 'Sí, devolver la anterior' : 'Poner en uso', cancelText: 'Cancelar' }
    );
  };
  const pedirDevolver = (f) => confirmAction(
    `Devolver ${f.codigoInterno} a bodega`,
    `La fibra ${f.codigoInterno} (lote ${f.lote}) quedará EN BODEGA y ${f.referencia} quedará sin fibra en uso.`,
    async () => despuesDeAccion(await devolverABodega(f)),
    { type: 'warning', confirmText: 'Devolver a bodega', cancelText: 'Cancelar' }
  );

  // Tras una acción sobre la fibra abierta en Detalle, se relee su detalle.
  const despuesDeAccion = (ok) => { if (ok) setVersionDetalle((v) => v + 1); return ok; };
  const fibraActual = (f) => (fibras || []).find((x) => x.id === f?.id) || f;

  // Acciones de una fibra según permisos (las mismas en tarjetas y tablas).
  const acciones = (f) => (
    <span className="flex items-center gap-1">
      {puede('tabla_fibras', 'action_ver_detalle') && (
        <button type="button" onClick={() => setDetalle(f)} title="Detalle de usos" aria-label={`Detalle ${f.codigoInterno}`} className="p-0.5 text-[#2383C2] hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded"><ListOrdered size={13} /></button>
      )}
      {puede('tabla_fibras', 'action_editar') && (
        <button type="button" onClick={() => setDialogo({ tipo: 'editar', fibra: f })} title="Corregir" aria-label={`Corregir ${f.codigoInterno}`} className="p-0.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><Pencil size={12} /></button>
      )}
      {puede('tabla_fibras', 'action_cambiar_ubicacion') && ubicacionDe(f) === UBICACION.EN_BODEGA && motivoNoPonerEnUso(f, hoy) === null && (
        <button type="button" onClick={() => pedirPonerEnUso(f)} title="Poner en uso" aria-label={`Poner en uso ${f.codigoInterno}`} className="p-0.5 text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/30 rounded"><PlayCircle size={13} /></button>
      )}
      {puede('tabla_fibras', 'action_cambiar_ubicacion') && ubicacionDe(f) === UBICACION.EN_USO && (
        <button type="button" onClick={() => pedirDevolver(f)} title="Devolver a bodega" aria-label={`Devolver a bodega ${f.codigoInterno}`} className="p-0.5 text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/30 rounded"><Warehouse size={13} /></button>
      )}
      {puede('tabla_fibras', 'action_registrar_perdida') && usosRestantes(f) > 0 && (
        <button type="button" onClick={() => setDialogo({ tipo: 'perdida', fibra: f })} title="Registrar pérdida de un uso" aria-label={`Registrar pérdida ${f.codigoInterno}`} className="p-0.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded"><MinusCircle size={13} /></button>
      )}
    </span>
  );

  const celdas = (f) => ({
    codigo: <td className={`${TD} font-mono font-bold text-[#2383C2]`}>{f.codigoInterno}</td>,
    referencia: <td className={TD}>{f.referencia}</td>,
    descriptor: <td className={TD} title={f.descriptor}>{f.descriptor}</td>,
    lote: <td className={`${TD} font-num`}>{f.lote}</td>,
    vencimiento: (
      <td className={`${TD} font-num`}>
        {formatearFechaTabla(f.vencimiento)} {estaVencida(f, hoy) && ubicacionDe(f) !== UBICACION.AGOTADA && <span className={ETIQUETA_VENCIDA}>VENCIDA</span>}
      </td>
    ),
    usos: <td className={TD}><BarraUsos fibra={f} /></td>,
    restantes: <td className={`${TD} font-num font-bold ${usosRestantes(f) === 1 ? 'text-amber-600' : ''}`}>{usosRestantes(f)}</td>,
    ultimoUso: <td className={`${TD} font-num`}>{f.ultimoUso ? formatearFechaTabla(f.ultimoUso) : '—'}</td>,
    acciones: <td className={TD}>{acciones(f)}</td>,
  });

  const tarjetaEnUso = (tarjeta) => {
    const f = tarjeta.fibra;
    const alerta = alertaFibra(f, hoy);
    return (
      <div key={tarjeta.referencia} className={`rounded-lg border-2 p-3 flex flex-col gap-2 ${ESTILO_TARJETA[alerta || 'normal']}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-[#2383C2]">{f.codigoInterno}</span>
              <span className="font-bold text-gray-800 dark:text-gray-100">{f.referencia}</span>
              {alerta === 'rojo' && <span className={ETIQUETA_VENCIDA}>VENCIDA</span>}
            </div>
            {ver('descriptor') && <p className="text-gray-500 dark:text-gray-400 truncate" title={f.descriptor}>{f.descriptor}</p>}
          </div>
          {acciones(f)}
        </div>
        {(ver('lote') || ver('vencimiento')) && (
          <p className="text-gray-600 dark:text-gray-300 font-num">
            {ver('lote') && <>Lote <strong>{f.lote}</strong></>}
            {ver('lote') && ver('vencimiento') && ' · '}
            {ver('vencimiento') && <>Vence <strong className={alerta ? (alerta === 'rojo' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400') : ''}>{formatearFechaTabla(f.vencimiento)}</strong></>}
          </p>
        )}
        {ver('usos') && <BarraUsos fibra={f} grande />}
        <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
          {ver('restantes') && (
            <span className={usosRestantes(f) === 1 ? 'font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1' : ''}>
              {usosRestantes(f) === 1 && <AlertTriangle size={11} />}
              {usosRestantes(f) === 1 ? 'Queda 1 uso' : `Quedan ${usosRestantes(f)} usos`}
            </span>
          )}
          <span className="flex items-center gap-1"><Warehouse size={11} /> {tarjeta.enBodega} en bodega</span>
        </div>
      </div>
    );
  };

  const tarjetaVacia = (tarjeta) => (
    <div key={tarjeta.referencia} className="rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-3 flex flex-col gap-2 justify-center">
      <p className="text-gray-600 dark:text-gray-300">
        <strong className="text-gray-800 dark:text-gray-100">{tarjeta.referencia}</strong>: ninguna en uso, {tarjeta.enBodega} en bodega
      </p>
      {ver('descriptor') && <p className="text-gray-500 dark:text-gray-400 truncate" title={tarjeta.descriptor}>{tarjeta.descriptor}</p>}
      {puede('tabla_fibras', 'action_cambiar_ubicacion') && (tarjeta.siguiente ? (
        <button type="button" onClick={() => pedirPonerEnUso(tarjeta.siguiente)} className="self-start h-7 px-2.5 rounded bg-teal-600 hover:bg-teal-700 text-white font-semibold flex items-center gap-1">
          <PlayCircle size={13} /> Poner en uso {tarjeta.siguiente.codigoInterno}
        </button>
      ) : (
        <p className="text-[10px] text-gray-500 italic">Las de bodega están vencidas: no se pueden poner en uso.</p>
      ))}
    </div>
  );

  const cargando = fibras === null;

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden text-[11px]">
      <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="text-[12px] font-bold text-gray-700 dark:text-gray-100 flex items-center gap-1.5 uppercase"><Cable size={14} className="text-[#2383C2]" /> Fibras reutilizables</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <BuscadorConLimpiar value={texto} onChange={setTexto} className="w-56" placeholder="Buscar referencia, lote, código…" />
          <button type="button" onClick={recargar} className="h-7 px-2 rounded border border-gray-300 dark:border-gray-600 font-semibold flex items-center gap-1 text-gray-600 dark:text-gray-300"><RefreshCw size={12} /> Actualizar</button>
          {puede('encabezado', 'btn_registrar_fibra') && (
            <button type="button" onClick={() => setDialogo({ tipo: 'registrar' })} className="h-7 px-2.5 rounded bg-[#2383C2] hover:bg-[#1d6fa5] text-white font-semibold flex items-center gap-1"><Plus size={13} /> Registrar fibra</button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 flex flex-col gap-4">
        {cargando ? (
          <p className="text-gray-400 italic">Cargando…</p>
        ) : (
          <>
            {/* 1. En uso: una tarjeta por referencia (una debajo de otra en pantallas angostas). */}
            <section className="flex flex-col gap-2">
              <TituloSeccion titulo="En uso" cantidad={secciones.totalEnUso} />
              {secciones.enUso.length === 0 ? (
                <p className="text-gray-400 italic">{texto ? 'Ninguna fibra en uso coincide con la búsqueda.' : 'No hay fibras en uso ni en bodega.'}</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-2">
                  {secciones.enUso.map((t) => (t.fibra ? tarjetaEnUso(t) : tarjetaVacia(t)))}
                </div>
              )}
            </section>

            {/* 2. En bodega: por referencia y vencimiento. */}
            <section className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <TituloSeccion titulo="En bodega" cantidad={secciones.bodega.length} />
                <BotonRestablecerAnchos onClick={anchosBodega.restablecerAnchos} personalizados={anchosBodega.personalizados} />
              </div>
              <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto">
                <TablaBodega columnas={columnasVisibles} anchos={anchosBodega.anchos} onResize={anchosBodega.handleResize}>
                  {secciones.bodega.length === 0 && <FilaAnchoCompleto columnas={columnasVisibles}>No hay fibras en bodega{texto ? ' que coincidan con la búsqueda' : ''}.</FilaAnchoCompleto>}
                  {secciones.bodega.map((f) => <FilaBodega key={f.id} columnas={columnasVisibles} celdas={celdas(f)} />)}
                </TablaBodega>
              </div>
            </section>

            {/* 3. Agotadas: plegada por defecto, por último uso (más reciente primero). */}
            <section className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <TituloSeccion titulo="Agotadas" cantidad={secciones.agotadas.length} abierta={agotadasAbiertas} onAlternar={() => setAgotadasAbiertas((v) => !v)} />
                {agotadasAbiertas && <BotonRestablecerAnchos onClick={anchosAgotadas.restablecerAnchos} personalizados={anchosAgotadas.personalizados} />}
              </div>
              {agotadasAbiertas && (
                <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto">
                  <TablaBodega columnas={columnasAgotadas} anchos={anchosAgotadas.anchos} onResize={anchosAgotadas.handleResize}>
                    {secciones.agotadas.length === 0 && <FilaAnchoCompleto columnas={columnasAgotadas}>No hay fibras agotadas{texto ? ' que coincidan con la búsqueda' : ''}.</FilaAnchoCompleto>}
                    {secciones.agotadas.map((f) => <FilaBodega key={f.id} columnas={columnasAgotadas} celdas={celdas(f)} />)}
                  </TablaBodega>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {detalle && (
        <DetalleFibra
          fibra={fibraActual(detalle)}
          leerUsos={leerUsos}
          leerMovimientos={leerMovimientos}
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
