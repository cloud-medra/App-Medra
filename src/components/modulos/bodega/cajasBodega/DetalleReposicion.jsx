import { formatoCantidad } from '../shared/catalogosBodega';
import { BotonRestablecerAnchos } from '../../../ui/BotonRestablecerAnchos';
import { TablaBodega, FilaBodega } from '../shared/TablaBodega';
import { TD_BODEGA as TD, useAnchosTablaBodega } from '../shared/anchosTablaBodega';
import { useReferenciaDe } from '../shared/referencias';
import { textoLotes } from './cajas';

// Mismo diseño que el Maestro (TablaBodega): columnas redimensionables.
const COLUMNAS = [
  { key: 'producto', label: 'Producto', ancho: 240, min: 110 },
  { key: 'referencia', label: 'Referencia', ancho: 115, min: 60 },
  { key: 'faltanteAntes', label: 'Faltante antes', alinear: 'text-right', ancho: 105, min: 60 },
  { key: 'repuesto', label: 'Repuesto', alinear: 'text-right', ancho: 80, min: 55 },
  { key: 'pendiente', label: 'Pendiente', alinear: 'text-right', ancho: 80, min: 55 },
  { key: 'lotes', label: 'Lotes', ancho: 180, min: 70 },
];

// Detalle de una reposición: lo repuesto (con los lotes que salieron de la
// Bodega General) y lo que quedó pendiente.
const DetalleReposicion = ({ lineas }) => {
  const { anchos, handleResize, restablecerAnchos, personalizados } = useAnchosTablaBodega(COLUMNAS, 'bodega.caja.reposicion');
  const referenciaDe = useReferenciaDe();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-end"><BotonRestablecerAnchos onClick={restablecerAnchos} personalizados={personalizados} /></div>
      <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto">
        <TablaBodega columnas={COLUMNAS} anchos={anchos} onResize={handleResize}>
          {lineas.map((l) => {
            const referencia = referenciaDe(l.productoId);
            const lotes = textoLotes(l.lotes);
            const celdas = {
              producto: <td className={`${TD} text-etiqueta text-tinta-principal`} title={l.nombre}>{l.nombre}</td>,
              referencia: <td className={`${TD} text-numero-tabla text-tinta-principal`} title={referencia ? `${referencia} · ${l.codigoMaestro || ''}` : l.codigoMaestro}>{referencia || '—'}</td>,
              faltanteAntes: <td className={`${TD} text-right text-numero-tabla`}>{formatoCantidad(l.faltanteAntes)}</td>,
              repuesto: <td className={`${TD} text-right ${l.cantidad ? 'text-etiqueta tabular-nums text-emerald-600' : 'text-numero-tabla text-tinta-atenuada'}`}>{formatoCantidad(l.cantidad)}</td>,
              pendiente: <td className={`${TD} text-right ${l.pendiente ? 'text-etiqueta tabular-nums text-red-600' : 'text-numero-tabla text-tinta-atenuada'}`}>{l.pendiente ? formatoCantidad(l.pendiente) : '—'}</td>,
              lotes: <td className={`${TD} text-numero-tabla text-tinta-secundaria`} title={lotes}>{lotes}</td>,
            };
            return <FilaBodega key={l.productoId} columnas={COLUMNAS} celdas={celdas} />;
          })}
        </TablaBodega>
      </div>
    </div>
  );
};

export default DetalleReposicion;
