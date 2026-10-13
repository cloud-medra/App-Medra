import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, FileText, Trash2, CheckCircle2, AlertCircle, Loader2, CalendarDays } from 'lucide-react';
import { useToast } from '../../../../../context/ToastContext';
import { useUser } from '../../../../../context/UserContext';
import { mensajeErrorStorage } from '../documentosAdmision/documentosHelpers';
import { TIPOS_DOCUMENTO, TAMANO_MAXIMO_MB, validarFilaRespaldo, construirNombreRespaldo, datosDesdeNombreArchivo } from './respaldoHelpers';
import { subirRespaldo } from './respaldoService';

// Formulario para subir uno o varios PDF al Respaldo de documentos. Pide por
// cada archivo: ID / N° de Admisión, Fecha, Nombre y Tipo (todos
// obligatorios) y muestra el nombre con que quedará guardado.
// Lo abren la pantalla de Respaldo y, con los datos ya leídos del nombre del
// archivo, Gestión → Documentos y Carga masiva ("Enviar a respaldo").
//   iniciales: [{ file, idAdmision?, nombre?, tipo?, fecha? }]
//   onSubidos(files): los File que quedaron guardados en esta tanda.

let siguienteClave = 0;
const nuevaFila = ({ file, idAdmision, nombre, tipo, fecha }) => {
  const leido = file ? datosDesdeNombreArchivo(file.name) : {};
  siguienteClave += 1;
  return {
    clave: siguienteClave,
    file,
    idAdmision: idAdmision ?? leido.idAdmision ?? '',
    nombre: nombre ?? leido.nombre ?? '',
    tipo: tipo ?? leido.tipo ?? '',
    fecha: fecha ?? '',
    estado: 'pendiente', // pendiente | subiendo | ok | error
    progreso: 0,
    error: null,
  };
};

const INPUT = 'w-full h-8 px-2 rounded-md border bg-white dark:bg-gray-900 text-[12px] text-gray-800 dark:text-gray-100 focus:outline-none focus:border-[#2383C2] focus:ring-2 focus:ring-[#2383C2]/15 disabled:opacity-60';
const borde = (error) => (error ? 'border-red-400' : 'border-gray-300 dark:border-gray-600');

