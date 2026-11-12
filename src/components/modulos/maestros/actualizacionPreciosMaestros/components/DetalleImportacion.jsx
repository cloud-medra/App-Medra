import { useState } from 'react';
import { CheckCircle2, MinusCircle, AlertTriangle, Download, Save, XCircle } from 'lucide-react';
import Spinner from '../../../../ui/Spinner';

const formatearPrecio = (n) => `$${Number(n || 0).toLocaleString('es-CL')}`;

const PESTANAS = [
  { key: 'actualizar', icono: CheckCircle2, clase: 'text-emerald-700 dark:text-emerald-300 border-emerald-500' },
  { key: 'omitidos', icono: MinusCircle, clase: 'text-tinta-secundaria border-slate-400' },
  { key: 'errores', icono: AlertTriangle, clase: 'text-red-600 dark:text-red-400 border-red-500' }
];

const claseTh = 'py-1 px-1.5 border-b border-slate-200 dark:border-gray-700';
const claseTd = 'py-1 px-1.5';

const TablaActualizar = ({ filas }) => (
  <table className="w-full text-left text-pequeno border-collapse">
    <thead className="bg-slate-100/70 dark:bg-gray-900 text-tinta-secundaria uppercase text-pequeno sticky top-0">
      <tr>
        <th className={`${claseTh} w-10 text-center`}>Fila</th>
        <th className={claseTh}>Referencia</th>
        <th className={claseTh}>Descripción</th>
        <th className={`${claseTh} text-right`}>Precio anterior</th>
        <th className={`${claseTh} text-right`}>Precio nuevo</th>
      </tr>
    </thead>
    <tbody>
      {filas.map(f => (
        <tr key={`${f.fila}-${f.id || f.referencia}`} className="border-b border-slate-100 dark:border-gray-700/60">
          <td className={`${claseTd} text-center text-tinta-atenuada`}>{f.fila}</td>
          <td className={`${claseTd} text-numero-tabla text-tinta-principal`}>{f.referencia}</td>
          <td className={`${claseTd} text-tinta-secundaria`}>{f.descripcion}</td>
          <td className={`${claseTd} text-right text-tinta-secundaria`}>{formatearPrecio(f.precioAnterior)}</td>
          <td className={`${claseTd} text-right text-etiqueta text-emerald-600 dark:text-emerald-400`}>{formatearPrecio(f.precioNuevo)}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const TablaMotivo = ({ filas, claseMotivo }) => (
  <table className="w-full text-left text-pequeno border-collapse">
    <thead className="bg-slate-100/70 dark:bg-gray-900 text-tinta-secundaria uppercase text-pequeno sticky top-0">
      <tr>
        <th className={`${claseTh} w-10 text-center`}>Fila</th>
        <th className={claseTh}>Referencia</th>
        <th className={claseTh}>Motivo</th>
      </tr>
    </thead>
    <tbody>
      {filas.map(f => (
        <tr key={`${f.fila}-${f.motivo}`} className="border-b border-slate-100 dark:border-gray-700/60">
          <td className={`${claseTd} text-center text-tinta-atenuada`}>{f.fila}</td>
          <td className={`${claseTd} text-numero-tabla text-tinta-principal`}>{f.referencia || '—'}</td>
          <td className={`${claseTd} ${claseMotivo}`}>{f.motivo}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

// Vista previa (modo "preview": con Confirmar/Cancelar) o resumen final
// (modo "resumen") de una importación, con una pestaña por categoría.
const DetalleImportacion = ({
  modo,
  archivo,
  actualizar,
  omitidos,
  errores,
  guardando,
  errorGuardado,
  onConfirmar,
  onCancelar,
  onCerrar,
  onDescargarErrores
}) => {
  const esPreview = modo === 'preview';
  const listas = { actualizar, omitidos, errores };
  const titulos = {
    actualizar: esPreview ? 'Se actualizarán' : 'Referencias actualizadas',
    omitidos: esPreview ? 'Se omitirán' : 'Referencias omitidas',
    errores: 'Errores'
  };
  const [pestana, setPestana] = useState(actualizar.length > 0 || errores.length === 0 ? 'actualizar' : 'errores');
  const filas = listas[pestana];

  return (
    <div className={`bg-white dark:bg-gray-800 rounded border shadow-2xs flex flex-col ${esPreview ? 'border-amber-300 dark:border-amber-700' : 'border-emerald-300 dark:border-emerald-700'}`}>
      <div className="px-2.5 py-1.5 border-b border-slate-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-pequeno uppercase tracking-wide text-tinta-principal">
            {esPreview ? 'Vista previa de la importación' : 'Resumen de la importación'}
          </h3>
          <p className="text-pequeno tabular-nums text-tinta-secundaria truncate max-w-[340px]">{archivo}</p>
        </div>
        {errores.length > 0 && (
          <button
            type="button"
            onClick={onDescargarErrores}
            className="flex items-center gap-1 px-2 py-1 rounded text-pequeno bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 transition cursor-pointer"
          >
            <Download size={11} />
            <span>Descargar detalle de errores</span>
          </button>
        )}
      </div>

      <div className="flex border-b border-slate-200 dark:border-gray-700 text-pequeno">
        {PESTANAS.map(({ key, icono: Icono, clase }) => (
          <button
            key={key}
            type="button"
            onClick={() => setPestana(key)}
            className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-etiqueta border-b-2 transition cursor-pointer ${pestana === key ? clase : 'border-transparent text-tinta-atenuada hover:text-tinta-secundaria'}`}
          >
            <Icono size={12} />
            <span>{titulos[key]}: {listas[key].length}</span>
          </button>
        ))}
      </div>

      <div className="overflow-auto max-h-72">
        {filas.length === 0 ? (
          <div className="p-4 text-center text-pequeno text-tinta-atenuada">Sin filas en esta categoría.</div>
        ) : pestana === 'actualizar' ? (
          <TablaActualizar filas={filas} />
        ) : (
          <TablaMotivo filas={filas} claseMotivo={pestana === 'errores' ? 'text-red-600 dark:text-red-400' : 'text-tinta-secundaria'} />
        )}
      </div>

      {errorGuardado && (
        <div role="alert" className="mx-2 mt-2 p-2 rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-pequeno text-red-700 dark:text-red-300">
          <p className="text-etiqueta">{errorGuardado.mensaje}</p>
          {errorGuardado.detalle.length > 0 && (
            <ul className="list-disc pl-4 mt-1 space-y-0.5 max-h-24 overflow-auto">
              {errorGuardado.detalle.map(d => <li key={d}>{d}</li>)}
            </ul>
          )}
          {errorGuardado.detalle.length > 0 && <p className="mt-1">Vuelva a importar el archivo para ver los precios actuales.</p>}
        </div>
      )}

      <div className="p-2 mt-2 bg-slate-50 dark:bg-gray-900/60 border-t border-slate-200 dark:border-gray-700 flex items-center justify-between gap-2">
        <span className="text-pequeno text-tinta-secundaria">
          {esPreview
            ? actualizar.length === 0
              ? 'No hay precios para actualizar en este archivo.'
              : 'Se guardarán todos los precios válidos juntos, o ninguno si ocurre un error.'
            : 'Cada cambio quedó registrado en el historial del código y en el historial de importaciones.'}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {esPreview ? (
            <>
              <button
                type="button"
                onClick={onCancelar}
                disabled={guardando}
                className="px-3 py-1 bg-white hover:bg-red-50 dark:bg-gray-800 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 rounded border border-red-200 dark:border-red-800 flex items-center gap-1.5 transition cursor-pointer text-pequeno disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <XCircle size={12} />
                <span>Cancelar</span>
              </button>
              <button
                type="button"
                onClick={onConfirmar}
                disabled={guardando || actualizar.length === 0}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded shadow-2xs flex items-center gap-1.5 transition cursor-pointer text-pequeno disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {guardando ? <Spinner size="xs" color="#ffffff" /> : <Save size={12} />}
                <span>{guardando ? 'Guardando…' : `Confirmar y actualizar ${actualizar.length} precios`}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onCerrar}
              className="px-3 py-1 bg-slate-200 dark:bg-gray-700 text-tinta-principal rounded hover:bg-slate-300 transition cursor-pointer text-pequeno"
            >
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DetalleImportacion;
