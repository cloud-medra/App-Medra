import React from 'react';
import {
  User,
  Building2,
  Calendar as CalendarIcon,
  DollarSign,
  FileText,
  Tag
} from 'lucide-react';
import { formatearFechaTabla, getEstadoCargaStyle } from '../../implantes/gestionImplantes/components/Cargastab/cargasHelpers';
import { formatearFecha } from '../../implantes/gestionImplantes/utils/gestionesImportExport';
import { MESES } from '../../../administracion/controlMensual/constants';
import { formatearPesos } from '../../../../../utils/formatearMoneda';
import { itemRequiereOC } from '../ocIndex/indiceOC';
import EstadoBadge from '../estadoGestion/EstadoBadge';
import { useColumnResize } from '../../../../../hooks/useColumnResize';
import { useUser } from '../../../../../context/UserContext';
import { TablaRedimensionable } from '../../../../ui/TablaRedimensionable';
import { BotonRestablecerAnchos } from '../../../../ui/BotonRestablecerAnchos';
import { periodoImputacion } from '../periodoImputacion';

// Columnas de la tabla de ítems (redimensionables, anchos recordados por
// usuario en localStorage bajo '{modulo}.detalle', ej. 'implantes.detalle'). `contexto.ocPorItem`
// es el mapa de OC del bloque que se está dibujando.
const COLUMNAS = [
  { key: 'referencia', label: 'Referencia', ancho: 100, min: 60,
    clase: 'font-medium text-slate-700 dark:text-gray-200', celda: it => it.referencia },
  { key: 'codigo', label: 'Código', ancho: 90, min: 55,
    clase: it => `font-num ${it.sinCodigo ? 'text-red-600 dark:text-red-400 font-bold' : 'text-emerald-600 dark:text-emerald-400'}`,
    celda: it => it.codigo || 'S/C' },
  { key: 'descriptorAuto', label: 'Desc. Auto', ancho: 180, min: 80,
    clase: 'text-slate-500 dark:text-gray-400', celda: it => it.descriptorAuto || 'P' },
  { key: 'clase', label: 'Clase', ancho: 60, min: 40,
    clase: 'text-slate-600 dark:text-gray-300', celda: it => it.clase || 'P' },
  { key: 'tipo', label: 'Tipo', ancho: 70, min: 40,
    clase: 'text-slate-600 dark:text-gray-300', celda: it => it.tipoVinculado || 'P' },
  { key: 'precio', label: 'Precio', ancho: 85, min: 55,
    clase: 'text-slate-600 dark:text-gray-300', celda: it => `$${formatearPesos(it.precio || 0)}` },
  { key: 'vecesCosto', label: 'Veces Costo', ancho: 80, min: 50, align: 'center',
    clase: 'text-slate-600 dark:text-gray-300', celda: it => it.vecesCosto || 1 },
  { key: 'venta', label: 'Venta', ancho: 85, min: 55,
    clase: 'text-slate-700 dark:text-gray-200 font-medium', celda: it => `$${formatearPesos(it.venta || 0)}` },
  { key: 'cantidad', label: 'Cant.', ancho: 55, min: 40, align: 'center',
    clase: 'text-slate-600 dark:text-gray-300', celda: it => it.cantidad },
  { key: 'totalItem', label: 'Total Ítem', ancho: 95, min: 60,
    clase: 'text-emerald-700 dark:text-emerald-400 font-semibold', celda: it => `$${formatearPesos(it.totalItem || 0)}` },
  { key: 'lote', label: 'Lote', ancho: 85, min: 45,
    clase: 'text-slate-600 dark:text-gray-300', celda: it => it.lote },
  { key: 'vencimiento', label: 'Vencimiento', ancho: 90, min: 60,
    clase: 'text-slate-600 dark:text-gray-300', celda: it => formatearFechaTabla(it.vencimiento) },
  { key: 'oc', label: 'OC', ancho: 60, min: 30, clase: 'font-num',
    titulo: (it, { ocPorItem }) => ocPorItem[it.id],
    celda: (it, { ocPorItem }) => (ocPorItem[it.id]
      ? <span className="text-slate-700 dark:text-gray-200 font-semibold">{ocPorItem[it.id]}</span>
      : <span className="text-slate-400 dark:text-gray-500 font-sans">{itemRequiereOC(it) ? 'Pendiente' : '—'}</span>) },
  { key: 'estadoCarga', label: 'Estado Carga', ancho: 105, min: 70,
    celda: it => {
      if (it.sinCodigo) return <span className="text-[9px] font-semibold text-red-600 dark:text-red-400">SIN CÓDIGO</span>;
      const estilo = getEstadoCargaStyle(it.estadoCarga);
      return (
        <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold rounded border ${estilo.bg} ${estilo.border} ${estilo.text}`}>
          {it.estadoCarga || 'PENDIENTE'}
        </span>
      );
    } }
];

const claseFilaItem = (it) =>
  `border-l-2 border-transparent hover:border-[#2383C2] transition-colors ${it.sinCodigo ? 'bg-red-50/50 dark:bg-red-950/20' : 'hover:bg-gray-50/80 dark:hover:bg-gray-700/40'}`;

// ocPorItemBloques: [{ itemId: oc }] alineado con formData.bloques (ver
// GestionesImplantesDetalleView).
// Pestaña Detalles de Implantes y de Hemodinamia (`modulo`, ver modulosGestion.js).
export const DetallesTab = ({ formData, ocPorItemBloques = [], modulo = 'implantes' }) => {
  const bloques = formData?.bloques || [];
  const usuario = useUser()?.userData?.uid;
  const { anchos, handleResize, restablecerAnchos, personalizados } =
    useColumnResize(COLUMNAS, { clave: `${modulo}.detalle`, usuario });

  // Período/fecha de carga son datos de la ADMISIÓN (no de una empresa en
  // particular), así que se toman del primer ítem que ya tenga periodoAnio/
  // periodoMes asignado (mismo campo que usa el candado en Cargas) en
  // cualquiera de los bloques de esta admisión. Si ninguno lo tiene todavía
  // (nunca pasó por Solicitud/Imputación), no se muestra nada.
  let itemConPeriodo = null;
  let bloqueDelPeriodo = null;
  for (const bloque of bloques) {
    // Bloque solicitado: su período de solicitud (donde está imputado).
    const encontrado = (bloque.cotizaciones?.[0]?.items || [])
      .map(it => periodoImputacion(bloque, it))
      .find(Boolean);
    if (encontrado) {
      itemConPeriodo = { periodoAnio: encontrado.anio, periodoMes: encontrado.mes };
      bloqueDelPeriodo = bloque;
      break;
    }
  }
  const nombrePeriodo = itemConPeriodo
    ? `${MESES.find(m => m.id === itemConPeriodo.periodoMes)?.nombre || itemConPeriodo.periodoMes} ${itemConPeriodo.periodoAnio}`
    : '';

  return (
    <div className="p-3 md:p-4 max-w-7xl mx-auto w-full space-y-4">

      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700/80 rounded-lg shadow-xs overflow-hidden">
        <div className="px-3 py-1.5 bg-slate-50/80 dark:bg-gray-800/80 border-b border-slate-200 dark:border-gray-700 flex items-center gap-1.5">
          <User size={13} className="text-[#2383C2]" />
          <h3 className="text-[11px] font-bold text-slate-700 dark:text-gray-200 uppercase tracking-wide">
            Información General — Admisión #{formData?.gestionId || 'N/A'}
          </h3>
        </div>

        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2.5 text-[10px]">
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-slate-400 dark:text-gray-500 text-[9px] uppercase">Paciente</span>
            <span className="text-slate-700 dark:text-gray-200 font-medium">{formData?.nombre || 'P'}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-slate-400 dark:text-gray-500 text-[9px] uppercase">Convenio</span>
            <span className="text-slate-700 dark:text-gray-200">{formData?.convenio || 'P'}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-slate-400 dark:text-gray-500 text-[9px] uppercase">Previsión</span>
            <span className="text-slate-700 dark:text-gray-200">{formData?.prevision || 'P'}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-slate-400 dark:text-gray-500 text-[9px] uppercase">Médico</span>
            <span className="text-slate-700 dark:text-gray-200">{formData?.medico || 'P'}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-slate-400 dark:text-gray-500 text-[9px] uppercase">Estado Operativo</span>
            <span><EstadoBadge estado={formData?.estado} texto={formData?.estado || 'P'} ancho={false} /></span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-slate-400 dark:text-gray-500 text-[9px] uppercase">Estado Informe</span>
            <span className="text-slate-700 dark:text-gray-200">{formData?.informe || 'P'}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-slate-400 dark:text-gray-500 text-[9px] uppercase">Centro</span>
            <span className="text-slate-700 dark:text-gray-200">{formData?.centro || 'P'}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-slate-400 dark:text-gray-500 text-[9px] uppercase">Atributo</span>
            <span className="text-slate-700 dark:text-gray-200">{formData?.atributo || 'P'}</span>
          </div>

          {itemConPeriodo && (
            <>
              <div className="flex flex-col gap-0.5">
                <span className="font-bold text-slate-400 dark:text-gray-500 text-[9px] uppercase">Período</span>
                <span className="text-slate-700 dark:text-gray-200 font-semibold">{nombrePeriodo}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-bold text-slate-400 dark:text-gray-500 text-[9px] uppercase">Fecha de Carga</span>
                <span className="text-slate-700 dark:text-gray-200">{formatearFecha(bloqueDelPeriodo?.fechaCarga)}</span>
              </div>
            </>
          )}

          {formData?.descripcion && formData.descripcion !== 'P' && (
            <div className="flex flex-col gap-0.5 col-span-2 md:col-span-3 lg:col-span-4">
              <span className="font-bold text-slate-400 dark:text-gray-500 text-[9px] uppercase">Descripción</span>
              <span className="text-slate-700 dark:text-gray-200">{formData.descripcion}</span>
            </div>
          )}
          {formData?.observacion && formData.observacion !== 'P' && (
            <div className="flex flex-col gap-0.5 col-span-2 md:col-span-3 lg:col-span-4">
              <span className="font-bold text-slate-400 dark:text-gray-500 text-[9px] uppercase">Observación / Nota Libre</span>
              <span className="text-slate-700 dark:text-gray-200">{formData.observacion}</span>
            </div>
          )}
        </div>
      </div>

      {bloques.length > 0 && (
        <div className="flex justify-end -mb-2">
          <BotonRestablecerAnchos onClick={restablecerAnchos} personalizados={personalizados} />
        </div>
      )}

      {bloques.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700/80 rounded-lg p-6 text-center text-[10px] text-slate-400 dark:text-gray-500">
          Sin empresas/fechas registradas para esta admisión.
        </div>
      ) : (
        bloques.map((bloque, idx) => {
          const items = bloque.cotizaciones?.[0]?.items || [];
          const cotizacion = bloque.cotizaciones?.[0];
          const ocPorItem = ocPorItemBloques[idx] || {};

          return (
            <div key={bloque.uniqueKey || idx} className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700/80 rounded-lg shadow-xs overflow-hidden">

              <div className="px-3 py-1.5 bg-slate-50/80 dark:bg-gray-800/80 border-b border-slate-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 dark:text-gray-200">
                    <Building2 size={13} className="text-[#2383C2]" />
                    {bloque.empresa || 'SIN EMPRESA'}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-gray-400">
                    <CalendarIcon size={11} className="text-[#2383C2]" />
                    {formatearFechaTabla(bloque.fecha)}
                  </span>
                  {cotizacion?.numCotizacion && (
                    <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-gray-400">
                      <FileText size={11} className="text-[#2383C2]" />
                      {cotizacion.numCotizacion}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold">
                    <DollarSign size={11} />
                    ${formatearPesos(bloque.costo || 0)}
                  </span>
                  <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full uppercase bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-400 font-bold">
                    <Tag size={9} />
                    {bloque.solicitud || 'PENDIENTE'}
                  </span>
                </div>
              </div>

              <TablaRedimensionable
                columnas={COLUMNAS}
                filas={items}
                anchos={anchos}
                onResize={handleResize}
                contexto={{ ocPorItem }}
                claseFila={claseFilaItem}
                vacio="Sin ítems registrados en este bloque"
                pie={{
                  etiqueta: 'Suma de ítems:',
                  columna: 'totalItem',
                  valor: `$${formatearPesos(items.reduce((acc, it) => acc + (Number(it.totalItem) || 0), 0))}`
                }}
              />
            </div>
          );
        })
      )}
    </div>
  );
};

export default DetallesTab;