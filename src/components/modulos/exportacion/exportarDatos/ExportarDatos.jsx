import { useMemo, useState } from 'react';
import { DatabaseZap, Download, Loader2, Search } from 'lucide-react';
import { useToast } from '../../../../context/ToastContext';
import { useExportarDatosData } from './useExportarDatosData';
import { COLUMNAS_TABLA, descargarExportacion } from './filasExportacion';

// Exportación → Exportar datos (solo Desarrollador): elige año y mes y
// muestra en una sola tabla lo registrado en Implantes, Consignación y
// Hemodinamia; "Descargar Excel" baja esa tabla y dos hojas con las columnas
// de Gestiones e Ítems de la planilla de Implantes, para pegarlas ahí.
// Lee solo al presionar "Cargar" (ver useExportarDatosData.js).
const NOMBRES_MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const CONTROL = 'h-7 px-2 text-normal rounded-md border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-tinta-principal';
const NUMERICAS = new Set(['totalCotizacion', 'cantidad']);
const COLOR_SEGMENTO = {
  IMPLANTES: 'text-sky-700 dark:text-sky-400',
  CONSIGNACION: 'text-fuchsia-700 dark:text-fuchsia-400',
  HEMODINAMIA: 'text-emerald-700 dark:text-emerald-400',
};

// 'AAAA-MM-DD' → 'DD-MM-AAAA' para mostrar; otro texto tal cual.
const fechaVista = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : (v || '');
};
const valorVista = (k, v) => {
  if (k === 'fecha' || k === 'vencimiento') return fechaVista(v);
  if (k === 'totalCotizacion' && typeof v === 'number') return v.toLocaleString('es-CL');
  return v ?? '';
};

const ExportarDatos = () => {
  const { showToast } = useToast();
  const hoy = new Date();
  const [anio, setAnio] = useState(String(hoy.getFullYear()));
  const [mes, setMes] = useState(String(hoy.getMonth() + 1).padStart(2, '0'));
  const [lineaInicial, setLineaInicial] = useState(1);
  const [busqueda, setBusqueda] = useState('');
  const { cargando, error, filas, conteo, periodo, cargar } = useExportarDatosData();

  const visibles = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    if (!filas || !t) return filas || [];
    return filas.filter((f) => COLUMNAS_TABLA.some(([k]) => String(f[k] ?? '').toLowerCase().includes(t)));
  }, [filas, busqueda]);

  const descargar = () => {
    if (!filas?.length || !periodo) return;
    try {
      descargarExportacion(filas, { ...periodo, lineaInicial: Math.max(1, Number(lineaInicial) || 1) });
    } catch (err) {
      console.error('Exportar datos: no se pudo generar el Excel', err);
      showToast('No se pudo generar el Excel', 'error');
    }
  };

  const anioValido = /^\d{4}$/.test(anio);

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden">
      <div className="px-3 py-2 flex flex-wrap items-center gap-2.5 border-b border-slate-200 dark:border-gray-700 bg-slate-50/50 dark:bg-gray-800/80">
        <h2 className="text-titulo-seccion text-tinta-principal flex items-center gap-1.5 mr-2">
          <DatabaseZap size={15} className="text-[#2383C2]" />
          Exportar datos
        </h2>
        <label className="flex items-center gap-1.5 text-etiqueta text-tinta-secundaria">
          Año
          <input value={anio} onChange={(e) => setAnio(e.target.value.replace(/\D/g, '').slice(0, 4))} className={`${CONTROL} w-20 tabular-nums`} inputMode="numeric" />
        </label>
        <label className="flex items-center gap-1.5 text-etiqueta text-tinta-secundaria">
          Mes
          <select value={mes} onChange={(e) => setMes(e.target.value)} className={CONTROL}>
            {NOMBRES_MESES.map((n, i) => <option key={n} value={String(i + 1).padStart(2, '0')}>{n}</option>)}
          </select>
        </label>
        <button
          type="button"
          onClick={() => cargar(anio, mes)}
          disabled={cargando || !anioValido}
          className="h-7 px-3 rounded text-etiqueta flex items-center gap-1.5 bg-[#2383C2] hover:bg-[#369BCE] text-white transition disabled:opacity-50"
        >
          {cargando ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          Cargar
        </button>
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-etiqueta text-tinta-secundaria" title="N° de línea de la primera fila libre de la hoja Ítems de la planilla, donde pegará: la Línea padre usa esos números.">
          N° línea inicial en Ítems
          <input type="number" min={1} value={lineaInicial} onChange={(e) => setLineaInicial(e.target.value)} className={`${CONTROL} w-20 tabular-nums`} />
        </label>
        <button
          type="button"
          onClick={descargar}
          disabled={cargando || !filas?.length}
          className="h-7 px-3 rounded text-etiqueta flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white transition disabled:opacity-50"
        >
          <Download size={13} />
          Descargar Excel
        </button>
      </div>

      <div className="px-3 py-1.5 flex flex-wrap items-center gap-3 border-b border-slate-200 dark:border-gray-700 text-pequeno text-tinta-secundaria">
        {conteo && periodo ? (
          <span>
            {NOMBRES_MESES[Number(periodo.mes) - 1]} {periodo.anio}: {conteo.implantes} gestión(es) de Implantes, {conteo.hemodinamia} de Hemodinamia y {conteo.consignacion} registro(s) de Consignación · {filas.length} fila(s)
          </span>
        ) : (
          <span>Elija año y mes y presione Cargar (lee todas las gestiones y registros de ese mes).</span>
        )}
        {filas?.length > 0 && (
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar en la tabla…" className={`${CONTROL} ml-auto w-56`} />
        )}
      </div>

      {error && <p className="px-3 py-2 text-secundario text-rose-700 dark:text-rose-400">{error}</p>}

      <div className="flex-grow overflow-auto">
        <table className="w-full text-left text-secundario border-collapse">
          <thead className="bg-slate-100 dark:bg-gray-900 sticky top-0 z-10">
            <tr className="text-tinta-secundaria uppercase text-pequeno">
              {COLUMNAS_TABLA.map(([k, t]) => (
                <th key={k} className={`py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 whitespace-nowrap ${NUMERICAS.has(k) ? 'text-right' : ''}`}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas && visibles.length === 0 && (
              <tr><td colSpan={COLUMNAS_TABLA.length} className="py-6 text-center text-tinta-atenuada">Sin datos{busqueda ? ' para esa búsqueda' : ' en ese mes'}.</td></tr>
            )}
            {visibles.map((f, i) => (
              <tr key={`${f.clave}-${f.idItem || i}-${i}`} className="hover:bg-slate-50 dark:hover:bg-gray-700/40">
                {COLUMNAS_TABLA.map(([k]) => (
                  <td
                    key={k}
                    className={`py-1 px-2 border-b border-r border-slate-100 dark:border-gray-700/60 whitespace-nowrap ${NUMERICAS.has(k) ? 'text-right text-numero-tabla' : 'text-tinta-principal'} ${k === 'segmento' ? `text-etiqueta ${COLOR_SEGMENTO[f.segmento] || ''}` : ''}`}
                  >
                    {valorVista(k, f[k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ExportarDatos;
