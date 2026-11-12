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
  UBICACION, RUTA_FIBRAS, usosConsumidosDe, usosRestantes, ubicacionDe, motivoNoPonerEnUso, motivoNoPerdible, normalizarReferencia, textoFibra,
  colorUsos, textoUsos, tienePerdida, LEYENDA_COLOR_USOS,
} from './fibrasNucleo';
import NombreFibra from './NombreFibra';
import { seccionesFibras, alertaVencimiento, ALERTA_VENCIMIENTO, FILTROS_COLOR, ORDENES } from './seccionesFibras';
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
// La referencia es lo principal (primera columna, en negrita); el código
// interno va después, en gris, para distinguir fibras de la misma referencia.
const COLUMNAS = [
  { key: 'referencia', label: 'Referencia', ancho: 100, min: 70 },
  { key: 'codigo', label: 'Código', fija: true, ancho: 85, min: 70 },
  { key: 'descriptor', label: 'Descripción', ancho: 230, min: 100 },
  { key: 'lote', label: 'Lote', ancho: 100, min: 60 },
  { key: 'vencimiento', label: 'Vencimiento', ancho: 120, min: 80 },
  { key: 'usos', label: 'Usos', ancho: 120, min: 90 },
  { key: 'restantes', label: 'Restantes', ancho: 80, min: 60 },
  { key: 'acciones', label: 'Acciones', fija: true, ancho: 120, min: 100 },
];
const COLUMNAS_AGOTADAS = [
  { key: 'referencia', label: 'Referencia', ancho: 100, min: 70 },
  { key: 'codigo', label: 'Código', fija: true, ancho: 85, min: 70 },
  { key: 'descriptor', label: 'Descripción', ancho: 230, min: 100 },
  { key: 'lote', label: 'Lote', ancho: 100, min: 60 },
  { key: 'vencimiento', label: 'Vencimiento', ancho: 95, min: 80 },
  { key: 'usos', label: 'Usos', ancho: 120, min: 90 },
  { key: 'ultimoUso', label: 'Último uso', ancho: 95, min: 80 },
  { key: 'acciones', label: 'Acciones', fija: true, ancho: 120, min: 100 },
];

// Color por usos (colorUsos): borde de la tarjeta, número y barra. El
// vencimiento va en una etiqueta aparte (ETIQUETA_VENCE).
const ESTILO_TARJETA = {
  verde: 'border-emerald-300 bg-white dark:border-emerald-800 dark:bg-gray-800',
  naranjo: 'border-orange-300 bg-orange-50/60 dark:border-orange-800 dark:bg-orange-950/20',
  rojo: 'border-red-300 bg-red-50/60 dark:border-red-800 dark:bg-red-950/20',
  normal: 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800',
};
const COLOR_TEXTO = { verde: 'text-emerald-700 dark:text-emerald-400', naranjo: 'text-orange-600 dark:text-orange-400', rojo: 'text-red-700 dark:text-red-400' };
const COLOR_BARRA = { verde: 'bg-emerald-500', naranjo: 'bg-orange-500', rojo: 'bg-red-600' };
const ETIQUETA = 'px-1 rounded text-[9px] font-bold whitespace-nowrap';
const ETIQUETA_VENCE = {
  [ALERTA_VENCIMIENTO.VENCIDA]: { texto: 'VENCIDA', clase: `${ETIQUETA} bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300` },
  [ALERTA_VENCIMIENTO.PROXIMA]: { texto: 'VENCE PRONTO', clase: `${ETIQUETA} bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300` },
};
// Distingue una fibra perdida (quebrada, cortada…) de una agotada por uso.
const EtiquetaPerdida = ({ fibra }) => (tienePerdida(fibra)
  ? <span className={`${ETIQUETA} bg-red-600 text-white`} title="Se perdieron sus usos restantes: no se puede usar">Pérdida</span>
  : null);