// `modulo`: Respaldo del módulo (ver modulosGestion.js).
const FormularioRespaldo = ({ modulo = 'implantes', iniciales = [], onCerrar, onSubidos }) => {
  const { showToast } = useToast();
  const { userData } = useUser();
  const inputRef = useRef(null);
  const [filas, setFilas] = useState(() => iniciales.map(nuevaFila));
  const [errores, setErrores] = useState({});
  const [fechaComun, setFechaComun] = useState('');
  const [subiendo, setSubiendo] = useState(false);

  const cambiar = (clave, campo, valor) => {
    setFilas((prev) => prev.map((f) => (f.clave === clave ? { ...f, [campo]: valor } : f)));
    setErrores((prev) => ({ ...prev, [clave]: { ...(prev[clave] || {}), [campo]: undefined } }));
  };
  const agregar = (files) => setFilas((prev) => [...prev, ...Array.from(files || []).map((file) => nuevaFila({ file }))]);
  const quitar = (clave) => setFilas((prev) => prev.filter((f) => f.clave !== clave));
  const aplicarFechaATodas = () => {
    if (!fechaComun) return;
    setFilas((prev) => prev.map((f) => (f.estado === 'ok' ? f : { ...f, fecha: fechaComun })));
    setErrores((prev) => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, { ...v, fecha: undefined }])));
  };

  const pendientes = filas.filter((f) => f.estado !== 'ok');

  const subir = async () => {
    const nuevosErrores = {};
    pendientes.forEach((f) => {
      const e = validarFilaRespaldo(f);
      if (Object.keys(e).length) nuevosErrores[f.clave] = e;
    });
    setErrores(nuevosErrores);
    if (Object.keys(nuevosErrores).length) {
      showToast('Completa los datos marcados en rojo antes de subir.', 'error');
      return;
    }
    setSubiendo(true);
    const subidos = [];
    for (const fila of pendientes) {
      setFilas((prev) => prev.map((f) => (f.clave === fila.clave ? { ...f, estado: 'subiendo', progreso: 0, error: null } : f)));
      try {
        await subirRespaldo({
          modulo,
          ...fila,
          usuarioNombre: userData?.nombreCompleto,
          onProgreso: (p) => setFilas((prev) => prev.map((f) => (f.clave === fila.clave ? { ...f, progreso: p } : f))),
        });
        subidos.push(fila.file);
        setFilas((prev) => prev.map((f) => (f.clave === fila.clave ? { ...f, estado: 'ok', progreso: 100 } : f)));
      } catch (err) {
        console.error('Error al subir al respaldo:', err);
        setFilas((prev) => prev.map((f) => (f.clave === fila.clave ? { ...f, estado: 'error', error: mensajeErrorStorage(err) } : f)));
      }
    }
    setSubiendo(false);
    if (subidos.length) onSubidos?.(subidos);
    if (subidos.length === pendientes.length) {
      showToast(`${subidos.length} documento(s) guardado(s) en el respaldo.`, 'success');
      onCerrar();
    } else {
      showToast(`${pendientes.length - subidos.length} documento(s) no se pudieron subir. Revisa el detalle.`, 'error');
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-[1px] p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-form-respaldo">
      <div className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
          <Upload size={16} className="text-[#2383C2]" />
          <div className="flex-1">
            <h3 id="titulo-form-respaldo" className="text-[14px] font-semibold text-gray-800 dark:text-gray-100">Subir al respaldo de documentos</h3>
            <p className="text-[11.5px] text-gray-500 dark:text-gray-400">
              Todos los datos son obligatorios. El archivo se guarda como “ID - Nombre - TIPO.pdf”. Solo PDF, hasta {TAMANO_MAXIMO_MB} MB.
            </p>
          </div>
          <button type="button" onClick={onCerrar} disabled={subiendo} aria-label="Cerrar" className="text-gray-400 hover:text-gray-600 disabled:opacity-40"><X size={17} /></button>
        </div>

        <div className="px-5 py-2.5 border-b border-gray-100 dark:border-gray-700 flex flex-wrap items-center gap-2 bg-gray-50/70 dark:bg-gray-900/30">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={subiendo}
            className="h-8 px-3 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-[12px] font-semibold text-gray-700 dark:text-gray-200 inline-flex items-center gap-1.5 hover:border-[#2383C2] hover:text-[#2383C2]">
            <FileText size={14} /> Agregar PDF
          </button>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple className="hidden"
            onChange={(e) => { agregar(e.target.files); e.target.value = ''; }} />
          <span className="ml-auto flex items-center gap-1.5 text-[11.5px] text-gray-600 dark:text-gray-300">
            <CalendarDays size={14} className="text-gray-400" /> Fecha para todos:
            <input type="date" value={fechaComun} onChange={(e) => setFechaComun(e.target.value)} aria-label="Fecha para todos"
              className={`${INPUT} ${borde(false)} w-auto`} />
            <button type="button" onClick={aplicarFechaATodas} disabled={!fechaComun || subiendo}
              className="h-8 px-2.5 rounded-md text-[11.5px] font-semibold text-[#2383C2] hover:bg-[#2383C2]/10 disabled:text-gray-300">Aplicar</button>
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-2.5">
          {filas.length === 0 && (
            <p className="text-center text-[12px] text-gray-400 dark:text-gray-500 py-10">Agrega uno o más PDF para completar sus datos.</p>
          )}
          {filas.map((f) => {
            const e = errores[f.clave] || {};
            const bloqueada = subiendo || f.estado === 'ok';
            const puedeNombrar = f.idAdmision && f.nombre && f.tipo;
            return (
              <div key={f.clave} className={`rounded-lg border p-3 ${f.estado === 'ok' ? 'border-green-200 bg-green-50/50 dark:bg-green-950/20' : f.estado === 'error' ? 'border-red-200 bg-red-50/40 dark:bg-red-950/20' : 'border-gray-200 dark:border-gray-700'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <FileText size={14} className="text-red-500 shrink-0" />
                  <span className="text-[12px] font-medium text-gray-700 dark:text-gray-200 truncate" title={f.file?.name}>{f.file?.name}</span>
                  {f.estado === 'subiendo' && <span className="text-[11px] text-[#2383C2] inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> {f.progreso}%</span>}
                  {f.estado === 'ok' && <span className="text-[11px] text-green-700 inline-flex items-center gap-1"><CheckCircle2 size={12} /> Guardado</span>}
                  {f.estado === 'error' && <span className="text-[11px] text-red-600 inline-flex items-center gap-1"><AlertCircle size={12} /> {f.error}</span>}
                  {e.file && <span className="text-[11px] text-red-600">{e.file}</span>}
                  {!bloqueada && (
                    <button type="button" onClick={() => quitar(f.clave)} aria-label={`Quitar ${f.file?.name}`} className="ml-auto text-gray-400 hover:text-red-600"><Trash2 size={14} /></button>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-[1fr_150px_2fr_170px] gap-2">
                  {[
                    { campo: 'idAdmision', label: 'ID / N° de Admisión', input: <input value={f.idAdmision} disabled={bloqueada} onChange={(ev) => cambiar(f.clave, 'idAdmision', ev.target.value)} className={`${INPUT} ${borde(e.idAdmision)}`} placeholder="Ej: 123456" /> },
                    { campo: 'fecha', label: 'Fecha', input: <input type="date" value={f.fecha} disabled={bloqueada} onChange={(ev) => cambiar(f.clave, 'fecha', ev.target.value)} className={`${INPUT} ${borde(e.fecha)}`} /> },
                    { campo: 'nombre', label: 'Nombre', input: <input value={f.nombre} disabled={bloqueada} onChange={(ev) => cambiar(f.clave, 'nombre', ev.target.value)} className={`${INPUT} ${borde(e.nombre)}`} placeholder="Ej: Juan Pérez" /> },
                    { campo: 'tipo', label: 'Tipo de documento', input: (
                      <select value={f.tipo} disabled={bloqueada} onChange={(ev) => cambiar(f.clave, 'tipo', ev.target.value)} className={`${INPUT} ${borde(e.tipo)}`}>
                        <option value="">Elegir…</option>
                        {TIPOS_DOCUMENTO.map((t) => <option key={t.id} value={t.id}>{t.id} — {t.label}</option>)}
                      </select>
                    ) },
                  ].map(({ campo, label, input }) => (
                    <label key={campo} className="block">
                      <span className="block text-[10.5px] font-semibold text-gray-500 dark:text-gray-400 mb-0.5">{label}</span>
                      {input}
                      {e[campo] && <span className="block text-[10.5px] text-red-600 mt-0.5">{e[campo]}</span>}
                    </label>
                  ))}
                </div>
                {puedeNombrar && (
                  <p className="mt-1.5 text-[10.5px] text-gray-400 dark:text-gray-500">
                    Se guardará como <span className="font-medium text-gray-600 dark:text-gray-300">{construirNombreRespaldo(f)}</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-end gap-2 bg-gray-50/60 dark:bg-gray-900/40">
          <button type="button" onClick={onCerrar} disabled={subiendo}
            className="h-8 px-3.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-[12px] font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={subir} disabled={subiendo || pendientes.length === 0}
            className="h-8 px-4 rounded-md bg-[#2383C2] hover:bg-[#1d6fa5] text-white text-[12px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
            {subiendo ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {subiendo ? 'Subiendo…' : `Subir ${pendientes.length || ''} documento(s)`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default FormularioRespaldo;
