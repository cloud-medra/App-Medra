import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { User, Building2, Stethoscope, Calendar as CalendarIcon, DollarSign, Lock, Unlock, Loader2, AlertCircle } from 'lucide-react';
import CentroSelect from '../../../../../ui/CentroSelect';
import { useGranularPermission } from '../../../../../../hooks/useGranularPermission';
import { periodoEstaAbierto } from './verificacionPeriodoConsignacion';
import { estaImputadoConsignacion } from '../../utils/estadosConsignacion';

// Mismo permiso que el candado de la pestaña Cargas.
const VIEW_PATH_CARGAS = '/consignacion/cargasConsignacion/cargas';

// Candado por ítem, igual que en Cargas: cada carga es su propio documento y
// la Información se guarda sobre `registro.ref`, así que el bloqueo depende
// del estado del ítem `registro`. Este módulo no tiene "Estado de Informe",
// por eso no hay campo exceptuado.
const InformacionTab = forwardRef(({ registro, items, formData, onChange }, ref) => {
  const setField = (field, value) => onChange(field, value);

  const [desbloqueado, setDesbloqueado] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [errorCandado, setErrorCandado] = useState('');
  const { hasPermission } = useGranularPermission();

  const itemActual = (items || []).find(i => i.id === registro?.id) || registro;
  // SOLICITADO o FINALIZADO: ya imputado, con candado.
  const solicitado = estaImputadoConsignacion(itemActual);
  const bloqueado = solicitado && !desbloqueado;
  const claseBloqueado = bloqueado
    ? 'opacity-60 [&_input]:bg-slate-100 [&_select]:bg-slate-100 [&_textarea]:bg-slate-100 dark:[&_input]:bg-gray-800 dark:[&_select]:bg-gray-800 dark:[&_textarea]:bg-gray-800 [&_input]:cursor-not-allowed [&_select]:cursor-not-allowed [&_textarea]:cursor-not-allowed'
    : '';

  useImperativeHandle(ref, () => ({
    itemDesbloqueado: () => (desbloqueado && solicitado ? itemActual : null)
  }));

  const handleAbrirCandado = async () => {
    if (verificando) return;
    setErrorCandado('');
    setVerificando(true);
    try {
      if (!itemActual?.periodoAnio || !itemActual?.periodoMes) {
        setErrorCandado('No se puede editar: este ítem no tiene un período registrado (dato legado). Contacta a un administrador.');
        return;
      }
      const abierto = await periodoEstaAbierto(itemActual.periodoAnio, itemActual.periodoMes);
      if (!abierto) {
        setErrorCandado('No se puede editar: el período de este ítem ya fue cerrado.');
        return;
      }
      setDesbloqueado(true);
    } catch (err) {
      console.error('Error al verificar período para desbloquear candado:', err);
      setErrorCandado('No se pudo verificar el período. Intenta de nuevo.');
    } finally {
      setVerificando(false);
    }
  };

  return (
    <div className="p-4 max-w-6xl mx-auto w-full space-y-4">
      {bloqueado && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-[11px] text-amber-700 dark:text-amber-400">
          <Lock size={14} className="shrink-0" />
          <span>
            Este ítem ya fue solicitado e imputado. La información está en solo lectura — presiona el candado para desbloquearla y poder editarla.
          </span>
        </div>
      )}

      {errorCandado && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-[11px] text-red-700 dark:text-red-400">
          <AlertCircle size={14} className="shrink-0" />
          <span>{errorCandado}</span>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700/80 rounded-lg shadow-xs overflow-hidden">
        <div className="px-3 py-1.5 bg-slate-50/80 dark:bg-gray-800/80 border-b border-slate-200 dark:border-gray-700 flex items-center gap-1.5">
          <User size={13} className="text-[#2383C2]" />
          <h3 className="text-[11px] font-bold text-slate-700 dark:text-gray-200 uppercase tracking-wide">
            Información General
          </h3>
          {solicitado && hasPermission(VIEW_PATH_CARGAS, 'tabla_items_completa', 'accion_desbloquear_candado') && (
            <button
              type="button"
              onClick={bloqueado ? handleAbrirCandado : undefined}
              disabled={!bloqueado || verificando}
              title={
                bloqueado
                  ? 'Este ítem ya está imputado — click para desbloquear edición'
                  : 'Desbloqueado — edita y presiona "Guardar Cambios" para volver a bloquearlo'
              }
              className={`ml-auto flex items-center gap-1 h-6 px-2 rounded text-[9px] font-bold transition ${
                bloqueado
                  ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-950/50 cursor-pointer'
                  : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 cursor-default'
              } disabled:opacity-60`}
            >
              {verificando ? <Loader2 size={11} className="animate-spin" /> : bloqueado ? <Lock size={11} /> : <Unlock size={11} />}
              <span>{bloqueado ? 'Imputado' : 'Editando'}</span>
            </button>
          )}
        </div>

        <fieldset disabled={bloqueado} className={`min-w-0 ${claseBloqueado}`}>
        <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
          <div className="flex flex-col gap-1">
            <label className="font-semibold text-slate-600 dark:text-gray-300">Nombre del Paciente</label>
            <input
              type="text"
              value={formData.nombre}
              onChange={e => setField('nombre', e.target.value.toUpperCase())}
              className="h-6.5 px-2 text-[10px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 focus:ring-1 focus:ring-[#2383C2] outline-none uppercase"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-semibold text-slate-600 dark:text-gray-300 flex items-center gap-1">
              <Stethoscope size={11} className="text-slate-400" /> Médico
            </label>
            <input
              type="text"
              value={formData.medico}
              onChange={e => setField('medico', e.target.value)}
              className="h-6.5 px-2 text-[10px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 focus:ring-1 focus:ring-[#2383C2] outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-semibold text-slate-600 dark:text-gray-300 flex items-center gap-1">
              <CalendarIcon size={11} className="text-slate-400" /> Fecha
            </label>
            <input
              type="date"
              value={formData.fecha}
              onChange={e => setField('fecha', e.target.value)}
              className="h-6.5 px-2 text-[10px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 focus:ring-1 focus:ring-[#2383C2] outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-semibold text-slate-600 dark:text-gray-300 flex items-center gap-1">
              <Building2 size={11} className="text-slate-400" /> Empresa
            </label>
            <input
              type="text"
              value={formData.empresa}
              onChange={e => setField('empresa', e.target.value)}
              className="h-6.5 px-2 text-[10px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 focus:ring-1 focus:ring-[#2383C2] outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-semibold text-slate-600 dark:text-gray-300">Centro/Unidad</label>
            <CentroSelect
              value={formData.centro}
              onChange={(centroSeleccionado) => setField('centro', centroSeleccionado.nombre)}
              placeholder="Seleccionar centro..."
              disabled={bloqueado}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-semibold text-slate-600 dark:text-gray-300">Atributo</label>
            <select
              value={formData.atributo}
              onChange={e => setField('atributo', e.target.value)}
              className="h-6.5 px-2 text-[10px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 focus:ring-1 focus:ring-[#2383C2] outline-none"
            >
              <option value="CONSIGNACION">CONSIGNACION</option>
              <option value="COTIZACION">COTIZACION</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-semibold text-slate-600 dark:text-gray-300 flex items-center gap-1">
              <DollarSign size={11} className="text-slate-400" /> Costo
            </label>
            <input
              type="number"
              value={formData.costo}
              onChange={e => setField('costo', e.target.value)}
              className="h-6.5 px-2 text-[10px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 focus:ring-1 focus:ring-[#2383C2] outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-semibold text-slate-600 dark:text-gray-300">Convenio</label>
            <input
              type="text"
              value={formData.convenio}
              onChange={e => setField('convenio', e.target.value)}
              className="h-6.5 px-2 text-[10px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 focus:ring-1 focus:ring-[#2383C2] outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-semibold text-slate-600 dark:text-gray-300">Previsión</label>
            <input
              type="text"
              value={formData.prevision}
              onChange={e => setField('prevision', e.target.value)}
              className="h-6.5 px-2 text-[10px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 focus:ring-1 focus:ring-[#2383C2] outline-none"
            />
          </div>

          <div className="flex flex-col gap-1 md:col-span-2 lg:col-span-3">
            <label className="font-semibold text-slate-600 dark:text-gray-300">Descripción Pabellón</label>
            <textarea
              rows={2}
              value={formData.descripcionPabellon}
              onChange={e => setField('descripcionPabellon', e.target.value)}
              className="p-2 text-[10px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 focus:ring-1 focus:ring-[#2383C2] outline-none resize-none"
            />
          </div>
        </div>
        </fieldset>
      </div>
    </div>
  );
});

export default InformacionTab;