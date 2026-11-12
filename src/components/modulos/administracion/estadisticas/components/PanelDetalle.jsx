import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, FileSpreadsheet, Loader2 } from 'lucide-react';
import { useColumnasPermitidas } from '../../../../../hooks/useColumnasPermitidas';
import { useColumnResize } from '../../../../../hooks/useColumnResize';
import { useUser } from '../../../../../context/UserContext';
import { ThRedimensionable, ColgroupRedimensionable, ThRelleno, TdRelleno } from '../../../../ui/ThRedimensionable';
import Variacion from './Variacion';
import PrecioUnitario from './PrecioUnitario';
import { formatoNumero, formatoMonto } from './formato';
import { useAnchoPanel } from './useAnchoPanel';

const PATH_VISTA = '/administracion/estadisticas'; // = RUTA_VISTA_ESTADISTICAS

// Columnas de las tablas del detalle (sección 'detalle'). Monto y precio
// además exigen "Ver montos".
const COLUMNAS_DETALLE = [
  { key: 'nombre', label: 'Nombre', fija: true },
  { key: 'actual', label: 'Período' },
  { key: 'anterior', label: 'Período anterior' },
  { key: 'variacion', label: 'Variación %' },
  { key: 'monto', label: 'Monto' },
  { key: 'cantidad', label: 'Cantidad (códigos)' },
  { key: 'precio', label: 'Precio unitario (códigos)' }
];

// Anchos (px) de las columnas redimensionables de cada tabla del detalle; se
// recuerdan por tipo de tabla (las tres de cruces comparten anchos para que
// queden alineadas).
const MIN = 60;
const ANCHOS_CRUCE = [
  { key: 'nombre', ancho: 170, min: MIN },
  { key: 'actual', ancho: 84, min: MIN },
  { key: 'anterior', ancho: 84, min: MIN },
  { key: 'variacion', ancho: 76, min: MIN },
  { key: 'monto', ancho: 104, min: MIN }
];
const ANCHOS_CODIGOS = [
  { key: 'codigo', ancho: 90, min: MIN },
  { key: 'descripcion', ancho: 170, min: MIN },
  { key: 'cantidad', ancho: 72, min: MIN },
  { key: 'precio', ancho: 96, min: MIN },
  { key: 'monto', ancho: 104, min: MIN }
];

const th = 'px-3 py-1.5 text-etiqueta border-b border-r border-gray-200 dark:border-gray-700';
const td = 'px-3 py-1 border-b border-r border-gray-100 dark:border-gray-700/60 truncate';
const num = `${td} text-right tabular-nums`;
// La última fila no repite el borde inferior del recuadro.
const CLASE_TABLA = 'text-secundario border-collapse [&>tbody>tr:last-child>td]:border-b-0';

const Seccion = ({ titulo, cantidad, children }) => (
  <section>
    <h4 className="text-etiqueta uppercase tracking-wide text-tinta-secundaria mb-1.5">{titulo} <span className="normal-case">({cantidad})</span></h4>
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-x-auto">{children}</div>
  </section>
);

// Tabla de anchos fijos (table-layout fixed) con las columnas `columnas`
// visibles; lo que no cabe se corta con "…" y el tooltip muestra el texto
// completo. Una columna de relleno al final absorbe el espacio que sobra.
const TablaAnchos = ({ columnas, anchos, onResize, encabezados, vacio, filas, celdas }) => {
  const anchoTotal = columnas.reduce((suma, col) => suma + (anchos[col.key] ?? col.ancho), 0);
  return (
    <table className={CLASE_TABLA} style={{ tableLayout: 'fixed', width: anchoTotal, minWidth: '100%' }}>
      <ColgroupRedimensionable columnas={columnas} anchos={anchos} relleno />
      <thead className="bg-gray-50 dark:bg-gray-900 text-pequeno uppercase text-tinta-secundaria">
        <tr>
          {columnas.map((col) => {
            const e = encabezados[col.key];
            return (
              <ThRedimensionable key={col.key} col={col} anchos={anchos} onResize={onResize} title={e.title || e.label}
                className={`${th} ${e.izquierda ? 'text-left' : 'text-right'}`}>
                {e.label}
              </ThRedimensionable>
            );
          })}
          <ThRelleno className="border-b border-gray-200 dark:border-gray-700" />
        </tr>
      </thead>
      <tbody>
        {filas.length === 0 && <tr><td colSpan={columnas.length + 1} className="py-6 text-center text-tinta-atenuada">{vacio}</td></tr>}
        {filas.map((f) => (
          <tr key={f.clave}>
            {columnas.map((col) => celdas[col.key](f))}
            <TdRelleno className="border-b border-gray-100 dark:border-gray-700/60" />
          </tr>
        ))}
      </tbody>
    </table>
  );
};

