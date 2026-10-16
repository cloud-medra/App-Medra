import { useMemo } from 'react';
import { formatoCantidad } from '../shared/catalogosBodega';
import { BotonRestablecerAnchos } from '../../../ui/BotonRestablecerAnchos';
import { TablaBodega, FilaBodega, FilaAnchoCompleto } from '../shared/TablaBodega';
import { TD_BODEGA as TD, useAnchosTablaBodega } from '../shared/anchosTablaBodega';
import { useReferenciaDe } from '../shared/referencias';

// Tabla con el diseño del Maestro (TablaBodega). columnas: [{ key, label,
// ancho, min, alinear?, valor(l), clase?(l) }]; `clave` guarda los anchos.
const Tabla = ({ titulo, ayuda, columnas, filas, vacio, clave }) => {
  const { anchos, handleResize, restablecerAnchos, personalizados } = useAnchosTablaBodega(columnas, clave);
  return (
    <div>
      <div className="flex items-end justify-between gap-2 mb-1">
        <div>
          <h4 className="text-[11px] font-bold uppercase text-gray-600 dark:text-gray-300">{titulo}</h4>
          <p className="text-[11px] text-gray-500">{ayuda}</p>
        </div>
        <BotonRestablecerAnchos onClick={restablecerAnchos} personalizados={personalizados} />
      </div>
      <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto">
        <TablaBodega columnas={columnas} anchos={anchos} onResize={handleResize}>
          {filas.length === 0 && <FilaAnchoCompleto columnas={columnas} celdaClassName="px-2 py-3 text-center text-gray-400 italic">{vacio}</FilaAnchoCompleto>}
          {filas.map((l) => (
            <FilaBodega key={l.productoId} columnas={columnas} celdas={Object.fromEntries(columnas.map((c) => {
              const valor = c.valor(l);
              return [c.key, <td className={`${TD} ${c.alinear ? `${c.alinear} font-num` : ''} ${c.clase?.(l) || ''}`} title={typeof valor === 'string' ? valor : undefined}>{valor}</td>];
            }))} />
          ))}
        </TablaBodega>
      </div>
    </div>
  );
};

const cantidad = (key, label, campo, clase) => ({ key, label, alinear: 'text-right', ancho: 95, min: 60, valor: (l) => formatoCantidad(l[campo]), clase });

// Los dos detalles de un inventario de caja: consumo vs. el stock actual
// registrado y faltante vs. el stock objetivo.
const ResultadoInventario = ({ lineas }) => {
  const referenciaDe = useReferenciaDe();
  const [columnasConsumo, columnasFaltante] = useMemo(() => {
    const comunes = [
      { key: 'producto', label: 'Producto', ancho: 260, min: 110, valor: (l) => l.nombre, clase: () => 'font-semibold text-gray-800 dark:text-gray-100' },
      { key: 'referencia', label: 'Referencia', ancho: 120, min: 60, valor: (l) => referenciaDe(l.productoId) || '—', clase: () => 'font-num text-gray-700 dark:text-gray-200' },
    ];
    return [
      [
        ...comunes,
        cantidad('actualPrevio', 'Actual previo', 'actualPrevio'),
        cantidad('contado', 'Contado', 'contado'),
        cantidad('consumo', 'Consumo', 'consumo', (l) => (l.consumo > 0 ? 'font-bold text-amber-600' : l.consumo < 0 ? 'text-emerald-600' : 'text-gray-400')),
      ],
      [
        ...comunes,
        cantidad('objetivo', 'Objetivo', 'objetivo'),
        cantidad('contado', 'Contado', 'contado'),
        cantidad('faltante', 'Faltante', 'faltante', (l) => (l.faltante ? 'font-bold text-red-600' : 'text-gray-400')),
      ],
    ];
  }, [referenciaDe]);
  return (
    <div className="flex flex-col gap-3">
      <Tabla
        titulo="1. Consumo / diferencia vs. stock actual"
        ayuda="Actual registrado − contado: lo que se usó o se perdió desde la última vez (negativo = apareció de más)."
        clave="bodega.caja.resultado.consumo"
        columnas={columnasConsumo}
        filas={lineas}
        vacio="Sin productos."
      />
      <Tabla
        titulo="2. Faltante vs. stock objetivo"
        ayuda="Objetivo − contado: lo que hay que reponer para dejar la caja completa."
        clave="bodega.caja.resultado.faltante"
        columnas={columnasFaltante}
        filas={lineas.filter((l) => l.faltante > 0)}
        vacio="La caja quedó completa: no falta nada."
      />
    </div>
  );
};

export default ResultadoInventario;
