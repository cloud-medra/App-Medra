import React, { useState } from 'react';
import { X, Settings, Calendar, Hash, Building2, Save, Trash2, Plus, Tag, DollarSign } from 'lucide-react';
import { doc, updateDoc, collection, addDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import { db, auth } from '../../../../../../../firebaseConfig';
import { useToast } from '../../../../../../../context/ToastContext';
import { useColumnasPermitidas } from '../../../../../../../hooks/useColumnasPermitidas';
import { aFechaISO, esFechaISO } from '../../../../shared/fechaISO';

const PATH_VISTA = '/laboratorio/archivosControlLaboratorio/documentosRecibidos';

// Columnas de la tabla (granularidad por columna: `col_<key>` en la sección
// 'tabla_edicion' del mapa de permisos; ver useColumnasPermitidas).
const COLUMNAS_TABLA = [
  { key: 'linea', label: '#' },
  { key: 'codigo', label: 'Código' },
  { key: 'descripcion', label: 'Descripción / Nombre' },
  { key: 'cantidad', label: 'Cant.' },
  { key: 'unidad', label: 'Unidad' },
  { key: 'precioUnitario', label: 'P. Unitario' },
  { key: 'totalLinea', label: 'Total Línea' },
  { key: 'accion', label: 'Acción' }
];

const EditorDocumentos = ({ documento, filtroAnio, filtroMes, onClose }) => {
  const { ver: verColumna } = useColumnasPermitidas(PATH_VISTA, 'tabla_edicion', COLUMNAS_TABLA);
  if (!documento) return null;

  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  const [folio, setFolio] = useState(documento.folio || '');
  // Siempre 'AAAA-MM-DD' (lo que entrega el input date); antes se guardaba
  // como se mostraba, 'DD/MM/AAAA' (ver shared/fechaISO.js).
  const [fchEmis, setFchEmis] = useState(aFechaISO(documento.fchEmis));
  const [rznSoc, setRznSoc] = useState(documento.rznSoc || '');
  const [folioRef, setFolioRef] = useState(documento.folioRef || '');

  const [estado, setEstado] = useState(documento.estado || '');
  const [ordenCompra, setOrdenCompra] = useState(documento.ordenCompra || documento.folioRef || '');
  const [acta, setActa] = useState(documento.acta || '');
  const [salida, setSalida] = useState(documento.salida || '');
  const [mesImputado, setMesImputado] = useState(documento.mesImputado || '');

  const [detalles, setDetalles] = useState(
    documento.detalles && documento.detalles.length > 0
      ? documento.detalles.map(d => ({
          codigo: d.codigo || '',
          nombre: d.nombre || '',
          cantidad: Number(d.cantidad) || 0,
          unidad: d.unidad || '',
          precio: Number(d.precio) || 0,
          monto: Number(d.monto) || (Number(d.cantidad || 0) * Number(d.precio || 0))
        }))
      : []
  );

  const COL_BASE = "laboratorio_documentos";

  const handleItemChange = (index, field, value) => {
    const nuevosDetalles = [...detalles];
    nuevosDetalles[index][field] = value;

    if (field === 'cantidad' || field === 'precio') {
      const cant = Number(field === 'cantidad' ? value : nuevosDetalles[index].cantidad) || 0;
      const prec = Number(field === 'precio' ? value : nuevosDetalles[index].precio) || 0;
      nuevosDetalles[index].monto = cant * prec;
    }

    setDetalles(nuevosDetalles);
  };

  const handleAddRow = () => {
    setDetalles([
      ...detalles,
      { codigo: '', nombre: '', cantidad: 1, unidad: 'UNI', precio: 0, monto: 0 }
    ]);
  };

  const handleRemoveRow = (index) => {
    setDetalles(detalles.filter((_, idx) => idx !== index));
  };

  const totalCalculado = detalles.reduce((acc, curr) => acc + (Number(curr.monto) || 0), 0);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!esFechaISO(fchEmis)) {
      showToast("Ingresa una fecha de emisión válida", "error");
      return;
    }
    setLoading(true);

    try {
      const docRef = doc(db, COL_BASE, filtroAnio, "meses", filtroMes, "documentos", documento.id);

      const datosActualizados = {
        folio,
        fchEmis,
        rznSoc,
        folioRef,
        estado,
        ordenCompra,
        total: totalCalculado,
        detalles,
        updatedAt: new Date()
      };

      if (acta && acta.trim() !== '') {
        datosActualizados.acta = acta.trim();
      } else {
        datosActualizados.acta = deleteField();
      }

      if (salida && salida.trim() !== '') {
        datosActualizados.salida = salida.trim();
      } else {
        datosActualizados.salida = deleteField();
      }

      if (mesImputado && mesImputado.trim() !== '') {
        datosActualizados.mesImputado = mesImputado.trim();
      } else {
        datosActualizados.mesImputado = deleteField();
      }

      const cambiosRealizados = {};

      if (documento.folio !== folio) cambiosRealizados.folio = { anterior: documento.folio || '', nuevo: folio };
      if (documento.fchEmis !== fchEmis) cambiosRealizados.fchEmis = { anterior: documento.fchEmis || '', nuevo: fchEmis };
      if (documento.rznSoc !== rznSoc) cambiosRealizados.rznSoc = { anterior: documento.rznSoc || '', nuevo: rznSoc };
      if (documento.folioRef !== folioRef) cambiosRealizados.folioRef = { anterior: documento.folioRef || '', nuevo: folioRef };
      if (documento.estado !== estado) cambiosRealizados.estado = { anterior: documento.estado || '', nuevo: estado };
      
      if (documento.acta && documento.acta !== acta) {
        cambiosRealizados.acta = { anterior: documento.acta, nuevo: acta };
      } else if (!documento.acta && acta && acta.trim() !== "") {
        cambiosRealizados.acta = { anterior: "", nuevo: acta };
      }

      if (documento.salida && documento.salida !== salida) {
        cambiosRealizados.salida = { anterior: documento.salida, nuevo: salida };
      } else if (!documento.salida && salida && salida.trim() !== "") {
        cambiosRealizados.salida = { anterior: "", nuevo: salida };
      }

      if (documento.mesImputado && documento.mesImputado !== mesImputado) {
        cambiosRealizados.mesImputado = { anterior: documento.mesImputado, nuevo: mesImputado };
      } else if (!documento.mesImputado && mesImputado && mesImputado.trim() !== "") {
        cambiosRealizados.mesImputado = { anterior: "", nuevo: mesImputado };
      }

      if (Number(documento.total || 0) !== totalCalculado) {
        cambiosRealizados.total = { anterior: documento.total || 0, nuevo: totalCalculado };
      }
      
      const detallesAnteriores = documento.detalles || [];
      const cambiosDetalles = [];

      detallesAnteriores.forEach((itemAnt, idx) => {
        const itemNuevo = detalles[idx];
        if (!itemNuevo) return;

        const cambiosFila = [];
        if (itemAnt.codigo !== itemNuevo.codigo) cambiosFila.push(`Código: "${itemAnt.codigo || ''}" ➔ "${itemNuevo.codigo || ''}"`);
        if (itemAnt.nombre !== itemNuevo.nombre) cambiosFila.push(`Nombre: "${itemAnt.nombre || ''}" ➔ "${itemNuevo.nombre || ''}"`);
        if (Number(itemAnt.cantidad) !== Number(itemNuevo.cantidad)) cambiosFila.push(`Cantidad: ${itemAnt.cantidad} ➔ ${itemNuevo.cantidad}`);
        if (itemAnt.unidad !== itemNuevo.unidad) cambiosFila.push(`Unidad: "${itemAnt.unidad || ''}" ➔ "${itemNuevo.unidad || ''}"`);
        if (Number(itemAnt.precio) !== Number(itemNuevo.precio)) cambiosFila.push(`Precio: $${itemAnt.precio} ➔ $${itemNuevo.precio}`);

        if (cambiosFila.length > 0) cambiosDetalles.push(...cambiosFila);
      });

      if (detalles.length > detallesAnteriores.length) {
        for (let i = detallesAnteriores.length; i < detalles.length; i++) {
          cambiosDetalles.push(`Ítem #${i + 1} agregado: ${detalles[i].nombre || 'Sin nombre'}`);
        }
      }

      if (detalles.length < detallesAnteriores.length) {
        cambiosDetalles.push(`Se eliminaron ${detallesAnteriores.length - detalles.length} ítem(s).`);
      }

      if (cambiosDetalles.length > 0) {
        cambiosRealizados.detalles = {
          anterior: "Varios ítems modificados",
          nuevo: cambiosDetalles.join("\n")
        };
      }

      await updateDoc(docRef, datosActualizados);

      const currentUser = auth.currentUser;
      const usuarioInfo = {
        uid: currentUser?.uid || "desconocido",
        email: currentUser?.email || "usuario_anonimo",
        nombre: currentUser?.displayName || currentUser?.email?.split('@')[0] || "Usuario"
      };

      try {
        const logsRef = collection(docRef, "logs");
        await addDoc(logsRef, {
          accion: "MODIFICACION_DOCUMENTO",
          detalle: `Modificación realizada en el documento Folio: ${folio || documento.id}`,
          cambios: cambiosRealizados,
          fechaHora: new Date().toLocaleString('es-CL'),
          timestamp: serverTimestamp(),
          usuario: usuarioInfo
        });
      } catch (logError) {
        console.error("Error al escribir log interno:", logError);
      }

      showToast("Documento y detalles actualizados correctamente", "success");
      onClose();
    } catch (error) {
      console.error("Error al guardar la edición:", error);
      showToast("Error al guardar los cambios", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-[2px] p-3 font-sans text-[11px]">
      <div className="bg-white dark:bg-gray-800 w-full max-w-6xl rounded-lg shadow-xl overflow-hidden flex flex-col h-[92vh] border border-gray-200 dark:border-gray-700">

        <div className="flex justify-between items-center px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/80 shrink-0">
          <div className="flex items-center gap-2">
            <Settings className="text-[#2383C2]" size={16} />
            <h3 className="text-[12px] font-bold text-gray-800 dark:text-gray-100 uppercase tracking-wide">
              Edición Integral de Documento
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex flex-col flex-grow overflow-hidden">

          <div className="p-3 bg-gray-50/50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2.5 shrink-0">

            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase flex items-center gap-1">
                <Hash size={10} className="text-[#2383C2]" /> Folio
              </label>
              <input
                type="text"
                value={folio}
                onChange={(e) => setFolio(e.target.value)}
                className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 font-bold text-gray-800 dark:text-gray-100 outline-none focus:border-[#2383C2]"
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase flex items-center gap-1">
                <Calendar size={10} className="text-[#2383C2]" /> Fch. Emisión
              </label>
              <input
                type="date"
                value={fchEmis}
                onChange={(e) => setFchEmis(e.target.value)}
                className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 outline-none focus:border-[#2383C2]"
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase flex items-center gap-1">
                <Tag size={10} className="text-[#2383C2]" /> Ref. / OC
              </label>
              <input
                type="text"
                value={folioRef}
                onChange={(e) => {
                  setFolioRef(e.target.value);
                  setOrdenCompra(e.target.value);
                }}
                className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 outline-none focus:border-[#2383C2]"
              />
            </div>

            <div className="flex flex-col gap-0.5 col-span-2 md:col-span-1">
              <label className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase flex items-center gap-1">
                <Building2 size={10} className="text-[#2383C2]" /> Razón Social
              </label>
              <input
                type="text"
                value={rznSoc}
                onChange={(e) => setRznSoc(e.target.value)}
                className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 outline-none focus:border-[#2383C2] truncate"
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase">Estado</label>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                className="h-7 px-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 outline-none focus:border-[#2383C2]"
              >
                <option value="">-- Estado --</option>
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

            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase">N° Acta</label>
              <input
                type="text"
                value={acta}
                onChange={(e) => setActa(e.target.value)}
                placeholder="Acta"
                className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 outline-none focus:border-[#2383C2]"
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase">Salida</label>
              <input
                type="text"
                value={salida}
                onChange={(e) => setSalida(e.target.value)}
                placeholder="Salida"
                className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 outline-none focus:border-[#2383C2]"
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase">Mes Imputado</label>
              <input
                type="text"
                value={mesImputado}
                onChange={(e) => setMesImputado(e.target.value)}
                placeholder="Mes"
                className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 outline-none focus:border-[#2383C2] capitalize"
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase flex items-center gap-1">
                <DollarSign size={10} className="text-[#2383C2]" /> Total Neto Calculado
              </label>
              <div className="h-7 px-2 border border-gray-200 dark:border-gray-700 rounded bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 font-bold flex items-center justify-end">
                ${totalCalculado.toLocaleString('es-CL')}
              </div>
            </div>

          </div>

          <div className="px-4 py-1.5 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
            <span className="text-[10px] font-bold uppercase text-gray-600 dark:text-gray-300">
              Detalle de Ítems ({detalles.length})
            </span>
            <button
              type="button"
              onClick={handleAddRow}
              className="h-6 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold transition flex items-center gap-1 shadow-xs"
            >
              <Plus size={12} /> Añadir Ítem
            </button>
          </div>

          <div className="flex-grow overflow-y-auto">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead className="bg-gray-100 dark:bg-gray-900 sticky top-0 z-20 shadow-xs">
                <tr className="text-gray-600 dark:text-gray-400 uppercase font-bold text-[10px]">
                  {verColumna('linea') && (
                    <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 w-10 text-center">#</th>
                  )}
                  {verColumna('codigo') && (
                    <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 w-28">Código</th>
                  )}
                  {verColumna('descripcion') && (
                    <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">Descripción / Nombre</th>
                  )}
                  {verColumna('cantidad') && (
                    <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 w-20 text-center">Cant.</th>
                  )}
                  {verColumna('unidad') && (
                    <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 w-20 text-center">Unidad</th>
                  )}
                  {verColumna('precioUnitario') && (
                    <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 w-28 text-right">P. Unitario</th>
                  )}
                  {verColumna('totalLinea') && (
                    <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 w-32 text-right">Total Línea</th>
                  )}
                  {verColumna('accion') && (
                    <th className="py-1.5 px-2 border-b border-gray-200 dark:border-gray-700 w-12 text-center">Acción</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700/60 bg-white dark:bg-gray-800">
                {detalles.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors">
                    {verColumna('linea') && (
                      <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-gray-400 font-bold text-center">
                        {idx + 1}
                      </td>
                    )}
                    {verColumna('codigo') && (
                      <td className="py-1 px-1 border-b border-r border-gray-200 dark:border-gray-700/70">
                        <input
                          type="text"
                          value={item.codigo}
                          onChange={(e) => handleItemChange(idx, 'codigo', e.target.value)}
                          className="w-full h-6 px-1 border border-transparent hover:border-gray-300 focus:border-[#2383C2] rounded bg-transparent text-gray-800 dark:text-gray-100 font-num outline-none"
                          placeholder="Sin cód."
                        />
                      </td>
                    )}
                    {verColumna('descripcion') && (
                      <td className="py-1 px-1 border-b border-r border-gray-200 dark:border-gray-700/70">
                        <input
                          type="text"
                          value={item.nombre}
                          onChange={(e) => handleItemChange(idx, 'nombre', e.target.value)}
                          className="w-full h-6 px-1 border border-transparent hover:border-gray-300 focus:border-[#2383C2] rounded bg-transparent text-gray-800 dark:text-gray-100 font-medium outline-none"
                          placeholder="Descripción del producto o servicio"
                        />
                      </td>
                    )}
                    {verColumna('cantidad') && (
                      <td className="py-1 px-1 border-b border-r border-gray-200 dark:border-gray-700/70">
                        <input
                          type="number"
                          min="0"
                          value={item.cantidad}
                          onChange={(e) => handleItemChange(idx, 'cantidad', e.target.value)}
                          className="w-full h-6 px-1 border border-transparent hover:border-gray-300 focus:border-[#2383C2] rounded bg-transparent text-gray-800 dark:text-gray-100 text-center font-medium outline-none"
                        />
                      </td>
                    )}
                    {verColumna('unidad') && (
                      <td className="py-1 px-1 border-b border-r border-gray-200 dark:border-gray-700/70">
                        <input
                          type="text"
                          value={item.unidad}
                          onChange={(e) => handleItemChange(idx, 'unidad', e.target.value)}
                          className="w-full h-6 px-1 border border-transparent hover:border-gray-300 focus:border-[#2383C2] rounded bg-transparent text-gray-800 dark:text-gray-100 text-center uppercase outline-none text-[10px]"
                        />
                      </td>
                    )}
                    {verColumna('precioUnitario') && (
                      <td className="py-1 px-1 border-b border-r border-gray-200 dark:border-gray-700/70">
                        <input
                          type="number"
                          min="0"
                          value={item.precio}
                          onChange={(e) => handleItemChange(idx, 'precio', e.target.value)}
                          className="w-full h-6 px-1 border border-transparent hover:border-gray-300 focus:border-[#2383C2] rounded bg-transparent text-gray-800 dark:text-gray-100 text-right outline-none"
                        />
                      </td>
                    )}
                    {verColumna('totalLinea') && (
                      <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700 text-right font-bold text-gray-800 dark:text-gray-100">
                        ${(Number(item.monto) || 0).toLocaleString('es-CL')}
                      </td>
                    )}
                    {verColumna('accion') && (
                      <td className="py-1 px-1 border-b border-gray-200 dark:border-gray-700 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(idx)}
                          className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          title="Eliminar fila"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex justify-between items-center shrink-0">
            <p className="text-[9px] text-gray-400 italic">Los cambios modifican directamente la información guardada en la base de datos.</p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-7 px-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded text-[10px] font-bold transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="h-7 px-4 bg-[#2383C2] hover:bg-[#1c6fa6] text-white rounded text-[10px] font-bold transition shadow-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                <Save size={12} />
                {loading ? 'Guardando...' : 'Guardar Todo'}
              </button>
            </div>
          </div>

        </form>

      </div>
    </div>
  );
};

export default EditorDocumentos;