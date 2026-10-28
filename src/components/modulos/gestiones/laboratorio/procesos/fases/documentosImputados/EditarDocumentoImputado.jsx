import React, { useState } from 'react';
import { X, FileText, Package, User, Building2, Briefcase, Save } from 'lucide-react';
import { getEstadoProcesoClase } from '../../../../shared/estadosProceso';
import { useColumnasPermitidas } from '../../../../../../../hooks/useColumnasPermitidas';
import { useToast } from '../../../../../../../context/ToastContext';
import { aFechaISO, esFechaISO } from '../../../../shared/fechaISO';

const PATH_VISTA = '/laboratorio/archivosControlLaboratorio/documentosImputados';

// Columnas de la tabla (granularidad por columna: `col_<key>` en la sección
// 'tabla_edicion' del mapa de permisos; ver useColumnasPermitidas).
const COLUMNAS_TABLA = [
  { key: 'linea', label: 'Lin.' },
  { key: 'codigoDoc', label: 'Código Doc.' },
  { key: 'codigoMaestro', label: 'Cód. Maestro' },
  { key: 'nombreItem', label: 'Nombre Ítem' },
  { key: 'cantidad', label: 'Cant.' },
  { key: 'monto', label: 'Monto ($)' },
  { key: 'estado', label: 'Estado' }
];

