import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { MESES } from '../../administracion/controlMensual/constants';
import { mesActualEnChile, pesos } from '../../administracion/totalesFinanzas/totalesFinanzas';
import { useTotalesFinanzasData } from '../../administracion/totalesFinanzas/useTotalesFinanzasData';
import { modulosDeTotales, valorDeTotal } from './resumenFinanzas';

// Sección "Finanzas" del panel del Inicio: los totales visibles del mes en
// curso (hora de Chile). Usa el mismo hook que Finanzas, así que comparte su
// caché: entrar y salir del Inicio no vuelve a leer (el mes abierto se
// recalcula a lo más cada 5 minutos).
const ResumenFinanzasSeccion = ({ totales }) => {
  const { anio, mesId } = useMemo(() => mesActualEnChile(), []);
  const moduloIds = useMemo(() => modulosDeTotales(totales), [totales]);
  const datos = useTotalesFinanzasData({ moduloIds, anio, mes: mesId });
  const valores = totales.map((t) => ({ ...t, valor: valorDeTotal(t, datos) }));
  const hayNoDisponible = valores.some((v) => v.valor.estado === 'noDisponible');
  const nombreMes = MESES.find((m) => m.id === mesId)?.nombre;

  return (
    <section aria-label="Resumen de Finanzas" className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-etiqueta text-tinta-secundaria uppercase tracking-wider">Finanzas</span>
        <span className="text-pequeno text-tinta-secundaria">{nombreMes} {anio}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {valores.map(({ id, etiqueta, valor }) => (
          <div key={id} className="rounded-md border border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 px-2 py-1.5 min-w-0">
            <p className="text-pequeno text-tinta-secundaria uppercase tracking-wide break-words" title={etiqueta}>{etiqueta}</p>
            {valor.estado === 'noDisponible' ? (
              <p className="text-etiqueta text-amber-700 dark:text-amber-300 flex items-center gap-1" title="No se pudo leer este total">
                <AlertTriangle size={12} className="shrink-0" /> No disponible
              </p>
            ) : (
              <p className="text-numero-indicador text-tinta-principal [overflow-wrap:anywhere]">
                {valor.estado === 'cargando' ? '…' : pesos(valor.monto)}
              </p>
            )}
            {valor.estado === 'sinAbrir' && (
              <p className="text-pequeno text-tinta-atenuada">Mes sin abrir</p>
            )}
          </div>
        ))}
      </div>

      {hayNoDisponible && (
        <p role="alert" className="text-pequeno text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-md px-2 py-1 flex items-center gap-1.5">
          <AlertTriangle size={12} className="shrink-0" />
          No se pudo leer parte de los totales. Actualiza la página o revisa la pantalla de Finanzas.
        </p>
      )}
    </section>
  );
};

export default ResumenFinanzasSeccion;
