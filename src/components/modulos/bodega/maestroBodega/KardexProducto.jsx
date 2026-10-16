import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, FileSpreadsheet, FileText } from 'lucide-react';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { useColumnasPermitidas } from '../../../../hooks/useColumnasPermitidas';
import { TIPOS_MOVIMIENTO, ETIQUETA_ID_ENTREGA } from '../../../../../functions/bodega/nucleo.mjs';
import { leerKardex, mensajeError } from '../shared/bodegaApi';
import { exportarExcel, exportarCsv } from '../shared/exportar';
import { fechaHora } from '../shared/transito/transitos';
import { ordenarKardex, signoMovimiento, referenciaMovimiento } from './kardex';
import { BotonRestablecerAnchos } from '../../../ui/BotonRestablecerAnchos';
import { TablaBodega, FilaBodega, FilaAnchoCompleto } from '../shared/TablaBodega';
import { TD_BODEGA as TD, useAnchosTablaBodega } from '../shared/anchosTablaBodega';

const PATH_VISTA = '/bodega/maestroBodega';
// Mismo diseño que el Maestro (TablaBodega): columnas redimensionables.
const COLUMNAS = [
  { key: 'fecha', label: 'Fecha', fija: true, ancho: 115, min: 80 },
  { key: 'tipo', label: 'Tipo', fija: true, ancho: 120, min: 60 },
  { key: 'lote', label: 'Lote', ancho: 95, min: 50 },
  { key: 'vencimiento', label: 'Venc.', ancho: 85, min: 60 },
  { key: 'propietario', label: 'Dueño', ancho: 90, min: 50 },
  { key: 'centro', label: 'Centro', ancho: 120, min: 60 },
  { key: 'cantidad', label: 'Cant.', alinear: 'text-right', fija: true, ancho: 60, min: 45 },
  { key: 'saldoLote', label: 'Saldo lote', alinear: 'text-right', ancho: 85, min: 55 },
  { key: 'saldo', label: 'Saldo prod. (disp. / tráns. / en centro)', alinear: 'text-right', ancho: 110, min: 60 },
  { key: 'documento', label: 'Documento', ancho: 120, min: 60 },
  { key: 'usuario', label: 'Usuario', ancho: 110, min: 60 },
  { key: 'observacion', label: 'N° admisión / observación', ancho: 200, min: 80 },
];
const COLOR = { 1: 'text-emerald-600 dark:text-emerald-400', '-1': 'text-red-600 dark:text-red-400', 0: 'text-amber-600 dark:text-amber-400' };
const INPUT = 'h-8 px-1.5 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-900';

