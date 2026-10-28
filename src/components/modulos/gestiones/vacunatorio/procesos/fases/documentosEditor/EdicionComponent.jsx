import React, { useState } from 'react';
import { X, FileText, Package, User, Building2, Briefcase, Save } from 'lucide-react';
import { getEstadoProcesoClase } from '../../../../shared/estadosProceso';
import { useColumnasPermitidas } from '../../../../../../../hooks/useColumnasPermitidas';
import { useToast } from '../../../../../../../context/ToastContext';
import { aFechaISO, esFechaISO } from '../../../../shared/fechaISO';

const PATH_VISTA = '/vacunatorio/archivosControlVacunatorio/documentosEdicion';

// Columnas de la tabla (granularidad por columna: `col_<key>` en la sección
// 'tabla_edicion' del mapa de permisos; ver useColumnasPermitidas).
const COLUMNAS_TABLA = [
  { key: 'linea', label: 'Lin.' },
  { key: 'codigoDoc', label: 'Código Doc.' },
  { key: 'codigoMaestro', label: 'Cód. Maestro' },
  { key: 'nombreItem', label: 'Nombre Ítem' },
  { key: 'cantidadDoc', label: 'Cant. Doc.' },
  { key: 'cantidadOC', label: 'Cant. OC' },
  { key: 'montoDoc', label: 'Monto Doc. ($)' },
  { key: 'precioOC', label: 'Precio OC ($)' },
  { key: 'difCantidad', label: 'Dif. Cant.' },
  { key: 'difPrecio', label: 'Dif. Precio' },
  { key: 'estadoItem', label: 'Estado Ítem' }
];

