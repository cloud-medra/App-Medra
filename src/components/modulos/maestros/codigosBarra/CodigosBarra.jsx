import { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Pencil, Plus, RefreshCw, ScanBarcode, Search, Trash2 } from 'lucide-react';
import { useToast } from '../../../../context/ToastContext';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { useColumnasPermitidas } from '../../../../hooks/useColumnasPermitidas';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { mensajeError } from '../../bodega/shared/bodegaApi';
import { esTeclaFinEscaneo } from '../../bodega/shared/escaneo/identificarLectura';
import { fechaHora } from '../../bodega/shared/transito/transitos';
import { BotonRestablecerAnchos } from '../../../ui/BotonRestablecerAnchos';
import { TablaBodega, FilaBodega, FilaAnchoCompleto } from '../../bodega/shared/TablaBodega';
import { TD_BODEGA as TD, useAnchosTablaBodega } from '../../bodega/shared/anchosTablaBodega';
import { leerVinculos } from './codigosBarraApi';
import { buscarPorLectura, filasDeVinculos, filtrarFilas } from './filasCodigos';
import AccionCodigoModal from './AccionCodigoModal';

const PATH_VISTA = '/maestros/codigosBarra';

const COLUMNAS = [
  { key: 'referencia', label: 'Referencia', ancho: 140, min: 70 },
  { key: 'nombre', label: 'Nombre', ancho: 320, min: 120 },
  { key: 'codigo', label: 'Código de barras', ancho: 210, min: 100 },
  { key: 'usuario', label: 'Usuario', ancho: 160, min: 80 },
  { key: 'fecha', label: 'Fecha de vinculación', ancho: 140, min: 90 },
  { key: 'acciones', label: '', fija: true, ancho: 96, min: 96 },
];

