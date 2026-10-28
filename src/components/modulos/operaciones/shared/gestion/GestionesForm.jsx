import { useRef, useState } from 'react';
import { Plus, Save, X, Info, Loader2, AlertCircle } from 'lucide-react';
import EmpresaSelect from '../../implantes/gestionImplantes/components/EmpresaSelect';
import EstadoBadge from '../estadoGestion/EstadoBadge';
import { moduloGestion } from '../modulosGestion';

// Formulario de registro de Gestión de Implantes y de Hemodinamia (`modulo`,
// ver modulosGestion.js: centro, atributo y textos).
// Tras registrar una gestión nueva el formulario queda limpio (no se
// conserva ningún campo; la fecha vuelve a hoy) y el cursor en Nombre, listo
// para la siguiente. Si falla, el cursor va al campo con el error
// (`handleGuardar` devuelve { ok, nueva, campo }); un error que no es de un
// campo deja el cursor donde estaba.
const GestionesForm = ({
  modulo = 'implantes',
  formData,
  setFormData,
  editingId,
  handleGuardar,
  handleIdChange,
  cancelarEdicion
}) => {
  const config = moduloGestion(modulo);
  const [errorFecha, setErrorFecha] = useState(false);
  const refId = useRef(null);
  const refNombre = useRef(null);
  const refFecha = useRef(null);
  const enfocar = (campo) => ({ gestionId: refId, nombre: refNombre, fecha: refFecha })[campo]?.current?.focus();

  const onSubmitForm = async (e) => {
    e.preventDefault();

    if (!formData.fecha || formData.fecha.trim() === '') {
      setErrorFecha(true);
      enfocar('fecha');
      return;
    }

    setErrorFecha(false);
    const resultado = await handleGuardar(e);
    if (resultado?.ok) {
      if (resultado.nueva) enfocar('nombre');
    } else if (resultado?.campo) {
      if (resultado.campo === 'fecha') setErrorFecha(true);
      enfocar(resultado.campo);
    }
  };

  const renderValorVinculado = (valor) => {
    if (valor === 'Cargando...') {
      return (
        <span className="flex items-center gap-1 text-[#2383C2] font-semibold italic">
          <Loader2 size={11} className="animate-spin" /> Cargando...
        </span>
      );
    }
    return valor || 'P';
  };

  return (
    <form onSubmit={onSubmitForm} className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-800/20 flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2.5">

        <div className="w-[110px]">
          <label className="block text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-0.5">ID</label>
          <input
            ref={refId}
            aria-label="ID"
            type="text"
            inputMode="numeric"
            value={formData.gestionId || ''}
            onChange={e => {
              const soloNumeros = e.target.value.replace(/\D/g, '');
              handleIdChange(soloNumeros);
            }}
            className="w-full h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] outline-none focus:border-[#2383C2] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 font-semibold"
            placeholder="Ej: 102"
          />
        </div>

        <div className="w-[200px]">
          <label className="block text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-0.5">Nombre</label>
          <input
            ref={refNombre}
            aria-label="Nombre"
            value={formData.nombre || ''}
            onChange={e => setFormData({ ...formData, nombre: e.target.value.toUpperCase() })}
            className="w-full h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] outline-none focus:border-[#2383C2] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 uppercase"
            placeholder={config.placeholderNombre}
          />
        </div>

        <div className="w-[130px]">
          <label className="block text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-0.5 flex justify-between">
            <span>Fecha</span>
            <span className="text-red-500 font-bold">*</span>
          </label>
          <input
            ref={refFecha}
            aria-label="Fecha"
            type="date"
            value={formData.fecha || ''}
            onChange={e => {
              if (e.target.value) setErrorFecha(false);
              setFormData({ ...formData, fecha: e.target.value });
            }}
            className={`w-full h-7 px-2 border rounded text-[11px] outline-none transition bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 ${errorFecha
              ? 'border-red-500 ring-1 ring-red-500/30 bg-red-50/20'
              : 'border-gray-300 dark:border-gray-600 focus:border-[#2383C2]'
              }`}
          />
          {errorFecha && (
            <span className="text-[9px] text-red-500 font-medium flex items-center gap-0.5 mt-0.5">
              <AlertCircle size={10} /> Requerida
            </span>
          )}
        </div>

        <div className="w-[200px]">
          <label className="block text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-0.5">Empresa</label>
          <EmpresaSelect
            value={formData.empresa}
            onChange={(empresaSeleccionada) => {
              setFormData({
                ...formData,
                empresa: empresaSeleccionada.nombre
              });
            }}
            placeholder="Seleccionar empresa..."
          />
        </div>

        <div className="flex items-end gap-1.5">
          <div className="w-[160px]">
            <label className="block text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-0.5">Informe</label>
            <select
              value={formData.informe || 'PENDIENTE'}
              onChange={e => setFormData({ ...formData, informe: e.target.value })}
              className="w-full h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] outline-none focus:border-[#2383C2] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 font-medium cursor-pointer"
            >
              <option value="PENDIENTE">PENDIENTE</option>
              <option value="DISPONIBLE">DISPONIBLE</option>
              <option value="NO APLICA">NO APLICA</option>
            </select>
          </div>

          <div className="w-[220px]">
            <label className="block text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-0.5">Observación</label>
            <input
              type="text"
              value={formData.observacion || ''}
              onChange={e => setFormData({ ...formData, observacion: e.target.value.toUpperCase() })}
              className="w-full h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] outline-none focus:border-[#2383C2] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100"
              placeholder="Observación libre..."
            />
          </div>

          <button
            type="submit"
            className={`h-7 px-3 rounded font-bold text-[11px] flex items-center gap-1.5 ${editingId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-[#2383C2] hover:bg-[#369BCE]'} text-white transition shrink-0`}
          >
            {editingId ? <><Save size={13} /> Actualizar</> : <><Plus size={13} /> Registrar</>}
          </button>

          {editingId && (
            <button
              type="button"
              onClick={cancelarEdicion}
              className="h-7 px-3 bg-gray-200 dark:bg-gray-700 rounded font-bold text-[11px] text-gray-600 dark:text-gray-300 flex items-center gap-1.5 hover:bg-gray-300 dark:hover:bg-gray-600 transition shrink-0"
            >
              <X size={13} /> Cancelar
            </button>
          )}
        </div>

      </div>

      <div className="flex flex-wrap items-center gap-6 pt-1 px-2 bg-gray-100/60 dark:bg-gray-900/40 rounded border border-dashed border-gray-200 dark:border-gray-700/60 py-1.5 text-[11px]">
        <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
          <Info size={13} className="text-[#2383C2]" />
          <span className="text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500">Datos Vinculados:</span>
        </div>

        <div className="flex items-center gap-1">
          <span className="font-bold text-gray-500 dark:text-gray-400 text-[10px] uppercase">Centro:</span>
          <span className="font-semibold text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-[10px]">
            {config.centroDe(formData)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="font-bold text-gray-500 dark:text-gray-400 text-[10px] uppercase">Atributo:</span>
          <span className="font-semibold text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-[10px]">
            {formData.atributo || config.atributoPorDefecto}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="font-bold text-gray-500 dark:text-gray-400 text-[10px] uppercase">Estado:</span>
          <EstadoBadge estado={formData.estado || 'AGENDANDO'} ancho={false} />
        </div>

        <div className="flex items-center gap-1">
          <span className="font-bold text-gray-500 dark:text-gray-400 text-[10px] uppercase">Costo:</span>
          <span className="font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded text-[10px]">
            ${formData.costo ?? 0}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="font-bold text-gray-500 dark:text-gray-400 text-[10px] uppercase">Convenio:</span>
          <span className="font-medium text-gray-700 dark:text-gray-200">
            {renderValorVinculado(formData.convenio)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="font-bold text-gray-500 dark:text-gray-400 text-[10px] uppercase">Previsión:</span>
          <span className="font-medium text-gray-700 dark:text-gray-200">
            {renderValorVinculado(formData.prevision)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="font-bold text-gray-500 dark:text-gray-400 text-[10px] uppercase">Médico:</span>
          <span className="font-medium text-gray-700 dark:text-gray-200">
            {renderValorVinculado(formData.medico)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="font-bold text-gray-500 dark:text-gray-400 text-[10px] uppercase">Descripción:</span>
          <span className="font-medium text-gray-700 dark:text-gray-200 truncate max-w-[250px]" title={formData.descripcion || 'P'}>
            {renderValorVinculado(formData.descripcion)}
          </span>
        </div>
      </div>
    </form>
  );
};

export default GestionesForm;