// Kardex completo del producto (movimientos más recientes primero), con
// filtros por fecha, tipo y centro, paginado de a 200 y exportable.
const KardexProducto = ({ producto }) => {
  const { hasPermission } = useGranularPermission();
  const { columnasVisibles } = useColumnasPermitidas(PATH_VISTA, 'kardex', COLUMNAS);
  const { anchos, handleResize, restablecerAnchos, personalizados } = useAnchosTablaBodega(columnasVisibles, 'bodega.kardex');
  const { datos: centros } = useCatalogo('centros');
  const [filtros, setFiltros] = useState({ desde: '', hasta: '', tipo: '', centroId: '' });
  const [movimientos, setMovimientos] = useState(null);
  const [ultimo, setUltimo] = useState(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    leerKardex(producto.id, filtros)
      .then((r) => { if (vigente) { setMovimientos(r.movimientos); setUltimo(r.ultimo); setError(''); } })
      .catch((e) => { if (vigente) { setMovimientos([]); setError(mensajeError(e, 'No se pudo leer el kardex.')); } });
    return () => { vigente = false; };
  }, [producto.id, filtros, version]);

  const cargarMas = async () => {
    try {
      const r = await leerKardex(producto.id, filtros, ultimo);
      setMovimientos((m) => [...m, ...r.movimientos]);
      setUltimo(r.ultimo);
    } catch (e) {
      setError(mensajeError(e));
    }
  };

  const filas = useMemo(() => ordenarKardex(movimientos || []), [movimientos]);
  const cambiar = (campo) => (e) => { setMovimientos(null); setFiltros((f) => ({ ...f, [campo]: e.target.value })); };
  const columnasExport = [
    { titulo: 'Fecha', valor: (m) => fechaHora(m.fecha) },
    { titulo: 'Tipo', valor: (m) => TIPOS_MOVIMIENTO[m.tipo]?.etiqueta || m.tipo },
    { titulo: 'Lote', valor: (m) => m.lote || '—' },
    { titulo: 'Vencimiento', valor: (m) => m.vencimiento || '—' },
    { titulo: 'Dueño', valor: (m) => m.propietarioNombre || 'Propio' },
    { titulo: 'Centro', valor: (m) => m.centroNombre || '' },
    { titulo: 'Cantidad', valor: (m) => m.cantidad },
    { titulo: 'Saldo lote disponible', valor: (m) => m.saldoLote?.disponible },
    { titulo: 'Saldo lote tránsito', valor: (m) => m.saldoLote?.transito },
    { titulo: 'Saldo lote dejado en centro', valor: (m) => m.saldoLote?.enCentro || 0 },
    { titulo: 'Saldo producto disponible', valor: (m) => m.saldoProducto?.disponible },
    { titulo: 'Saldo producto tránsito', valor: (m) => m.saldoProducto?.transito },
    { titulo: 'Saldo producto dejado en centro', valor: (m) => m.saldoProducto?.enCentro || 0 },
    { titulo: 'Documento', valor: referenciaMovimiento },
    { titulo: 'Usuario', valor: (m) => m.usuario?.nombre || '' },
    { titulo: ETIQUETA_ID_ENTREGA, valor: (m) => m.idEntrega || '' },
    { titulo: 'Observación', valor: (m) => m.observacion || '' },
  ];
  const base = `kardex_${producto.codigoMaestro}`;

  return (
    <div className="flex flex-col gap-2 text-[11px]">
      <div className="flex flex-wrap items-end gap-1.5">
        <label className="flex flex-col"><span className="text-[10px] font-bold uppercase text-gray-500">Desde</span><input type="date" value={filtros.desde} onChange={cambiar('desde')} className={INPUT} /></label>
        <label className="flex flex-col"><span className="text-[10px] font-bold uppercase text-gray-500">Hasta</span><input type="date" value={filtros.hasta} onChange={cambiar('hasta')} className={INPUT} /></label>
        <label className="flex flex-col"><span className="text-[10px] font-bold uppercase text-gray-500">Tipo</span>
          <select value={filtros.tipo} onChange={cambiar('tipo')} className={INPUT}>
            <option value="">Todos</option>
            {Object.entries(TIPOS_MOVIMIENTO).map(([k, v]) => <option key={k} value={k}>{v.etiqueta}</option>)}
          </select>
        </label>
        <label className="flex flex-col"><span className="text-[10px] font-bold uppercase text-gray-500">Centro</span>
          <select value={filtros.centroId} onChange={cambiar('centroId')} className={`${INPUT} max-w-[160px]`}>
            <option value="">Todos</option>
            {centros.filter((c) => c.nombre).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => { setMovimientos(null); setVersion((v) => v + 1); }} title="Actualizar" className="h-8 px-2 rounded border border-gray-300 dark:border-gray-600"><RefreshCw size={12} /></button>
        <div className="ml-auto"><BotonRestablecerAnchos onClick={restablecerAnchos} personalizados={personalizados} /></div>
        {hasPermission(PATH_VISTA, 'kardex', 'btn_exportar') && (
          <div className="flex gap-1">
            <button type="button" disabled={!filas.length} onClick={() => exportarExcel(base, [{ nombre: 'Kardex', columnas: columnasExport, filas }])} className="h-8 px-2 rounded border border-emerald-600 text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1 disabled:opacity-40"><FileSpreadsheet size={12} /> Excel</button>
            <button type="button" disabled={!filas.length} onClick={() => exportarCsv(base, columnasExport, filas)} className="h-8 px-2 rounded border border-gray-400 text-gray-700 dark:text-gray-200 font-semibold flex items-center gap-1 disabled:opacity-40"><FileText size={12} /> CSV</button>
          </div>
        )}
      </div>
      {error && <p className="text-red-600">{error}</p>}
      <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto">
        <TablaBodega columnas={columnasVisibles} anchos={anchos} onResize={handleResize}>
          {movimientos === null && <FilaAnchoCompleto columnas={columnasVisibles} celdaClassName="px-2 py-4 text-gray-400 italic">Cargando…</FilaAnchoCompleto>}
          {movimientos !== null && filas.length === 0 && <FilaAnchoCompleto columnas={columnasVisibles} celdaClassName="px-2 py-4 text-gray-400 italic">Sin movimientos con estos filtros.</FilaAnchoCompleto>}
          {filas.map((m) => {
            const signo = signoMovimiento(m.tipo);
            const tipo = TIPOS_MOVIMIENTO[m.tipo]?.etiqueta || m.tipo;
            const saldoLote = `${m.saldoLote?.disponible} / ${m.saldoLote?.transito}${m.saldoLote?.enCentro ? ` / ${m.saldoLote.enCentro}` : ''}`;
            const saldo = `${m.saldoProducto?.disponible} / ${m.saldoProducto?.transito}${m.saldoProducto?.enCentro ? ` / ${m.saldoProducto.enCentro}` : ''}`;
            const documento = referenciaMovimiento(m);
            const observacion = `${m.idEntrega ? `Adm. ${m.idEntrega} · ` : ''}${m.observacion || ''}`;
            const celdas = {
              fecha: <td className={TD}>{fechaHora(m.fecha)}</td>,
              tipo: <td className={`${TD} font-semibold`} title={tipo}>{tipo}</td>,
              lote: <td className={`${TD} font-num`} title={m.lote || ''}>{m.lote || '—'}</td>,
              vencimiento: <td className={`${TD} font-num`}>{m.vencimiento || '—'}</td>,
              propietario: <td className={TD} title={m.propietarioNombre || 'Propio'}>{m.propietarioNombre ? <span className="text-violet-700 dark:text-violet-300 font-semibold">{m.propietarioNombre}</span> : 'Propio'}</td>,
              centro: <td className={TD} title={m.centroNombre || ''}>{m.centroNombre || '—'}</td>,
              cantidad: <td className={`${TD} text-right font-num font-bold ${COLOR[signo]}`}>{signo > 0 ? '+' : signo < 0 ? '−' : ''}{m.cantidad}</td>,
              saldoLote: <td className={`${TD} text-right font-num`} title={`Lote: disponible / tránsito / en centro = ${saldoLote}`}>{saldoLote}</td>,
              saldo: <td className={`${TD} text-right font-num`} title={`Producto: disponible / tránsito / en centro = ${saldo}`}>{saldo}</td>,
              documento: <td className={TD} title={documento}>{documento}</td>,
              usuario: <td className={TD} title={m.usuario?.nombre || ''}>{m.usuario?.nombre || ''}</td>,
              observacion: <td className={TD} title={observacion}>{m.idEntrega && <span className="font-num font-bold">Adm. {m.idEntrega} · </span>}{m.observacion || ''}</td>,
            };
            return <FilaBodega key={m.id} columnas={columnasVisibles} celdas={celdas} />;
          })}
        </TablaBodega>
      </div>
      {ultimo && <button type="button" onClick={cargarMas} className="self-center h-8 px-3 rounded border border-gray-300 dark:border-gray-600 font-semibold">Cargar más</button>}
    </div>
  );
};

export default KardexProducto;
