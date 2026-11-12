import React from 'react';
import { User, Package } from 'lucide-react';
import { useColumnResize } from '../../../../../../hooks/useColumnResize';
import { useUser } from '../../../../../../context/UserContext';
import { TablaRedimensionable } from '../../../../../ui/TablaRedimensionable';
import { BotonRestablecerAnchos } from '../../../../../ui/BotonRestablecerAnchos';
import { esPrecioEspecial } from '../../utils/precioEspecial';
import BadgePrecioEspecial from '../../utils/BadgePrecioEspecial';
import { ESTADO_BADGE } from '../../utils/estadosConsignacion';

const formatearFechaTabla = (fechaString) => {
  if (!fechaString || !fechaString.includes('-')) return fechaString || '-';
  const partes = fechaString.split('-');
  if (partes.length !== 3) return fechaString;
  const [yyyy, mm, dd] = partes;
  return `${dd}-${mm}-${yyyy}`;
};

const renderP = (valor) => (valor === '' || valor === undefined || valor === null ? 'P' : valor);

const totalItem = (it) => (Number(it.costo) || 0) * (Number(it.cantidad) || 1);

// Columnas de "Ítems Registrados" (redimensionables, anchos recordados por
// usuario en localStorage bajo 'consignacion.detalle').
const COLUMNAS = [
  { key: 'codigo', label: 'Código', ancho: 90, min: 55,
    clase: 'text-numero-tabla text-emerald-600 dark:text-emerald-400', celda: it => it.codigo || 'S/C' },
  { key: 'referencia', label: 'Referencia', ancho: 160, min: 80,
    clase: 'text-tinta-principal', celda: it => it.referencia || '-' },
  { key: 'descripcion', label: 'Descripción', ancho: 200, min: 80,
    clase: 'text-tinta-secundaria', celda: it => it.descripcion || '-' },
  { key: 'empresa', label: 'Empresa', ancho: 140, min: 70,
    clase: 'text-tinta-secundaria', celda: it => renderP(it.empresa) },
  { key: 'cantidad', label: 'Cant.', ancho: 55, min: 40, align: 'center',
    clase: 'text-tinta-principal text-etiqueta', celda: it => it.cantidad ?? 0 },
  { key: 'costo', label: 'Costo', ancho: 130, min: 55,
    clase: 'text-emerald-700 dark:text-emerald-400',
    celda: it => (
      <>
        {it.costo ? `$${Number(it.costo).toLocaleString('es-CL')}` : '-'}
        {esPrecioEspecial(it) && <BadgePrecioEspecial costoMaestro={it.costoMaestro} />}
      </>
    ),
    titulo: it => (esPrecioEspecial(it) ? `Precio especial (maestro: $${Number(it.costoMaestro || 0).toLocaleString('es-CL')})` : undefined) },
  { key: 'total', label: 'Total', ancho: 95, min: 60,
    clase: 'text-emerald-700 dark:text-emerald-400 text-etiqueta',
    celda: it => { const t = totalItem(it); return t ? `$${Math.round(t).toLocaleString('es-CL')}` : '-'; } },
  { key: 'delivery', label: 'Delivery', ancho: 100, min: 55,
    clase: 'text-tinta-secundaria', celda: it => it.delivery || '-' },
  { key: 'atributo', label: 'Atributo', ancho: 110, min: 60,
    clase: 'text-tinta-secundaria', celda: it => it.atributo || '-' },
  { key: 'estado', label: 'Estado', ancho: 100, min: 65,
    celda: it => {
      const estadoKey = (it.estado || 'INGRESADO').toUpperCase();
      return (
        <span className={`inline-block px-1.5 py-0.5 text-pequeno rounded-full uppercase ${ESTADO_BADGE[estadoKey] || 'bg-slate-100 text-tinta-secundaria'}`}>
          {estadoKey}
        </span>
      );
    } }
];

const claseFilaItem = () =>
  'border-l-2 border-transparent hover:border-[#2383C2] transition-colors hover:bg-gray-50/80 dark:hover:bg-gray-700/40';

const DetalleTab = ({ registro, items = [] }) => {
  const usuario = useUser()?.userData?.uid;
  const { anchos, handleResize, restablecerAnchos, personalizados } =
    useColumnResize(COLUMNAS, { clave: 'consignacion.detalle', usuario });
  const totalItems = items.length;
  const sumaCostos = items.reduce((acc, it) => acc + totalItem(it), 0);

  return (
    <div className="px-4 lg:px-6 py-4 w-full max-w-[2200px] mx-auto space-y-4">
      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700/80 rounded-lg shadow-xs overflow-hidden">
        <div className="px-3 py-1.5 bg-slate-50/80 dark:bg-gray-800/80 border-b border-slate-200 dark:border-gray-700 flex items-center gap-1.5">
          <User size={13} className="text-[#2383C2]" />
          <h3 className="text-etiqueta text-tinta-principal uppercase tracking-wide">
            Información General — Admisión #{registro?.gestionId || 'N/A'}
          </h3>
        </div>

        <div className="p-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2.5 text-pequeno">
          <div className="flex flex-col gap-0.5">
            <span className="text-tinta-atenuada text-pequeno uppercase">Paciente</span>
            <span className="text-tinta-principal">{renderP(registro?.nombre)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-tinta-atenuada text-pequeno uppercase">Médico</span>
            <span className="text-tinta-principal">{renderP(registro?.medico)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-tinta-atenuada text-pequeno uppercase">Fecha</span>
            <span className="text-tinta-principal">{formatearFechaTabla(registro?.fecha)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-tinta-atenuada text-pequeno uppercase">Centro</span>
            <span className="text-tinta-principal">{renderP(registro?.centro)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-tinta-atenuada text-pequeno uppercase">Convenio</span>
            <span className="text-tinta-principal">{renderP(registro?.convenio)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-tinta-atenuada text-pequeno uppercase">Previsión</span>
            <span className="text-tinta-principal">{renderP(registro?.prevision)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-tinta-atenuada text-pequeno uppercase">Registrado Por</span>
            <span className="text-tinta-principal">{renderP(registro?.registradoPor)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-tinta-atenuada text-pequeno uppercase">N° de Ítems</span>
            <span className="text-tinta-principal text-etiqueta">{totalItems}</span>
          </div>

          {registro?.descripcionPabellon && (
            <div className="flex flex-col gap-0.5 col-span-2 md:col-span-3 lg:col-span-4">
              <span className="text-tinta-atenuada text-pequeno uppercase">Descripción Pabellón</span>
              <span className="text-tinta-principal">{registro.descripcionPabellon}</span>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700/80 rounded-lg shadow-xs overflow-hidden">
        <div className="px-3 py-1.5 bg-slate-50/80 dark:bg-gray-800/80 border-b border-slate-200 dark:border-gray-700 flex items-center gap-1.5">
          <Package size={13} className="text-[#2383C2]" />
          <h3 className="text-etiqueta text-tinta-principal uppercase tracking-wide">
            Ítems Registrados
          </h3>
          <BotonRestablecerAnchos onClick={restablecerAnchos} personalizados={personalizados} className="ml-auto" />
        </div>

        <TablaRedimensionable
          columnas={COLUMNAS}
          filas={items}
          anchos={anchos}
          onResize={handleResize}
          claseFila={claseFilaItem}
          vacio="Sin ítems registrados para esta admisión"
          pie={{ etiqueta: 'Total de la admisión:', columna: 'total', valor: `$${Math.round(sumaCostos).toLocaleString('es-CL')}` }}
        />
      </div>
    </div>
  );
};

export default DetalleTab;