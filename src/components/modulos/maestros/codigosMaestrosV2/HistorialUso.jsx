import React, { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { Insignia } from './ui/TablaCodigos';
import { resumenUso } from '../../../../../functions/usoCodigos/nucleo.mjs';
import { cargarUsoCodigo } from './accionesCodigos';
import { FILAS_VISIBLES, MAX_CARACTERES_DESCRIPCION, fechaCorta, indicadoresUso } from './historialUsoVista';

const BOTON_ENLACE = 'text-[11px] font-semibold text-[#2383C2] dark:text-[#369BCE] hover:underline';
const CELDA_ENCABEZADO = 'px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400 border-b border-slate-200 dark:border-gray-700';
const CELDA = 'px-3 py-2 align-top text-[12px]';
const CELDA_NUMERO = `${CELDA} text-right tabular-nums text-slate-600 dark:text-gray-300`;

const Indicador = ({ etiqueta, valor }) => (
  <div className="flex flex-col justify-between gap-1 rounded-lg border border-slate-200 dark:border-gray-700 px-2.5 py-2">
    <dt className="text-[11px] leading-tight text-slate-500 dark:text-gray-400">{etiqueta}</dt>
    <dd className="text-[15px] font-semibold tabular-nums text-slate-900 dark:text-gray-50">{valor}</dd>
  </div>
);

const TextoRecortable = ({ texto }) => {
  const [expandido, setExpandido] = useState(false);
  const largo = String(texto).length > MAX_CARACTERES_DESCRIPCION;
  return (
    <>
      <span className="block font-medium text-slate-700 dark:text-gray-200 whitespace-pre-wrap break-words">
        {largo && !expandido ? `${String(texto).slice(0, MAX_CARACTERES_DESCRIPCION).trimEnd()}…` : texto}
      </span>
      {largo && (
        <button type="button" onClick={() => setExpandido((v) => !v)} className={`mt-0.5 ${BOTON_ENLACE}`}>
          {expandido ? 'Ver menos' : 'Ver más'}
        </button>
      )}
    </>
  );
};

// Tarjeta de una sección. Las columnas son fijas (table-fixed) y el texto se
// parte: nunca hay scroll horizontal, en el panel ni en un teléfono.
const TarjetaTabla = ({ titulo, columnas, filas, renderFila }) => {
  const [verTodas, setVerTodas] = useState(false);
  const visibles = verTodas ? filas : filas.slice(0, FILAS_VISIBLES);
  return (
    <section aria-label={titulo} className="rounded-lg border border-slate-200 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <h4 className="text-[13px] font-semibold text-slate-900 dark:text-gray-50">{titulo}</h4>
        <Insignia>{filas.length}</Insignia>
      </div>
      {filas.length === 0 ? (
        <p className="px-3 pb-3 text-[12px] text-slate-400 dark:text-gray-500">Sin registros.</p>
      ) : (
        <table className="w-full table-fixed border-t border-slate-200 dark:border-gray-700">
          <thead className="bg-slate-50 dark:bg-gray-800/60">
            <tr>
              {columnas.map(({ texto, clase }) => <th key={texto} scope="col" className={`${CELDA_ENCABEZADO} ${clase}`}>{texto}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
            {visibles.map((fila) => <tr key={fila.clave}>{renderFila(fila)}</tr>)}
          </tbody>
        </table>
      )}
      {filas.length > FILAS_VISIBLES && (
        <div className="px-3 py-2 text-center border-t border-slate-100 dark:border-gray-800">
          <button type="button" onClick={() => setVerTodas((v) => !v)} className={BOTON_ENLACE}>
            {verTodas ? 'Ver menos' : `Ver todos (${filas.length})`}
          </button>
        </div>
      )}
    </section>
  );
};

const COLUMNAS_MEDICOS = [
  { texto: 'Médico', clase: 'text-left' },
  { texto: 'Usos', clase: 'text-right w-16' },
  { texto: 'Último uso', clase: 'text-right w-28' },
];
const COLUMNAS_DESCRIPCIONES = [
  { texto: 'Descripción', clase: 'text-left' },
  { texto: 'Usos', clase: 'text-right w-16' },
  { texto: 'Médicos', clase: 'text-left w-[38%]' },
];

const filaMedico = (fila) => (
  <>
    <td className={`${CELDA} font-medium text-slate-700 dark:text-gray-200 break-words`}>{fila.nombre}</td>
    <td className={CELDA_NUMERO}>{fila.usos}</td>
    <td className={CELDA_NUMERO}>{fechaCorta(fila.ultimoUso)}</td>
  </>
);

const filaDescripcion = (fila) => (
  <>
    <td className={CELDA}><TextoRecortable texto={fila.nombre} /></td>
    <td className={CELDA_NUMERO}>{fila.usos}</td>
    <td className={`${CELDA} text-[11px] leading-snug text-slate-500 dark:text-gray-400 break-words`}>{fila.medicos.join(', ') || '—'}</td>
  </>
);

const BloqueCargando = ({ className }) => <div className={`rounded-lg bg-slate-100 dark:bg-gray-800 ${className}`} />;

const EsqueletoUso = () => (
  <div role="status" aria-label="Cargando historial de uso" className="space-y-4 animate-pulse">
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {[0, 1, 2, 3].map((i) => <BloqueCargando key={i} className="h-[62px]" />)}
    </div>
    <BloqueCargando className="h-40" />
    <BloqueCargando className="h-40" />
  </div>
);

// Médicos y descripciones (campo "Descripción / Nota Operatoria" de la gestión)
// con que se ha usado la referencia en Implantes.
// Se monta solo al abrir su pestaña: 1 lectura (maestros_codigos_uso).
const HistorialUso = ({ referencia }) => {
  const [uso, setUso] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(null);
    setUso(null);
    cargarUsoCodigo(referencia)
      .then((datos) => { if (vigente) setUso(datos); })
      .catch((err) => { console.error('Error cargando el uso del código:', err); if (vigente) setError('No se pudo cargar el historial de uso.'); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [referencia]);

  if (cargando) return <EsqueletoUso />;
  if (error) return <p className="py-16 text-center text-[13px] text-red-600">{error}</p>;
  if (!uso) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <History size={24} className="text-slate-300 dark:text-gray-600" aria-hidden />
        <p className="text-[13px] text-slate-500 dark:text-gray-400">Este código aún no tiene usos registrados</p>
        <p className="text-[11px] text-slate-400 dark:text-gray-500">Se consideran las cargas vigentes de Implantes.</p>
      </div>
    );
  }

  const { medicos, descripciones } = resumenUso(uso);
  const indicadores = indicadoresUso(uso);
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Indicador etiqueta="Total de usos" valor={indicadores.totalUsos} />
        <Indicador etiqueta="Médicos distintos" valor={indicadores.medicos} />
        <Indicador etiqueta="Descripciones distintas" valor={indicadores.descripciones} />
        <Indicador etiqueta="Último uso" valor={fechaCorta(indicadores.ultimoUso)} />
      </dl>
      <TarjetaTabla titulo="Médicos" columnas={COLUMNAS_MEDICOS} filas={medicos} renderFila={filaMedico} />
      <TarjetaTabla titulo="Descripción / Nota Operatoria" columnas={COLUMNAS_DESCRIPCIONES} filas={descripciones} renderFila={filaDescripcion} />
      <p className="text-[11px] text-slate-400 dark:text-gray-500">Se consideran las cargas vigentes de Implantes.</p>
    </div>
  );
};

export default HistorialUso;