const EdicionComponent = ({ documento, onClose, onGuardar }) => {
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
    
    // Parsear booleanos para las columnas de diferencia
    let parsedValue = value;
    if (field === 'diferenciaCantidad' || field === 'diferenciaPrecio') {
      parsedValue = value === 'true';
    }

    nuevosDetalles[index] = {
      ...nuevosDetalles[index],
      [field]: parsedValue
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


  const inputClass = "w-full p-1 text-[11px] rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-700 dark:text-gray-200 font-semibold focus:outline-none focus:border-[#2383C2] focus:ring-1 focus:ring-[#2383C2] transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in font-sans">
      <div className="bg-white dark:bg-gray-900 w-full max-w-7xl max-h-[92vh] rounded-xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-gray-800">
        
        {/* Modal Header */}
        <div className="px-6 py-2.5 border-b border-slate-200 dark:border-gray-800 flex justify-between items-center bg-slate-50 dark:bg-gray-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-[#2383C2]/10 text-[#2383C2] rounded-lg">
              <FileText size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-bold text-slate-800 dark:text-gray-100 uppercase tracking-wide">
                  Editando Documento Folio: {formData.folio || '-'}
                </h2>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border ${getEstadoProcesoClase(formData.estado)}`}>
                  {formData.estado || 'Proceso'}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-gray-400 font-medium">
                {formData.rznSoc || 'Sin Razón Social'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-700 dark:hover:text-gray-200 p-1 rounded-lg hover:bg-slate-200/60 dark:hover:bg-gray-800 transition"
            title="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-4 overflow-y-auto flex-grow space-y-4 text-[11px] bg-slate-50/50 dark:bg-gray-900/40">
          
          {/* Datos Generales */}
          <div className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-slate-200 dark:border-gray-700 shadow-xs">
            <h3 className="text-[11px] font-bold text-slate-700 dark:text-gray-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5 border-b border-slate-200 dark:border-gray-700 pb-1.5">
              <Building2 size={13} className="text-[#2383C2]" /> Datos Generales del Documento
            </h3>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
              <div>
                <label className="text-[10px] text-slate-400 dark:text-gray-500 block mb-0.5">Razón Social</label>
                <input 
                  type="text" 
                  name="rznSoc" 
                  value={formData.rznSoc || ''} 
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 dark:text-gray-500 block mb-0.5">Folio Ref.</label>
                <input 
                  type="text" 
                  name="folioRef" 
                  value={formData.folioRef || ''} 
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 dark:text-gray-500 block mb-0.5">Fch. Emisión</label>
                <input 
                  type="date" 
                  name="fchEmis" 
                  value={formData.fchEmis || ''} 
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 dark:text-gray-500 block mb-0.5">Periodo (Mes)</label>
                <input 
                  type="text" 
                  name="mes" 
                  value={formData.mes || ''} 
                  onChange={handleChange}
                  className={`${inputClass} capitalize`}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 dark:text-gray-500 block mb-0.5">Periodo (Año)</label>
                <input 
                  type="text" 
                  name="anio" 
                  value={formData.anio || ''} 
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 dark:text-gray-500 block mb-0.5">Imputado (Mes)</label>
                <input 
                  type="text" 
                  name="mesImputado" 
                  value={formData.mesImputado || ''} 
                  onChange={handleChange}
                  className={`${inputClass} capitalize`}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 dark:text-gray-500 block mb-0.5">Imputado (Año)</label>
                <input 
                  type="text" 
                  name="anioImputado" 
                  value={formData.anioImputado || ''} 
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 dark:text-gray-500 block mb-0.5">Total Neto ($)</label>
                <input 
                  type="number" 
                  name="total" 
                  value={formData.total || ''} 
                  onChange={handleChange}
                  className="w-full p-1 text-[11px] rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 font-bold text-emerald-600 dark:text-emerald-400 focus:outline-none focus:border-[#2383C2] focus:ring-1 focus:ring-[#2383C2] transition-colors"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 dark:text-gray-500 block mb-0.5">N° Orden</label>
                <input 
                  type="text" 
                  name="numeroOrden" 
                  value={formData.numeroOrden || ''} 
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 dark:text-gray-500 block mb-0.5">N° Acta</label>
                <input 
                  type="text" 
                  name="numeroActa" 
                  value={formData.numeroActa || ''} 
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 dark:text-gray-500 block mb-0.5">N° Salida</label>
                <input 
                  type="text" 
                  name="numeroSalida" 
                  value={formData.numeroSalida || ''} 
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 dark:text-gray-500 block mb-0.5">Estado</label>
                <select 
                  name="estado" 
                  value={formData.estado || ''} 
                  onChange={handleChange}
                  className={inputClass}
                >
                  <option value="Iniciar Ingreso">Iniciar Ingreso</option>
                  <option value="Proceso Iniciado">Proceso Iniciado</option>
                  <option value="Procesar OC">Procesar OC</option>
                  <option value="Falta Vinculación">Falta Vinculación</option>
                  <option value="Diferencia Precios">Diferencia Precios</option>
                  <option value="Listo para Ingreso">Listo para Ingreso</option>
                  <option value="Diferencia Reportada">Diferencia Reportada</option>
                  <option value="Rechazada">Rechazada</option>
                  <option value="Solicitud Enviada">Solicitud Enviada</option>
                  <option value="Finalizado">Finalizado</option>
                </select>
              </div>
            </div>
          </div>

          {/* Tabla de Detalles e Ítems */}
          <div className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-slate-200 dark:border-gray-700 shadow-xs">
            <h3 className="text-[11px] font-bold text-slate-700 dark:text-gray-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5 border-b border-slate-200 dark:border-gray-700 pb-1.5">
              <Package size={13} className="text-[#2383C2]" /> Ítems Vinculados y Detalle (Editables)
            </h3>

            <div className="border border-slate-200 dark:border-gray-700 rounded-lg overflow-x-auto">
              <table className="w-full text-left text-[10px] whitespace-nowrap">
                <thead className="bg-slate-100 dark:bg-gray-900 text-slate-600 dark:text-gray-400 uppercase font-normal text-[9px]">
                  <tr>
                    {verColumna('linea') && (
                      <th className="p-1.5 text-center w-8">Lin.</th>
                    )}
                    {verColumna('codigoDoc') && (
                      <th className="p-1.5">Código Doc.</th>
                    )}
                    {verColumna('codigoMaestro') && (
                      <th className="p-1.5">Cód. Maestro</th>
                    )}
                    {verColumna('nombreItem') && (
                      <th className="p-1.5">Nombre Ítem</th>
                    )}
                    {verColumna('cantidadDoc') && (
                      <th className="p-1.5">Cant. Doc.</th>
                    )}
                    {verColumna('cantidadOC') && (
                      <th className="p-1.5">Cant. OC</th>
                    )}
                    {verColumna('montoDoc') && (
                      <th className="p-1.5">Monto Doc. ($)</th>
                    )}
                    {verColumna('precioOC') && (
                      <th className="p-1.5">Precio OC ($)</th>
                    )}
                    {verColumna('difCantidad') && (
                      <th className="p-1.5 text-center">Dif. Cant.</th>
                    )}
                    {verColumna('difPrecio') && (
                      <th className="p-1.5 text-center">Dif. Precio</th>
                    )}
                    {verColumna('estadoItem') && (
                      <th className="p-1.5 text-center">Estado Ítem</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-gray-700">
                  {formData.detalles?.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-gray-700/40 transition">
                      {verColumna('linea') && (
                        <td className="p-1.5 text-center text-slate-500">{item.nroLin || idx + 1}</td>
                      )}
                      {verColumna('codigoDoc') && (
                        <td className="p-1.5">
                          <input 
                            type="text" 
                            value={item.codigo || ''} 
                            onChange={(e) => handleDetalleChange(idx, 'codigo', e.target.value)}
                            className="p-1 rounded text-[10px] border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-600 dark:text-gray-300 w-20 focus:outline-none focus:border-[#2383C2] focus:ring-1 focus:ring-[#2383C2] transition-colors"
                          />
                        </td>
                      )}
                      {verColumna('codigoMaestro') && (
                        <td className="p-1.5">
                          <input 
                            type="text" 
                            value={item.codigoMaestro || ''} 
                            onChange={(e) => handleDetalleChange(idx, 'codigoMaestro', e.target.value)}
                            className="p-1 rounded text-[10px] border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 font-semibold text-[#2383C2] w-20 focus:outline-none focus:border-[#2383C2] focus:ring-1 focus:ring-[#2383C2] transition-colors"
                          />
                        </td>
                      )}
                      {verColumna('nombreItem') && (
                        <td className="p-1.5">
                          <input 
                            type="text" 
                            value={item.nombre || ''} 
                            onChange={(e) => handleDetalleChange(idx, 'nombre', e.target.value)}
                            className="p-1 rounded text-[10px] border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-700 dark:text-gray-200 w-36 focus:outline-none focus:border-[#2383C2] focus:ring-1 focus:ring-[#2383C2] transition-colors"
                          />
                        </td>
                      )}
                      {/* Cantidad Doc */}
                      {verColumna('cantidadDoc') && (
                        <td className="p-1.5">
                          <input 
                            type="text" 
                            value={item.cantidad || ''} 
                            onChange={(e) => handleDetalleChange(idx, 'cantidad', e.target.value)}
                            className="p-1 rounded text-[10px] border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 font-medium text-slate-700 dark:text-gray-200 w-14 text-right focus:outline-none focus:border-[#2383C2] focus:ring-1 focus:ring-[#2383C2] transition-colors"
                          />
                        </td>
                      )}
                      {/* Cantidad OC */}
                      {verColumna('cantidadOC') && (
                        <td className="p-1.5">
                          <input 
                            type="text" 
                            value={item.cantidadOC || ''} 
                            onChange={(e) => handleDetalleChange(idx, 'cantidadOC', e.target.value)}
                            className="p-1 rounded text-[10px] border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 font-medium text-slate-700 dark:text-gray-200 w-14 text-right focus:outline-none focus:border-[#2383C2] focus:ring-1 focus:ring-[#2383C2] transition-colors"
                          />
                        </td>
                      )}
                      {/* Monto Doc */}
                      {verColumna('montoDoc') && (
                        <td className="p-1.5">
                          <input 
                            type="text" 
                            value={item.monto || ''} 
                            onChange={(e) => handleDetalleChange(idx, 'monto', e.target.value)}
                            className="p-1 rounded text-[10px] border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 font-semibold text-slate-800 dark:text-gray-100 w-20 text-right focus:outline-none focus:border-[#2383C2] focus:ring-1 focus:ring-[#2383C2] transition-colors"
                          />
                        </td>
                      )}
                      {/* Precio OC */}
                      {verColumna('precioOC') && (
                        <td className="p-1.5">
                          <input 
                            type="text" 
                            value={item.precioOC || ''} 
                            onChange={(e) => handleDetalleChange(idx, 'precioOC', e.target.value)}
                            className="p-1 rounded text-[10px] border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 font-semibold text-slate-800 dark:text-gray-100 w-20 text-right focus:outline-none focus:border-[#2383C2] focus:ring-1 focus:ring-[#2383C2] transition-colors"
                          />
                        </td>
                      )}
                      {/* Diferencia Cantidad (Boolean) */}
                      {verColumna('difCantidad') && (
                        <td className="p-1.5 text-center">
                          <select
                            value={item.diferenciaCantidad !== undefined ? String(item.diferenciaCantidad) : 'false'}
                            onChange={(e) => handleDetalleChange(idx, 'diferenciaCantidad', e.target.value)}
                            className="p-1 rounded text-[10px] border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-center font-medium text-slate-700 dark:text-gray-200 focus:outline-none focus:border-[#2383C2] focus:ring-1 focus:ring-[#2383C2] transition-colors"
                          >
                            <option value="true">True</option>
                            <option value="false">False</option>
                          </select>
                        </td>
                      )}
                      {/* Diferencia Precio (Boolean) */}
                      {verColumna('difPrecio') && (
                        <td className="p-1.5 text-center">
                          <select
                            value={item.diferenciaPrecio !== undefined ? String(item.diferenciaPrecio) : 'false'}
                            onChange={(e) => handleDetalleChange(idx, 'diferenciaPrecio', e.target.value)}
                            className="p-1 rounded text-[10px] border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-center font-medium text-slate-700 dark:text-gray-200 focus:outline-none focus:border-[#2383C2] focus:ring-1 focus:ring-[#2383C2] transition-colors"
                          >
                            <option value="true">True</option>
                            <option value="false">False</option>
                          </select>
                        </td>
                      )}
                      {/* Estado Item (Vinculado / Diferencia) */}
                      {verColumna('estadoItem') && (
                        <td className="p-1.5 text-center">
                          <select
                            value={item.estadoItem || 'Vinculado'}
                            onChange={(e) => handleDetalleChange(idx, 'estadoItem', e.target.value)}
                            className="p-1 rounded text-[10px] border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-center font-semibold text-emerald-700 dark:text-emerald-300 focus:outline-none focus:border-[#2383C2] focus:ring-1 focus:ring-[#2383C2] transition-colors"
                          >
                            <option value="Vinculado">Vinculado</option>
                            <option value="Diferencia">Diferencia</option>
                          </select>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Información Adicional */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            
            <div className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-slate-200 dark:border-gray-700 shadow-xs">
              <h4 className="text-[11px] font-bold text-slate-700 dark:text-gray-300 uppercase tracking-wider mb-2 flex items-center gap-1.5 border-b border-slate-200 dark:border-gray-700 pb-1">
                <User size={13} className="text-[#2383C2]" /> Información de Registro
              </h4>
              <div className="space-y-1.5 pt-0.5">
                <div>
                  <label className="text-[10px] text-slate-400 dark:text-gray-500 block mb-0.5">Usuario Registrado Por:</label>
                  <input 
                    type="text" 
                    name="registeredPor" 
                    value={formData.registeredPor || ''} 
                    onChange={handleChange}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-slate-200 dark:border-gray-700 shadow-xs">
              <h4 className="text-[11px] font-bold text-slate-700 dark:text-gray-300 uppercase tracking-wider mb-2 flex items-center gap-1.5 border-b border-slate-200 dark:border-gray-700 pb-1">
                <Briefcase size={13} className="text-[#2383C2]" /> Orden de Compra Vinculada
              </h4>
              <div className="space-y-1.5 pt-0.5">
                <div>
                  <label className="text-[10px] text-slate-400 dark:text-gray-500 block mb-0.5">Folio OC:</label>
                  <input 
                    type="text" 
                    name="folio" 
                    value={formData.ordenCompraVinculada?.folio || ''} 
                    onChange={handleOCChange}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 dark:text-gray-500 block mb-0.5">Fecha Vinculación:</label>
                  <input 
                    type="text" 
                    name="fechaVinculacion" 
                    value={formData.ordenCompraVinculada?.fechaVinculacion || ''} 
                    onChange={handleOCChange}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Acciones */}
          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-gray-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-gray-700 text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-800 transition font-medium text-[11px]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#2383C2] hover:bg-[#1a6a9e] text-white transition font-semibold text-[11px] shadow-sm"
            >
              <Save size={14} /> Guardar Cambios
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default EdicionComponent;