// Barra de usos consumidos (grande en las tarjetas), con el color por usos.
const BarraUsos = ({ fibra, grande = false }) => {
  const consumidos = usosConsumidosDe(fibra);
  const pct = Math.round((consumidos / fibra.usosTotales) * 100);
  const color = colorUsos(fibra);
  return (
    <span className="flex items-center gap-1.5 w-full">
      <span className={`font-num font-bold whitespace-nowrap ${grande ? 'text-[15px]' : ''} ${COLOR_TEXTO[color] || ''}`}>{textoUsos(fibra)}</span>
      <span className={`flex-1 min-w-[24px] ${grande ? 'h-2.5' : 'h-1.5'} rounded bg-gray-200 dark:bg-gray-700 overflow-hidden`} aria-hidden>
        <span className={`block h-full ${COLOR_BARRA[color] || 'bg-teal-600'}`} style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
};

const Leyenda = () => (
  <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-gray-500 dark:text-gray-400">
    {LEYENDA_COLOR_USOS.map(({ color, texto }) => (
      <span key={color} className="flex items-center gap-1"><span className={`inline-block w-2.5 h-2.5 rounded-sm ${COLOR_BARRA[color]}`} aria-hidden />{texto}</span>
    ))}
    <span className="flex items-center gap-1"><span className={`${ETIQUETA} bg-red-600 text-white`}>Pérdida</span> sin usos disponibles por quiebre o daño</span>
  </p>
);

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
  const [filtroColor, setFiltroColor] = useState('todas');
  const [orden, setOrden] = useState('referencia');
  const [dialogo, setDialogo] = useState(null); // { tipo, fibra?, uso? }
  const [detalle, setDetalle] = useState(null);
  const [versionDetalle, setVersionDetalle] = useState(0);

  const puede = (seccion, accion) => hasPermission(PATH_VISTA, seccion, accion);
  const secciones = useMemo(() => seccionesFibras(fibras || [], hoy, texto, { color: filtroColor, orden }), [fibras, hoy, texto, filtroColor, orden]);
  const filtrando = Boolean(texto) || filtroColor !== 'todas';

  // Poner en uso: si otra fibra de la referencia está en uso, se pregunta si
  // vuelve a bodega (solo puede haber una EN USO por referencia); cancelar no
  // cambia nada.
  const pedirPonerEnUso = (f) => {
    const otra = (fibras || []).find((x) => x.id !== f.id && ubicacionDe(x) === UBICACION.EN_USO
      && normalizarReferencia(x.referencia) === normalizarReferencia(f.referencia));
    confirmAction(
      `Poner en uso ${textoFibra(f)}`,
      otra
        ? `Solo puede haber una fibra ${f.referencia} en uso. La ${textoFibra(otra)} (lote ${otra.lote}) volverá a bodega. ¿Continuar?`
        : `La fibra ${textoFibra(f)} (lote ${f.lote}) pasará a EN USO.`,
      async () => despuesDeAccion(await ponerEnUso(f)),
      { type: 'warning', confirmText: otra ? 'Sí, devolver la anterior' : 'Poner en uso', cancelText: 'Cancelar' }
    );
  };
  const pedirDevolver = (f) => confirmAction(
    `Devolver ${textoFibra(f)} a bodega`,
    `La fibra ${textoFibra(f)} (lote ${f.lote}) quedará EN BODEGA y ${f.referencia} quedará sin fibra en uso.`,
    async () => despuesDeAccion(await devolverABodega(f)),
    { type: 'warning', confirmText: 'Devolver a bodega', cancelText: 'Cancelar' }
  );

  // Tras una acción sobre la fibra abierta en Detalle, se relee su detalle.
  const despuesDeAccion = (ok) => { if (ok) setVersionDetalle((v) => v + 1); return ok; };
  const fibraActual = (f) => (fibras || []).find((x) => x.id === f?.id) || f;

  // Acciones de una fibra según permisos (las mismas en tarjetas y tablas).
  const acciones = (f) => {
    const nombre = textoFibra(f);
    return (
      <span className="flex items-center gap-1">
        {puede('tabla_fibras', 'action_ver_detalle') && (
          <button type="button" onClick={() => setDetalle(f)} title="Detalle de usos" aria-label={`Detalle ${nombre}`} className="p-0.5 text-[#2383C2] hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded"><ListOrdered size={13} /></button>
        )}
        {puede('tabla_fibras', 'action_editar') && (
          <button type="button" onClick={() => setDialogo({ tipo: 'editar', fibra: f })} title="Corregir" aria-label={`Corregir ${nombre}`} className="p-0.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><Pencil size={12} /></button>
        )}
        {puede('tabla_fibras', 'action_cambiar_ubicacion') && ubicacionDe(f) === UBICACION.EN_BODEGA && motivoNoPonerEnUso(f, hoy) === null && (
          <button type="button" onClick={() => pedirPonerEnUso(f)} title="Poner en uso" aria-label={`Poner en uso ${nombre}`} className="p-0.5 text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/30 rounded"><PlayCircle size={13} /></button>
        )}
        {puede('tabla_fibras', 'action_cambiar_ubicacion') && ubicacionDe(f) === UBICACION.EN_USO && (
          <button type="button" onClick={() => pedirDevolver(f)} title="Devolver a bodega" aria-label={`Devolver a bodega ${nombre}`} className="p-0.5 text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/30 rounded"><Warehouse size={13} /></button>
        )}
        {puede('tabla_fibras', 'action_registrar_perdida') && motivoNoPerdible(f) === null && (
          <button type="button" onClick={() => setDialogo({ tipo: 'perdida', fibra: f })} title="Registrar pérdida (se pierden los usos restantes)" aria-label={`Registrar pérdida ${nombre}`} className="p-0.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded"><MinusCircle size={13} /></button>
        )}
      </span>
    );
  };

  const celdas = (f) => ({
    referencia: <td className={`${TD} font-bold text-gray-800 dark:text-gray-100`}><span className="flex items-center gap-1">{f.referencia} <EtiquetaPerdida fibra={f} /></span></td>,
    codigo: <td className={`${TD} tabular-nums text-[10px] text-gray-400 dark:text-gray-500`}>{f.codigoInterno}</td>,
    descriptor: <td className={TD} title={f.descriptor}>{f.descriptor}</td>,
    lote: <td className={`${TD} font-num`}>{f.lote}</td>,
    vencimiento: (
      <td className={`${TD} font-num`}>
        {formatearFechaTabla(f.vencimiento)} {ubicacionDe(f) !== UBICACION.AGOTADA && ETIQUETA_VENCE[alertaVencimiento(f, hoy)] && (
          <span className={ETIQUETA_VENCE[alertaVencimiento(f, hoy)].clase}>{ETIQUETA_VENCE[alertaVencimiento(f, hoy)].texto}</span>
        )}
      </td>
    ),
    usos: <td className={TD}><BarraUsos fibra={f} /></td>,
    restantes: <td className={`${TD} font-num font-bold ${COLOR_TEXTO[colorUsos(f)] || ''}`}>{usosRestantes(f)}</td>,
    ultimoUso: <td className={`${TD} font-num`}>{f.ultimoUso ? formatearFechaTabla(f.ultimoUso) : '—'}</td>,
    acciones: <td className={TD}>{acciones(f)}</td>,
  });

  const tarjetaEnUso = (tarjeta) => {
    const f = tarjeta.fibra;
    const vence = ETIQUETA_VENCE[alertaVencimiento(f, hoy)];
    const color = colorUsos(f);
    return (
      <div key={tarjeta.referencia} className={`rounded-lg border-2 p-3 flex flex-col gap-2 ${ESTILO_TARJETA[color || 'normal']}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <NombreFibra fibra={f} claseReferencia="font-bold text-[13px] text-gray-800 dark:text-gray-100" />
              {vence && <span className={vence.clase}>{vence.texto}</span>}
            </div>
            {ver('descriptor') && <p className="text-gray-500 dark:text-gray-400 truncate" title={f.descriptor}>{f.descriptor}</p>}
          </div>
          {acciones(f)}
        </div>
        {(ver('lote') || ver('vencimiento')) && (
          <p className="text-gray-600 dark:text-gray-300 font-num">
            {ver('lote') && <>Lote <strong>{f.lote}</strong></>}
            {ver('lote') && ver('vencimiento') && ' · '}
            {ver('vencimiento') && <>Vence <strong className={vence ? (alertaVencimiento(f, hoy) === ALERTA_VENCIMIENTO.VENCIDA ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400') : ''}>{formatearFechaTabla(f.vencimiento)}</strong></>}
          </p>
        )}
        {ver('usos') && <BarraUsos fibra={f} grande />}
        <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
          {ver('restantes') && (
            <span className={usosRestantes(f) === 1 ? `font-bold flex items-center gap-1 ${COLOR_TEXTO[color] || ''}` : ''}>
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
          {/* La tarjeta ya muestra la referencia: el botón solo distingue cuál de bodega. */}
          <PlayCircle size={13} /> Poner en uso <span className="tabular-nums font-normal text-[10px] text-teal-100">{tarjeta.siguiente.codigoInterno}</span>
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
          <select value={filtroColor} onChange={(e) => setFiltroColor(e.target.value)} aria-label="Filtrar por color" className="h-7 px-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200">
            {FILTROS_COLOR.map((o) => <option key={o.valor} value={o.valor}>{o.valor === 'todas' ? 'Color: todas' : o.texto}</option>)}
          </select>
          <select value={orden} onChange={(e) => setOrden(e.target.value)} aria-label="Ordenar" className="h-7 px-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200">
            {ORDENES.map((o) => <option key={o.valor} value={o.valor}>Orden: {o.texto}</option>)}
          </select>
          <button type="button" onClick={recargar} className="h-7 px-2 rounded border border-gray-300 dark:border-gray-600 font-semibold flex items-center gap-1 text-gray-600 dark:text-gray-300"><RefreshCw size={12} /> Actualizar</button>
          {puede('encabezado', 'btn_registrar_fibra') && (
            <button type="button" onClick={() => setDialogo({ tipo: 'registrar' })} className="h-7 px-2.5 rounded bg-[#2383C2] hover:bg-[#1d6fa5] text-white font-semibold flex items-center gap-1"><Plus size={13} /> Registrar fibra</button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 flex flex-col gap-4">
        <Leyenda />
        {cargando ? (
          <p className="text-gray-400 italic">Cargando…</p>
        ) : (
          <>
            {/* 1. En uso: una tarjeta por referencia (una debajo de otra en pantallas angostas). */}
            <section className="flex flex-col gap-2">
              <TituloSeccion titulo="En uso" cantidad={secciones.totalEnUso} />
              {secciones.enUso.length === 0 ? (
                <p className="text-gray-400 italic">{filtrando ? 'Ninguna fibra en uso coincide con la búsqueda o el filtro.' : 'No hay fibras en uso ni en bodega.'}</p>
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
                  {secciones.bodega.length === 0 && <FilaAnchoCompleto columnas={columnasVisibles}>No hay fibras en bodega{filtrando ? ' que coincidan con la búsqueda o el filtro' : ''}.</FilaAnchoCompleto>}
                  {secciones.bodega.map((f) => <FilaBodega key={f.id} columnas={columnasVisibles} celdas={celdas(f)} />)}
                </TablaBodega>
              </div>
            </section>

            {/* 3. Agotadas: plegada por defecto, por último uso (más reciente primero). */}
            <section className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <TituloSeccion titulo="Agotadas y con pérdida" cantidad={secciones.agotadas.length} abierta={agotadasAbiertas || filtroColor === 'perdida'} onAlternar={() => setAgotadasAbiertas((v) => !v)} />
                {(agotadasAbiertas || filtroColor === 'perdida') && <BotonRestablecerAnchos onClick={anchosAgotadas.restablecerAnchos} personalizados={anchosAgotadas.personalizados} />}
              </div>
              {(agotadasAbiertas || filtroColor === 'perdida') && (
                <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto">
                  <TablaBodega columnas={columnasAgotadas} anchos={anchosAgotadas.anchos} onResize={anchosAgotadas.handleResize}>
                    {secciones.agotadas.length === 0 && <FilaAnchoCompleto columnas={columnasAgotadas}>No hay fibras agotadas{filtrando ? ' que coincidan con la búsqueda o el filtro' : ''}.</FilaAnchoCompleto>}
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
        <PerdidaDialogo fibra={dialogo.fibra} onGuardar={async (datos) => despuesDeAccion(await registrarPerdida(dialogo.fibra.id, datos))} onCerrar={() => setDialogo(null)} />
      )}
      {dialogo?.tipo === 'anular' && (
        <AnularPerdidaDialogo fibra={dialogo.fibra} uso={dialogo.uso} onGuardar={async (motivo) => despuesDeAccion(await anularPerdida(dialogo.fibra.id, dialogo.uso.id, motivo))} onCerrar={() => setDialogo(null)} />
      )}
    </div>
  );
};

export default FibrasReutilizables;
