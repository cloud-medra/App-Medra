import React, { useEffect, useRef } from 'react';
import { Download, FileDown, FileSpreadsheet, Settings, Upload, X } from 'lucide-react';
import PanelLateral from './ui/PanelLateral';
import { Boton } from './ui/TablaCodigos';
import Spinner from '../../../ui/Spinner';

const Bloque = ({ titulo, descripcion, children }) => (
  <section className="px-5 py-4 border-b border-slate-100 dark:border-gray-800">
    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400">{titulo}</h4>
    {descripcion && <p className="mt-1 text-[12px] text-slate-500 dark:text-gray-400">{descripcion}</p>}
    <div className="mt-3">{children}</div>
  </section>
);

// Exportar / plantilla / importación masiva. La lógica es la de los hooks de
// la vista clásica (useImportExportPendientes / useImportExportConCodigo);
// cada acción llega solo si el usuario tiene el permiso.
const PanelImportarExportar = ({
  abierto,
  onCerrar,
  titulo,
  totalExportar,
  onExportar,
  onDescargarPlantilla,
  importFile,
  onSelectFile,
  importing,
  onEjecutarImportacion,
  aceptar = '.csv,.xlsx,.xls',
  progreso,
  resetProgreso
}) => {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !importing) onCerrar(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [abierto, importing, onCerrar]);

  const encabezado = (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-gray-500">
        <Settings size={12} /> Importar y exportar
      </div>
      <h3 className="mt-1.5 text-[17px] font-semibold text-slate-900 dark:text-gray-50">{titulo}</h3>
    </div>
  );

  const porcentaje = progreso?.total ? Math.round((progreso.procesadas / progreso.total) * 100) : 0;

  return (
    <PanelLateral abierto={abierto} onSolicitarCierre={() => !importing && onCerrar()} encabezado={encabezado} ancho="max-w-[440px]">
      {onExportar && (
        <Bloque titulo="Exportar" descripcion={`${totalExportar.toLocaleString('es-ES')} registro${totalExportar !== 1 ? 's' : ''} con los filtros actuales. Solo se incluyen las columnas que puedes ver.`}>
          <Boton variante="primario" icono={Download} onClick={onExportar}>Exportar registros</Boton>
        </Bloque>
      )}
      {onDescargarPlantilla && (
        <Bloque titulo="Plantilla" descripcion="Archivo de ejemplo con las columnas que acepta la importación.">
          <Boton icono={FileDown} onClick={onDescargarPlantilla}>Descargar plantilla</Boton>
        </Bloque>
      )}
      {onEjecutarImportacion && (
        <Bloque titulo="Importación masiva" descripcion={`Formatos aceptados: ${aceptar.replaceAll(',', ', ')}`}>
          <input
            ref={inputRef}
            type="file"
            accept={aceptar}
            className="hidden"
            onChange={(e) => { onSelectFile(e.target.files?.[0] || null); resetProgreso?.(); e.target.value = ''; }}
          />
          {importFile ? (
            <div className="flex items-center gap-2 px-3 h-10 rounded-md border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800/60">
              <FileSpreadsheet size={16} className="text-[#2383C2] shrink-0" />
              <span className="flex-1 truncate text-[12px] text-slate-700 dark:text-gray-200">{importFile.name}</span>
              {!importing && (
                <button type="button" onClick={() => onSelectFile(null)} title="Quitar archivo" className="p-1 text-slate-400 hover:text-slate-600"><X size={14} /></button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full flex flex-col items-center gap-1 py-6 rounded-md border border-dashed border-slate-300 dark:border-gray-700 text-[12px] text-slate-500 hover:border-[#2383C2] hover:text-[#2383C2] transition-colors"
            >
              <Upload size={18} />
              Seleccionar archivo
            </button>
          )}
          <div className="mt-3 flex justify-end">
            <Boton variante="primario" icono={importing ? undefined : Upload} disabled={!importFile || importing} onClick={onEjecutarImportacion}>
              {importing && <Spinner size="sm" color="#ffffff" />}
              {importing ? 'Importando…' : 'Importar'}
            </Boton>
          </div>
          {progreso && (progreso.activo || progreso.finalizado) && (
            <div className="mt-4 space-y-2 text-[12px]">
              <div className="h-1.5 rounded-full bg-slate-100 dark:bg-gray-800 overflow-hidden">
                <div className="h-full bg-[#2383C2] transition-all" style={{ width: `${porcentaje}%` }} />
              </div>
              <p className="text-slate-500 tabular-nums">{progreso.procesadas} de {progreso.total} filas guardadas</p>
              {[...(progreso.invalidas || []), ...(progreso.fallidas || [])].length > 0 && (
                <ul className="max-h-40 overflow-y-auto rounded border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-2 space-y-0.5 text-amber-800 dark:text-amber-300">
                  {[...(progreso.invalidas || []), ...(progreso.fallidas || [])].map((f, i) => (
                    <li key={i}>Fila {f.fila}: {f.motivo}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Bloque>
      )}
    </PanelLateral>
  );
};

export default PanelImportarExportar;
