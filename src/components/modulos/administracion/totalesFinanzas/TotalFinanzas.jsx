import { useMemo, useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { MESES, MODULO_BODEGA } from '../controlMensual/constants';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import BodegaPeriodoCard from '../resumenPeriodoAbierto/BodegaPeriodoCard';
import { useTotalesFinanzasData } from './useTotalesFinanzasData';
import {
  TOTALES_FINANZAS, TODO_EL_ANIO, modulosDeTotal, mesActualEnChile, aniosSeleccionables, totalizar, pesos,
} from './totalesFinanzas';

// Finanzas → Consumos / Facturas / Valorización de bodega (`tipo`, ver
// totalesFinanzas.js). Solo lectura: el total del mes elegido (por defecto
// el mes actual, hora de Chile) o, en Consumos y Facturas, de todo el año.
// La sección `desglose` (por módulo, o la cuadratura de Bodega) se controla
// con permisos granulares.
const SELECT = 'px-2 py-1 text-normal rounded-md border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-tinta-principal';

const TotalFinanzas = ({ tipo }) => {
  const config = TOTALES_FINANZAS[tipo];
  const moduloIds = modulosDeTotal(tipo);
  const actual = useMemo(() => mesActualEnChile(), []);
  const [anio, setAnio] = useState(actual.anio);
  const [mes, setMes] = useState(actual.mesId);
  const { hasPermission } = useGranularPermission();
  const verDesglose = hasPermission(config.ruta, 'desglose');

  const { celdas, estadosModulos, errorEstados, cargando } = useTotalesFinanzasData({ moduloIds, anio, mes });
  const total = useMemo(() => totalizar(moduloIds, celdas), [moduloIds, celdas]);

  const nombrePeriodo = mes === TODO_EL_ANIO
    ? `Año ${anio}`
    : `${MESES.find((m) => m.id === mes)?.nombre} ${anio}`;
  const esBodega = tipo === 'bodega';
  const celdaBodega = esBodega ? celdas.find((c) => c.modulo === MODULO_BODEGA) : null;
  const estadoBodega = esBodega ? (estadosModulos?.[MODULO_BODEGA]?.[mes]?.estado || 'SIN_INICIAR') : null;
  // Sin los estados de cierres_periodos todo parecería "sin abrir": no se muestra $0.
  const sinAbrir = !cargando && !errorEstados && celdas.length === 0;

  return (
    <div className="w-full max-w-3xl flex flex-col gap-3">
      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg p-4 shadow-xs flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-titulo-seccion text-tinta-principal">{config.titulo}</h1>
          <p className="text-secundario text-tinta-secundaria">{config.fuente}</p>
        </div>
        <div className="flex items-center gap-2">
          <select aria-label="Año" value={anio} onChange={(e) => setAnio(e.target.value)} className={SELECT}>
            {aniosSeleccionables(actual.anio).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select aria-label="Mes" value={mes} onChange={(e) => setMes(e.target.value)} className={SELECT}>
            {MESES.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            {config.permiteAnio && <option value={TODO_EL_ANIO}>Todo el año</option>}
          </select>
        </div>
      </div>

      {esBodega && verDesglose ? (
        <BodegaPeriodoCard
          resumen={celdaBodega?.bodega || null}
          estado={estadoBodega}
          mesNombre={MESES.find((m) => m.id === mes)?.nombre}
          anio={anio}
          cargando={cargando}
        />
      ) : (
        <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 dark:bg-gray-900 border-b border-slate-200 dark:border-gray-700">
            <p className="text-pequeno text-tinta-secundaria uppercase tracking-wider">
              Total · {nombrePeriodo}
            </p>
            <p className="text-numero-indicador text-tinta-principal mt-0.5">
              {cargando ? '…' : errorEstados ? 'No disponible' : pesos(total.montoTotal)}
            </p>
            {!cargando && !errorEstados && !esBodega && (
              <p className="text-pequeno text-tinta-secundaria mt-1">
                {total.cantidad.toLocaleString('es-CL')} documento(s) imputado(s)
              </p>
            )}
          </div>

          {sinAbrir && (
            <p className="p-4 text-secundario text-tinta-secundaria flex items-center gap-2">
              <Info size={13} className="shrink-0" />
              {mes === TODO_EL_ANIO ? 'Ningún mes de este año' : 'Este mes'} no se abrió en Apertura y cierre de períodos: no hay montos.
            </p>
          )}

          {verDesglose && !esBodega && !cargando && !errorEstados && !sinAbrir && (
            <div className="divide-y divide-slate-100 dark:divide-gray-700/60">
              {total.porModulo.map((m) => (
                <div key={m.moduloId} className="flex items-center justify-between gap-3 px-4 py-2 text-secundario text-tinta-principal">
                  <span className="text-etiqueta">{m.nombre}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-numero-tabla text-tinta-atenuada">{m.cantidad.toLocaleString('es-CL')} doc.</span>
                    <span className="w-32 text-right text-numero-tabla">{m.meses ? pesos(m.montoTotal) : 'Sin abrir'}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {errorEstados && (
        <p className="text-etiqueta text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-md px-3 py-2 flex items-center gap-2">
          <AlertTriangle size={13} className="shrink-0" />
          No se pudo leer el estado de los períodos: el total no está disponible. Actualiza la página.
        </p>
      )}

      {total.conError && (
        <p className="text-etiqueta text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-md px-3 py-2 flex items-center gap-2">
          <AlertTriangle size={13} className="shrink-0" />
          No se pudo leer parte de los datos ({total.porModulo.filter((m) => m.conError).map((m) => m.nombre).join(', ')}): el total puede estar incompleto. Actualiza la página.
        </p>
      )}
    </div>
  );
};

export default TotalFinanzas;