const EditarDocumentoImputado = ({ documento, onClose, onGuardar }) => {
  const { ver: verColumna } = useColumnasPermitidas(PATH_VISTA, 'tabla_edicion', COLUMNAS_TABLA);
  const { showToast } = useToast();
  if (!documento) return null;

  const [formData, setFormData] = useState({
    ...documento,
    // fchEmis siempre 'AAAA-MM-DD' (shared/fechaISO.js); los antiguos en
    // 'DD/MM/AAAA' se convierten al abrir para que el input date los muestre.
    ...(documento.fchEmis !== undefined ? { fchEmis: aFechaISO(documento.fchEmis) } : {}),
    detalles: documento.detalles ? [...documento.detalles] : [],
    ordenCompraVinculada: documento.ordenCompraVinculada ? { ...documento.ordenCompraVinculada } : {},
    procesoIniciado: typeof documento.procesoIniciado === 'object' && documento.procesoIniciado !== null 
      ? { ...documento.procesoIniciado } 
      : { fechaHora: documento.procesoIniciado || '' }
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleOCChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      ordenCompraVinculada: {
        ...prev.ordenCompraVinculada,
        [name]: value
      }
    }));
  };

  const handleDetalleChange = (index, field, value) => {
    const nuevosDetalles = [...formData.detalles];
    nuevosDetalles[index] = {
      ...nuevosDetalles[index],
      [field]: value
    };
    setFormData(prev => ({
      ...prev,
      detalles: nuevosDetalles
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.fchEmis !== undefined && !esFechaISO(formData.fchEmis)) {
      showToast('Ingresa una fecha de emisión válida', 'error');
      return;
    }
    if (onGuardar) {
      onGuardar(formData); 
    }
    onClose();
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in font-sans">
      <div className="bg-white dark:bg-gray-900 w-full max-w-6xl max-h-[92vh] rounded-xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-gray-800">
        
        <div className="px-6 py-3.5 border-b border-slate-200 dark:border-gray-800 flex justify-between items-center bg-slate-50 dark:bg-gray-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#2383C2]/10 text-[#2383C2] rounded-lg">
              <FileText size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-800 dark:text-gray-100 uppercase tracking-wide">
                  Editando Documento Folio: {formData.folio || '-'}
                </h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getEstadoProcesoClase(formData.estado)}`}>
                  {formData.estado || 'Proceso'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-gray-400 font-medium">
                {formData.rznSoc || 'Sin Razón Social'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-700 dark:hover:text-gray-200 p-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-gray-800 transition"
            title="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-grow space-y-6 text-xs bg-slate-50/50 dark:bg-gray-900/40">
          
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-slate-200 dark:border-gray-700 shadow-xs">
            <h3 className="text-xs font-bold text-slate-700 dark:text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-1.5 border-b border-slate-200 dark:border-gray-700 pb-2">
              <Building2 size={14} className="text-[#2383C2]" /> Datos Generales del Documento
            </h3>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              <div>
                <label className="text-slate-400 dark:text-gray-500 block mb-1">Razón Social</label>
                <input 
                  type="text" 
                  name="rznSoc" 
                  value={formData.rznSoc || ''} 
                  onChange={handleChange}
                  className="w-full p-1.5 rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-700 dark:text-gray-200 font-semibold"
                />
              </div>
              <div>
                <label className="text-slate-400 dark:text-gray-500 block mb-1">Folio Ref.</label>
                <input 
                  type="text" 
                  name="folioRef" 
                  value={formData.folioRef || ''} 
                  onChange={handleChange}
                  className="w-full p-1.5 rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-700 dark:text-gray-200 font-semibold"
                />
              </div>
              <div>
                <label className="text-slate-400 dark:text-gray-500 block mb-1">Fch. Emisión</label>
                <input 
                  type="date" 
                  name="fchEmis" 
                  value={formData.fchEmis || ''} 
                  onChange={handleChange}
                  className="w-full p-1.5 rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-700 dark:text-gray-200 font-semibold"
                />
              </div>
              <div>
                <label className="text-slate-400 dark:text-gray-500 block mb-1">Periodo (Mes)</label>
                <input 
                  type="text" 
                  name="mes" 
                  value={formData.mes || ''} 
                  onChange={handleChange}
                  className="w-full p-1.5 rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-700 dark:text-gray-200 font-semibold capitalize"
                />
              </div>
              <div>
                <label className="text-slate-400 dark:text-gray-500 block mb-1">Periodo (Año)</label>
                <input 
                  type="text" 
                  name="anio" 
                  value={formData.anio || ''} 
                  onChange={handleChange}
                  className="w-full p-1.5 rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-700 dark:text-gray-200 font-semibold"
                />
              </div>
              <div>
                <label className="text-slate-400 dark:text-gray-500 block mb-1">Imputado (Mes)</label>
                <input 
                  type="text" 
                  name="mesImputado" 
                  value={formData.mesImputado || ''} 
                  onChange={handleChange}
                  className="w-full p-1.5 rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-700 dark:text-gray-200 font-semibold capitalize"
                />
              </div>
              <div>
                <label className="text-slate-400 dark:text-gray-500 block mb-1">Imputado (Año)</label>
                <input 
                  type="text" 
                  name="anioImputado" 
                  value={formData.anioImputado || ''} 
                  onChange={handleChange}
                  className="w-full p-1.5 rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-700 dark:text-gray-200 font-semibold"
                />
              </div>
              <div>
                <label className="text-slate-400 dark:text-gray-500 block mb-1">Total Neto ($)</label>
                <input 
                  type="number" 
                  name="total" 
                  value={formData.total || ''} 
                  onChange={handleChange}
                  className="w-full p-1.5 rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 font-bold text-emerald-600 dark:text-emerald-400"
                />
              </div>

              <div>
                <label className="text-slate-400 dark:text-gray-500 block mb-1">N° Orden</label>
                <input 
                  type="text" 
                  name="numeroOrden" 
                  value={formData.numeroOrden || ''} 
                  onChange={handleChange}
                  className="w-full p-1.5 rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-700 dark:text-gray-200 font-semibold"
                />
              </div>
              <div>
                <label className="text-slate-400 dark:text-gray-500 block mb-1">N° Acta</label>
                <input 
                  type="text" 
                  name="numeroActa" 
                  value={formData.numeroActa || ''} 
                  onChange={handleChange}
                  className="w-full p-1.5 rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-700 dark:text-gray-200 font-semibold"
                />
              </div>
              <div>
                <label className="text-slate-400 dark:text-gray-500 block mb-1">N° Salida</label>
                <input 
                  type="text" 
                  name="numeroSalida" 
                  value={formData.numeroSalida || ''} 
                  onChange={handleChange}
                  className="w-full p-1.5 rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-700 dark:text-gray-200 font-semibold"
                />
              </div>
              <div>
                <label className="text-slate-400 dark:text-gray-500 block mb-1">Estado</label>
                <select 
                  name="estado" 
                  value={formData.estado || ''} 
                  onChange={handleChange}
                  className="w-full p-1.5 rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-700 dark:text-gray-200 font-semibold"
                >
                  <option value="Finalizado">Finalizado</option>
                  <option value="Proceso">Proceso</option>
                  <option value="Completado">Completado</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-slate-200 dark:border-gray-700 shadow-xs">
            <h3 className="text-xs font-bold text-slate-700 dark:text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-1.5 border-b border-slate-200 dark:border-gray-700 pb-2">
              <Package size={14} className="text-[#2383C2]" /> Ítems Vinculados y Detalle (Editables)
            </h3>

            <div className="border border-slate-200 dark:border-gray-700 rounded-lg overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-100 dark:bg-gray-900 text-slate-600 dark:text-gray-400 uppercase font-normal text-[10px]">
                  <tr>
                    {verColumna('linea') && (
                      <th className="p-2 text-center w-12">Lin.</th>
                    )}
                    {verColumna('codigoDoc') && (
                      <th className="p-2">Código Doc.</th>
                    )}
                    {verColumna('codigoMaestro') && (
                      <th className="p-2">Cód. Maestro</th>
                    )}
                    {verColumna('nombreItem') && (
                      <th className="p-2">Nombre Ítem</th>
                    )}
                    {verColumna('cantidad') && (
                      <th className="p-2">Cant.</th>
                    )}
                    {verColumna('monto') && (
                      <th className="p-2">Monto ($)</th>
                    )}
                    {verColumna('estado') && (
                      <th className="p-2 text-center">Estado</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-gray-700">
                  {formData.detalles?.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-gray-700/40 transition">
                      {verColumna('linea') && (
                        <td className="p-2 text-center text-slate-500">{item.nroLin || idx + 1}</td>
                      )}
                      {verColumna('codigoDoc') && (
                        <td className="p-2">
                          <input 
                            type="text" 
                            value={item.codigo || ''} 
                            onChange={(e) => handleDetalleChange(idx, 'codigo', e.target.value)}
                            className="p-1 rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-600 dark:text-gray-300 w-28"
                          />
                        </td>
                      )}
                      {verColumna('codigoMaestro') && (
                        <td className="p-2">
                          <input 
                            type="text" 
                            value={item.codigoMaestro || ''} 
                            onChange={(e) => handleDetalleChange(idx, 'codigoMaestro', e.target.value)}
                            className="p-1 rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 font-semibold text-[#2383C2] w-24"
                          />
                        </td>
                      )}
                      {verColumna('nombreItem') && (
                        <td className="p-2">
                          <input 
                            type="text" 
                            value={item.nombre || ''} 
                            onChange={(e) => handleDetalleChange(idx, 'nombre', e.target.value)}
                            className="p-1 rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-700 dark:text-gray-200 w-48"
                          />
                        </td>
                      )}
                      {verColumna('cantidad') && (
                        <td className="p-2">
                          <input 
                            type="text" 
                            value={item.cantidad || ''} 
                            onChange={(e) => handleDetalleChange(idx, 'cantidad', e.target.value)}
                            className="p-1 rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 font-medium text-slate-700 dark:text-gray-200 w-16 text-right"
                          />
                        </td>
                      )}
                      {verColumna('monto') && (
                        <td className="p-2">
                          <input 
                            type="text" 
                            value={item.monto || ''} 
                            onChange={(e) => handleDetalleChange(idx, 'monto', e.target.value)}
                            className="p-1 rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 font-semibold text-slate-800 dark:text-gray-100 w-28 text-right"
                          />
                        </td>
                      )}
                      {verColumna('estado') && (
                        <td className="p-2 text-center">
                          <input 
                            type="text" 
                            value={item.estadoItem || ''} 
                            onChange={(e) => handleDetalleChange(idx, 'estadoItem', e.target.value)}
                            className="p-1 rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-center text-emerald-700 dark:text-emerald-300 w-24"
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-slate-200 dark:border-gray-700 shadow-xs">
              <h4 className="text-xs font-bold text-slate-700 dark:text-gray-300 uppercase tracking-wider mb-2 flex items-center gap-1.5 border-b border-slate-200 dark:border-gray-700 pb-1.5">
                <User size={14} className="text-[#2383C2]" /> Información de Registro
              </h4>
              <div className="space-y-2 pt-1">
                <div>
                  <label className="text-slate-400 dark:text-gray-500 block mb-1">Usuario Registrado Por:</label>
                  <input 
                    type="text" 
                    name="registeredPor" 
                    value={formData.registeredPor || ''} 
                    onChange={handleChange}
                    className="w-full p-1.5 rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-700 dark:text-gray-200 font-semibold"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-slate-200 dark:border-gray-700 shadow-xs">
              <h4 className="text-xs font-bold text-slate-700 dark:text-gray-300 uppercase tracking-wider mb-2 flex items-center gap-1.5 border-b border-slate-200 dark:border-gray-700 pb-1.5">
                <Briefcase size={14} className="text-[#2383C2]" /> Orden de Compra Vinculada
              </h4>
              <div className="space-y-2 pt-1">
                <div>
                  <label className="text-slate-400 dark:text-gray-500 block mb-1">Folio OC:</label>
                  <input 
                    type="text" 
                    name="folio" 
                    value={formData.ordenCompraVinculada?.folio || ''} 
                    onChange={handleOCChange}
                    className="w-full p-1.5 rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-700 dark:text-gray-200 font-semibold"
                  />
                </div>
                <div>
                  <label className="text-slate-400 dark:text-gray-500 block mb-1">Fecha Vinculación:</label>
                  <input 
                    type="text" 
                    name="fechaVinculacion" 
                    value={formData.ordenCompraVinculada?.fechaVinculacion || ''} 
                    onChange={handleOCChange}
                    className="w-full p-1.5 rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-700 dark:text-gray-200 font-semibold"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-gray-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-gray-700 text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-800 transition font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#2383C2] hover:bg-[#1a6a9e] text-white transition font-semibold shadow-sm"
            >
              <Save size={16} /> Guardar Cambios
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default EditarDocumentoImputado;