// Vínculos de códigos de barra de Bodega: consulta (también con lector) y
// corrección. Lee los vínculos una vez al abrir; los productos vienen de la
// copia en memoria del maestro.
const CodigosBarra = () => {
  const { showToast } = useToast();
  const { hasPermission } = useGranularPermission();
  const { columnasVisibles } = useColumnasPermitidas(PATH_VISTA, 'codigos', COLUMNAS);
  const { anchos, handleResize, restablecerAnchos, personalizados } = useAnchosTablaBodega(columnasVisibles, 'maestros.codigosBarra');
  const { datos: productos } = useCatalogo('bodegaProductos');
  const [vinculos, setVinculos] = useState(null);
  const [version, setVersion] = useState(0);
  const [texto, setTexto] = useState('');
  const [aviso, setAviso] = useState(null);
  const [modal, setModal] = useState(null);

  useEffect(() => {
    let vigente = true;
    leerVinculos()
      .then((lista) => { if (vigente) setVinculos(lista); })
      .catch((e) => { if (vigente) { setVinculos([]); showToast(mensajeError(e, 'No se pudieron leer los códigos.'), 'error'); } });
    return () => { vigente = false; };
  }, [version, showToast]);

  const recargar = () => { setVinculos(null); setVersion((v) => v + 1); };

  const filas = useMemo(() => filasDeVinculos(vinculos || [], productos), [vinculos, productos]);
  const visibles = useMemo(() => filtrarFilas(filas, texto), [filas, texto]);
  const puedeEditar = hasPermission(PATH_VISTA, 'codigos', 'btn_editar');
  const puedeMover = hasPermission(PATH_VISTA, 'codigos', 'btn_mover');
  const puedeEliminar = hasPermission(PATH_VISTA, 'codigos', 'btn_eliminar');
  const puedeAgregar = hasPermission(PATH_VISTA, 'codigos', 'btn_agregar');

  // El lector cierra con Enter o Tab: muestra directamente la referencia. Un
  // texto que ya filtra algo (búsqueda escrita) se deja como está.
  const alTeclear = (e) => {
    if (!esTeclaFinEscaneo(e) || !texto.trim()) return;
    e.preventDefault();
    const r = buscarPorLectura(filas, texto);
    if (r?.tipo === 'encontrado') { setTexto(r.fila.clave); setAviso(null); return; }
    if (visibles.length) return;
    if (r?.tipo === 'soloLote') setAviso({ mensaje: 'Ese código solo trae lote o vencimiento: no identifica una referencia.' });
    if (r?.tipo === 'sinVincular') setAviso({ mensaje: `El código ${r.lectura.codigo} no está vinculado.`, codigo: r.lectura.codigo });
    setTexto('');
  };

  const claseAccion = 'p-1 rounded text-gray-500 hover:text-[#2383C2] hover:bg-gray-100 dark:hover:bg-gray-700';

  return (
    <div className="font-app text-tinta-principal w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden text-secundario">
      <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="text-titulo-seccion flex items-center gap-1.5"><ScanBarcode size={14} className="text-[#2383C2]" /> Códigos de barras</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative">
            <Search className="absolute left-1.5 top-1.5 text-gray-400" size={13} />
            <input
              value={texto} autoFocus autoComplete="off" spellCheck={false}
              onChange={(e) => { setTexto(e.target.value); setAviso(null); }} onKeyDown={alTeclear}
              placeholder="Referencia, nombre o código (o escanea)" aria-label="Buscar código de barras"
              className="h-7 pl-6 pr-2 w-64 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 outline-none focus:border-[#2383C2]"
            />
          </div>
          <button type="button" onClick={recargar} className="h-7 px-2 rounded border border-gray-300 dark:border-gray-600 text-etiqueta flex items-center gap-1 text-tinta-secundaria"><RefreshCw size={12} /> Actualizar</button>
          {puedeAgregar && <button type="button" onClick={() => setModal({ accion: 'AGREGAR' })} className="h-7 px-2 rounded bg-[#2383C2] text-white text-etiqueta flex items-center gap-1"><Plus size={12} /> Agregar código</button>}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3 flex flex-col gap-1.5">
        {aviso && (
          <p className="flex flex-wrap items-center gap-2 px-2 py-1 rounded bg-amber-50 dark:bg-amber-950/30">
            <span>{aviso.mensaje}</span>
            {aviso.codigo && puedeAgregar && <button type="button" onClick={() => setModal({ accion: 'AGREGAR', codigoInicial: aviso.codigo })} className="text-etiqueta text-[#2383C2]">Agregar este código</button>}
          </p>
        )}
        {vinculos === null ? (
          <p className="text-tinta-atenuada">Cargando…</p>
        ) : (
          <>
            <div className="flex justify-between items-center">
              <span className="text-tinta-secundaria">{visibles.length} de {filas.length} códigos</span>
              <BotonRestablecerAnchos onClick={restablecerAnchos} personalizados={personalizados} />
            </div>
            <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto">
              <TablaBodega columnas={columnasVisibles} anchos={anchos} onResize={handleResize}>
                {visibles.length === 0 && <FilaAnchoCompleto columnas={columnasVisibles}>No hay códigos para mostrar.</FilaAnchoCompleto>}
                {visibles.map((f) => (
                  <FilaBodega key={f.id} columnas={columnasVisibles} celdas={{
                    referencia: <td className={`${TD} text-numero-tabla`} title={f.referencia}>{f.referencia || '—'}</td>,
                    nombre: <td className={`${TD} text-etiqueta`} title={f.nombre}>{f.nombre}</td>,
                    codigo: <td className={`${TD} text-numero-tabla`} title={f.codigo}>{f.clave}</td>,
                    usuario: <td className={`${TD} text-secundario`}>{f.creadoPor?.nombre || '—'}</td>,
                    fecha: <td className={`${TD} text-numero-tabla`}>{fechaHora(f.creadoEn) || '—'}</td>,
                    acciones: (
                      <td className={TD}>
                        <span className="inline-flex gap-0.5">
                          {puedeEditar && <button type="button" onClick={() => setModal({ accion: 'EDITAR', fila: f })} title="Editar código" aria-label={`Editar código ${f.clave}`} className={claseAccion}><Pencil size={13} /></button>}
                          {puedeMover && <button type="button" onClick={() => setModal({ accion: 'MOVER', fila: f })} title="Mover a otra referencia" aria-label={`Mover código ${f.clave}`} className={claseAccion}><ArrowRightLeft size={13} /></button>}
                          {puedeEliminar && <button type="button" onClick={() => setModal({ accion: 'ELIMINAR', fila: f })} title="Eliminar vínculo" aria-label={`Eliminar vínculo ${f.clave}`} className={claseAccion}><Trash2 size={13} /></button>}
                        </span>
                      </td>
                    ),
                  }} />
                ))}
              </TablaBodega>
            </div>
          </>
        )}
      </div>
      {modal && <AccionCodigoModal {...modal} onCerrar={() => setModal(null)} onHecho={() => { setModal(null); setAviso(null); recargar(); }} />}
    </div>
  );
};

export default CodigosBarra;