// Cruce: médicos / cirugías / empresas, en admisiones o (detalle de un
// código) en cantidad usada, con su monto.
const TablaCruce = ({ titulo, filas, unidad, etiquetaActual, etiquetaAnterior, ver, conMontos, comparar, anchos, onResize }) => {
  const maximo = Math.max(1, ...filas.map((f) => f.actual));
  const visible = { nombre: true, actual: ver('actual'), anterior: comparar && ver('anterior'), variacion: comparar && ver('variacion'), monto: conMontos && ver('monto') };
  return (
    <Seccion titulo={titulo} cantidad={filas.filter((f) => f.actual > 0).length}>
      <TablaAnchos
        columnas={ANCHOS_CRUCE.filter((c) => visible[c.key])}
        anchos={anchos}
        onResize={onResize}
        vacio="Sin datos."
        filas={filas}
        encabezados={{
          nombre: { label: 'Nombre', izquierda: true },
          actual: { label: etiquetaActual, title: `${etiquetaActual} · ${unidad}` },
          anterior: { label: etiquetaAnterior, title: `${etiquetaAnterior} · ${unidad}` },
          variacion: { label: 'Variación' },
          monto: { label: 'Monto' },
        }}
        celdas={{
          nombre: (f) => (
            <td key="nombre" className={`${td} text-tinta-principal`} title={f.nombre}>
              <div className="truncate">{f.nombre}</div>
              <div className="h-1 mt-0.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden"><div className="h-full bg-[#2383C2] rounded-full" style={{ width: `${(f.actual / maximo) * 100}%` }} /></div>
            </td>
          ),
          actual: (f) => <td key="actual" className={`${num} text-etiqueta text-tinta-principal`} title={formatoNumero(f.actual)}>{formatoNumero(f.actual)}</td>,
          anterior: (f) => <td key="anterior" className={`${num} text-tinta-secundaria`} title={formatoNumero(f.anterior)}>{formatoNumero(f.anterior)}</td>,
          variacion: (f) => <td key="variacion" className={num}><Variacion diferencia={f.diferencia} variacion={f.variacion} compacto /></td>,
          monto: (f) => <td key="monto" className={`${num} text-tinta-principal`} title={formatoMonto(f.monto)}>{formatoMonto(f.monto)}</td>,
        }}
      />
    </Seccion>
  );
};

// Códigos usados por el médico, la cirugía o la empresa (por monto, de mayor
// a menor; sin "Ver montos", por cantidad).
const TablaCodigosDetalle = ({ filas, ver, conMontos, anchos, onResize }) => {
  const visible = { codigo: true, descripcion: true, cantidad: ver('cantidad'), precio: conMontos && ver('precio'), monto: conMontos && ver('monto') };
  return (
    <Seccion titulo="Códigos" cantidad={filas.length}>
      <TablaAnchos
        columnas={ANCHOS_CODIGOS.filter((c) => visible[c.key])}
        anchos={anchos}
        onResize={onResize}
        vacio="Sin códigos."
        filas={filas}
        encabezados={{
          codigo: { label: 'Código', izquierda: true },
          descripcion: { label: 'Descripción', izquierda: true },
          cantidad: { label: 'Cantidad' },
          precio: { label: 'Precio unit.', title: 'Precio unitario sin IVA (promedio si varió)' },
          monto: { label: 'Monto' },
        }}
        celdas={{
          codigo: (f) => <td key="codigo" className={`${td} ${f.sinCodigo ? 'italic text-amber-700 dark:text-amber-400' : 'text-etiqueta text-tinta-principal'}`} title={f.codigo}>{f.codigo}</td>,
          descripcion: (f) => <td key="descripcion" className={`${td} text-tinta-principal`} title={f.descripcion}>{f.descripcion || '—'}</td>,
          cantidad: (f) => <td key="cantidad" className={`${num} text-tinta-principal`} title={formatoNumero(f.actual)}>{formatoNumero(f.actual)}</td>,
          precio: (f) => <td key="precio" className={`${num} text-tinta-principal`}><PrecioUnitario fila={f} /></td>,
          monto: (f) => <td key="monto" className={`${num} text-etiqueta text-tinta-principal`} title={formatoMonto(f.monto)}>{formatoMonto(f.monto)}</td>,
        }}
      />
    </Seccion>
  );
};

