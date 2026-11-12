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
        <span className="flex items-center gap-1 text-[#2383C2] text-etiqueta italic">
          <Loader2 size={11} className="animate-spin" /> Cargando...
        </span>
      );
    }
    return valor || 'P';
  };

  return (
    <form onSubmit={onSubmitForm} className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-800/20 flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2.5">

        <div className="w-[calc(50%-0.3125rem)] sm:w-[110px]">
          <label className="block text-pequeno text-tinta-secundaria uppercase mb-0.5">ID</label>
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
            className="w-full h-9 md:h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-titulo-seccion md:text-secundario outline-none focus:border-[#2383C2] bg-white dark:bg-gray-900 text-tinta-principal"
            placeholder="Ej: 102"
          />
        </div>

        <div className="w-full sm:w-[200px]">
          <label className="block text-pequeno text-tinta-secundaria uppercase mb-0.5">Nombre</label>
          <input
            ref={refNombre}
            aria-label="Nombre"
            value={formData.nombre || ''}
            onChange={e => setFormData({ ...formData, nombre: e.target.value.toUpperCase() })}
            className="w-full h-9 md:h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-subtitulo md:text-secundario outline-none focus:border-[#2383C2] bg-white dark:bg-gray-900 text-tinta-principal uppercase"
            placeholder={config.placeholderNombre}
          />
        </div>

        <div className="w-[calc(50%-0.3125rem)] sm:w-[130px]">
          <label className="block text-pequeno text-tinta-secundaria uppercase mb-0.5 flex justify-between">
            <span>Fecha</span>
            <span className="text-red-500 text-etiqueta">*</span>
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
            className={`w-full h-9 md:h-7 px-2 border rounded text-subtitulo md:text-secundario outline-none transition bg-white dark:bg-gray-900 text-tinta-principal ${errorFecha
              ? 'border-red-500 ring-1 ring-red-500/30 bg-red-50/20'
              : 'border-gray-300 dark:border-gray-600 focus:border-[#2383C2]'
              }`}
          />
          {errorFecha && (
            <span className="text-pequeno text-red-500 flex items-center gap-0.5 mt-0.5">
              <AlertCircle size={10} /> Requerida
            </span>
          )}
        </div>

        <div className="w-full sm:w-[200px]">
          <label className="block text-pequeno text-tinta-secundaria uppercase mb-0.5">Empresa</label>
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

        <div className="flex flex-wrap items-end gap-1.5 w-full sm:w-auto">
          <div className="w-full sm:w-[160px]">
            <label className="block text-pequeno text-tinta-secundaria uppercase mb-0.5">Informe</label>
            <select
              value={formData.informe || 'PENDIENTE'}
              onChange={e => setFormData({ ...formData, informe: e.target.value })}
              className="w-full h-9 md:h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-subtitulo md:text-secundario outline-none focus:border-[#2383C2] bg-white dark:bg-gray-900 text-tinta-principal cursor-pointer"
            >
              <option value="PENDIENTE">PENDIENTE</option>
              <option value="DISPONIBLE">DISPONIBLE</option>
              <option value="NO APLICA">NO APLICA</option>
            </select>
          </div>

          <div className="w-full sm:w-[220px]">
            <label className="block text-pequeno text-tinta-secundaria uppercase mb-0.5">Observación</label>
            <input
              type="text"
              value={formData.observacion || ''}
              onChange={e => setFormData({ ...formData, observacion: e.target.value.toUpperCase() })}
              className="w-full h-9 md:h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-subtitulo md:text-secundario outline-none focus:border-[#2383C2] bg-white dark:bg-gray-900 text-tinta-principal"
              placeholder="Observación libre..."
            />
          </div>

          <button
            type="submit"
            className={`h-9 md:h-7 px-3 rounded text-etiqueta flex flex-1 sm:flex-none justify-center items-center gap-1.5 ${editingId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-[#2383C2] hover:bg-[#369BCE]'} text-white transition shrink-0`}
          >
            {editingId ? <><Save size={13} /> Actualizar</> : <><Plus size={13} /> Registrar</>}
          </button>

          {editingId && (
            <button
              type="button"
              onClick={cancelarEdicion}
              className="h-9 md:h-7 px-3 bg-gray-200 dark:bg-gray-700 rounded text-etiqueta text-tinta-secundaria flex flex-1 sm:flex-none justify-center items-center gap-1.5 hover:bg-gray-300 dark:hover:bg-gray-600 transition shrink-0"
            >
              <X size={13} /> Cancelar
            </button>
          )}
        </div>

      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 pt-1 px-2 bg-gray-100/60 dark:bg-gray-900/40 rounded border border-dashed border-gray-200 dark:border-gray-700/60 py-1.5 text-secundario">
        <div className="flex items-center gap-1.5 text-tinta-secundaria">
          <Info size={13} className="text-[#2383C2]" />
          <span className="text-pequeno uppercase text-tinta-atenuada">Datos Vinculados:</span>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-tinta-secundaria text-pequeno uppercase">Centro:</span>
          <span className="text-tinta-principal bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-pequeno">
            {config.centroDe(formData)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-tinta-secundaria text-pequeno uppercase">Atributo:</span>
          <span className="text-tinta-principal bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-pequeno">
            {formData.atributo || config.atributoPorDefecto}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-tinta-secundaria text-pequeno uppercase">Estado:</span>
          <EstadoBadge estado={formData.estado || 'AGENDANDO'} ancho={false} />
        </div>

        <div className="flex items-center gap-1">
          <span className="text-tinta-secundaria text-pequeno uppercase">Costo:</span>
          <span className="text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded text-pequeno">
            ${formData.costo ?? 0}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-tinta-secundaria text-pequeno uppercase">Convenio:</span>
          <span className="text-tinta-principal">
            {renderValorVinculado(formData.convenio)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-tinta-secundaria text-pequeno uppercase">Previsión:</span>
          <span className="text-tinta-principal">
            {renderValorVinculado(formData.prevision)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-tinta-secundaria text-pequeno uppercase">Médico:</span>
          <span className="text-tinta-principal">
            {renderValorVinculado(formData.medico)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-tinta-secundaria text-pequeno uppercase">Descripción:</span>
          <span className="text-tinta-principal truncate max-w-[250px]" title={formData.descripcion || 'P'}>
            {renderValorVinculado(formData.descripcion)}
          </span>
        </div>
      </div>
    </form>
  );
};

export default GestionesForm;