// Detalle de un médico, cirugía, empresa o código: sus cruces y, para los
// tres primeros, los códigos que usó. Sale de los datos ya cargados (los
// códigos se leen una vez por sesión al abrir el primer detalle). Su ancho
// se ajusta arrastrando el borde izquierdo (useAnchoPanel).
const PanelDetalle = ({ singular, fila, esCodigo, cruces, codigos, cargandoCodigos, conMontos, comparar = true, etiquetaActual, etiquetaAnterior, puedeExportar, onExportar, onCerrar }) => {
  const { ver } = useColumnasPermitidas(PATH_VISTA, 'detalle', COLUMNAS_DETALLE);
  const usuario = useUser()?.userData?.uid;
  const cruce = useColumnResize(ANCHOS_CRUCE, { clave: 'estadisticas.detalle.cruces', usuario });
  const cods = useColumnResize(ANCHOS_CODIGOS, { clave: 'estadisticas.detalle.codigos', usuario });
  const { ancho, arrastrando, propsManija } = useAnchoPanel(usuario);
  useEffect(() => {
    const alTeclear = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);

  const unidad = esCodigo ? 'Cantidad usada' : 'Admisiones distintas';
  return createPortal(
    <div className="fixed inset-0 z-[90] flex justify-end" role="dialog" aria-modal="true" aria-labelledby="titulo-detalle-estadistica">
      <button type="button" className="absolute inset-0 bg-black/30 cursor-default" aria-label="Cerrar detalle" onClick={onCerrar} />
      {/* Ancho: el guardado (mín. 280 px), con tope del 70 % de la ventana; en celular, todo el ancho. */}
      <aside className="relative w-full sm:w-[var(--ancho-panel)] sm:max-w-[70vw] h-full bg-white dark:bg-gray-800 shadow-2xl flex flex-col" style={{ '--ancho-panel': `${ancho}px` }}>
        <div
          {...propsManija}
          title="Arrastra para cambiar el ancho · doble clic para volver al ancho por defecto"
          className="hidden sm:flex absolute -left-1.5 top-0 bottom-0 w-3 z-10 cursor-col-resize select-none touch-none items-center justify-center group/panel focus:outline-none"
        >
          <div className={`h-full w-[2px] transition-colors ${arrastrando ? 'bg-[#2383C2]' : 'bg-transparent group-hover/panel:bg-[#2383C2]/60 group-focus-visible/panel:bg-[#2383C2]'}`} />
        </div>
        <header className="px-5 py-3.5 border-b border-gray-200 dark:border-gray-700 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-pequeno uppercase tracking-wide text-[#2383C2]">{singular}</p>
            <h3 id="titulo-detalle-estadistica" className="text-titulo-seccion text-tinta-principal break-words">
              {esCodigo ? <>{fila.codigo}{fila.descripcion && <span className="text-tinta-secundaria"> · {fila.descripcion}</span>}</> : fila.nombre}
            </h3>
            <p className="mt-1 text-secundario text-tinta-secundaria">
              <b className="tabular-nums">{formatoNumero(fila.actual)}</b> {esCodigo ? 'unidades' : 'admisiones'} en {etiquetaActual}
              {comparar && (
                <>
                  <span className="text-tinta-atenuada"> · {formatoNumero(fila.anterior)} en {etiquetaAnterior} · </span>
                  <Variacion diferencia={fila.diferencia} variacion={fila.variacion} compacto />
                </>
              )}
              {esCodigo && <span className="text-tinta-secundaria"> · {formatoNumero(fila.admisiones)} admisiones</span>}
            </p>
            {conMontos && (
              <p className="mt-0.5 text-secundario text-tinta-secundaria">
                Monto <b className="tabular-nums text-tinta-principal">{formatoMonto(fila.monto)}</b>
                {comparar && (
                  <>
                    <span className="text-tinta-atenuada"> · {formatoMonto(fila.montoAnterior)} en {etiquetaAnterior} · </span>
                    <Variacion diferencia={fila.montoDiferencia} variacion={fila.montoVariacion} compacto />
                  </>
                )}
                {esCodigo && fila.precio != null && <span className="text-tinta-secundaria"> · precio unit. <PrecioUnitario fila={fila} /></span>}
              </p>
            )}
          </div>
          {puedeExportar && (
            <button type="button" onClick={onExportar} className="h-7 px-3 rounded-md border border-gray-300 dark:border-gray-600 text-etiqueta text-tinta-principal hover:border-[#2383C2] hover:text-[#2383C2] inline-flex items-center gap-1.5 shrink-0">
              <FileSpreadsheet size={13} /> Exportar
            </button>
          )}
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="p-1 text-tinta-atenuada hover:text-tinta-secundaria shrink-0"><X size={18} /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {cruces.map((c) => (
            <TablaCruce key={c.titulo} titulo={c.titulo} filas={c.filas} unidad={unidad} etiquetaActual={etiquetaActual} etiquetaAnterior={etiquetaAnterior} ver={ver} conMontos={conMontos} comparar={comparar} anchos={cruce.anchos} onResize={cruce.handleResize} />
          ))}
          {!esCodigo && (cargandoCodigos
            ? <p className="text-secundario text-tinta-atenuada"><Loader2 size={13} className="inline animate-spin mr-1" />Cargando códigos…</p>
            : codigos && <TablaCodigosDetalle filas={codigos} ver={ver} conMontos={conMontos} anchos={cods.anchos} onResize={cods.handleResize} />)}
        </div>
      </aside>
    </div>,
    document.body
  );
};

export default PanelDetalle;
