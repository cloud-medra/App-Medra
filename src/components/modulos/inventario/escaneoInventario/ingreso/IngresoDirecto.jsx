import { useEffect, useMemo, useState } from 'react';
import { Save, Search, Trash2, Loader2, PackageCheck, Barcode, Eraser } from 'lucide-react';
import { useInventarioGeneral } from '../../../../../hooks/useInventarioGeneral';
import { cargarCatalogo } from '../../../../../stores/catalogosStore';
import { useToast } from '../../../../../context/ToastContext';
import { useUser } from '../../../../../context/UserContext';
import CampoEscaneo from '../../shared/escaneo/CampoEscaneo';
import SelectorCaja, { NUEVA_CAJA } from '../components/SelectorCaja';
import BuscadorProductoMaestro from '../../shared/escaneo/BuscadorProductoMaestro';
import { useProductoEscaneado, nombreProducto } from '../../shared/escaneo/useProductoEscaneado';
import { construirItemDesdeProducto, validarItem, etiquetaCaja } from '../../shared/escaneo/itemsCaja';
import { guardarIngresoEscaneo } from '../../shared/escaneo/escaneoInventarioService';

const CLASE_INPUT = 'w-full h-8 px-2 border border-gray-300 dark:border-gray-600 rounded text-[12px] outline-none focus:border-[#2383C2] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 disabled:opacity-50';
const CLASE_LABEL = 'block text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-0.5';

const fechaCorta = (iso) => {
  const [y, m, d] = String(iso || '').split('-');
  return y && m && d ? `${d}-${m}-${y}` : 'S/V';
};

// Escaneo · Ingreso directo (sin guía ni factura). Caja -> escaneo (producto
// por código vinculado, o búsqueda en el maestro si el código es nuevo) ->
// cantidad/lote/vencimiento (GS1 los completa) -> guardar en la caja.
const IngresoDirecto = () => {
  const { cajas } = useInventarioGeneral();
  const { showToast } = useToast();
  const { userData } = useUser();

  const [catalogo, setCatalogo] = useState([]);
  const [cajaValor, setCajaValor] = useState('');
  const [nuevaCaja, setNuevaCaja] = useState({ nombreCaja: '', ubicacion: '' });

  const [cantidad, setCantidad] = useState('1');
  const [lote, setLote] = useState('');
  const [vencimiento, setVencimiento] = useState('');

  const [guardando, setGuardando] = useState(false);
  const [sesion, setSesion] = useState([]);

  useEffect(() => {
    cargarCatalogo('codigos')
      .then(setCatalogo)
      .catch((err) => {
        console.error('Error al cargar el maestro de códigos:', err);
        showToast('No se pudo cargar el maestro de códigos', 'error');
      });
  }, [showToast]);

  const cajaLista = cajaValor === NUEVA_CAJA ? Boolean(nuevaCaja.nombreCaja.trim()) : Boolean(cajaValor);

  const {
    campoRef, senal, avisar, enfocarCampo,
    producto, codigos, buscador, setBuscador,
    handleLectura, handleSeleccionarProducto, handleQuitarCodigo, limpiarProducto: limpiarEscaneo, handleBlurCampo
  } = useProductoEscaneado({
    catalogo,
    mensajeInicial: 'Elige la caja y escanea el primer código.',
    validarAntes: () => (cajaLista ? '' : cajaValor === NUEVA_CAJA ? 'Escribe el nombre de la nueva caja antes de escanear.' : 'Elige la caja antes de escanear.'),
    onGS1: (gs1) => {
      if (gs1.lote) setLote(gs1.lote);
      if (gs1.vencimiento) setVencimiento(gs1.vencimiento);
    }
  });

  const limpiarProducto = ({ mensaje } = {}) => {
    setCantidad('1');
    setLote('');
    setVencimiento('');
    limpiarEscaneo({ mensaje });
  };

  const handleCambiarCaja = (valor) => {
    setCajaValor(valor);
    enfocarCampo();
  };

  const handleGuardar = async () => {
    if (!cajaLista) return avisar('error', 'Elige la caja (o escribe el nombre de la nueva) antes de guardar.');
    if (!producto) return avisar('error', 'Escanea un código o elige el producto antes de guardar.');
    const item = construirItemDesdeProducto(producto, { cantidad: Number(cantidad), lote, vencimiento });
    const error = validarItem(item);
    if (error) return avisar('error', error);

    setGuardando(true);
    try {
      const esNueva = cajaValor === NUEVA_CAJA;
      const res = await guardarIngresoEscaneo({
        cajaId: esNueva ? null : cajaValor,
        nuevaCaja: esNueva ? nuevaCaja : null,
        producto,
        item,
        codigos,
        usuario: userData
      });
      const caja = esNueva ? { nombreCaja: nuevaCaja.nombreCaja.trim(), ubicacion: nuevaCaja.ubicacion.trim() } : cajas.find((c) => c.id === cajaValor);
      setSesion((prev) => [{
        id: `${Date.now()}-${prev.length}`,
        caja: etiquetaCaja(caja),
        producto: nombreProducto(producto),
        codigo: producto.codigo || '',
        lote: item.lote,
        vencimiento: item.vencimiento,
        cantidad: item.cantidad,
        sumado: res.sumado,
        codigosBarra: codigos.map((c) => c.codigo)
      }, ...prev]);
      if (esNueva) {
        // Los siguientes productos van a la caja recién creada.
        setCajaValor(res.cajaId);
        setNuevaCaja({ nombreCaja: '', ubicacion: '' });
      }
      limpiarProducto();
      avisar('ok', `Guardado: ${item.cantidad} × ${nombreProducto(producto)}${res.sumado ? ' (sumado al mismo lote)' : ''}. Escanea el siguiente producto.`);
    } catch (err) {
      console.error('Error al guardar el ingreso por escaneo:', err);
      avisar('error', err.message || 'Error al guardar.');
      showToast('Error al guardar: ' + (err.message || ''), 'error');
      enfocarCampo();
    } finally {
      setGuardando(false);
    }
  };

  const totalSesion = useMemo(() => sesion.reduce((acc, s) => acc + s.cantidad, 0), [sesion]);

  return (
    <div className="flex-grow min-h-0 overflow-auto p-3 flex flex-col gap-3">
      <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 flex flex-col gap-3">
        <SelectorCaja
          cajas={cajas}
          valor={cajaValor}
          onCambiar={handleCambiarCaja}
          nuevaCaja={nuevaCaja}
          onCambiarNuevaCaja={setNuevaCaja}
          deshabilitado={guardando}
        />
        <div onBlur={handleBlurCampo}>
          <CampoEscaneo ref={campoRef} onLectura={handleLectura} senal={senal.tipo} mensaje={senal.mensaje} deshabilitado={guardando} />
        </div>
      </section>

      {buscador && (
        <BuscadorProductoMaestro
          catalogo={catalogo}
          aviso={buscador.aviso}
          onSeleccionar={handleSeleccionarProducto}
          onCerrar={() => { setBuscador(null); enfocarCampo(); }}
        />
      )}

      <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <span className={CLASE_LABEL}>Producto</span>
            {producto ? (
              <div className="text-[12px] text-gray-800 dark:text-gray-100 flex flex-wrap items-center gap-1.5">
                <b>{producto.referencia || 'S/Ref'}</b>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">[{producto.codigo || 'S/Cod'}]</span>
                <span className="text-[#2383C2]">{producto.descriptorAuto || 'S/Descriptor'}</span>
                <span className="text-gray-400 italic">({producto.empresa || 'S/Empresa'})</span>
              </div>
            ) : (
              <div className="text-[12px] text-gray-400 italic">Sin producto: escanea un código.</div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setBuscador({ aviso: '' })}
              disabled={guardando}
              className="h-7 px-2.5 rounded font-bold text-[11px] flex items-center gap-1 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              <Search size={12} /> {producto ? 'Cambiar producto' : 'Buscar producto'}
            </button>
            <button
              type="button"
              onClick={() => limpiarProducto({ mensaje: 'Listo para el siguiente producto.' })}
              disabled={guardando || (!producto && codigos.length === 0)}
              className="h-7 px-2.5 rounded font-bold text-[11px] flex items-center gap-1 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              <Eraser size={12} /> Descartar
            </button>
          </div>
        </div>

        <div>
          <span className={CLASE_LABEL}>Códigos de barra escaneados ({codigos.length})</span>
          {codigos.length === 0 ? (
            <div className="text-[11px] text-gray-400 italic">Ninguno todavía. Puedes escanear varios códigos del mismo producto.</div>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {codigos.map((c) => (
                <li key={c.clave} className={`inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-full border text-[11px] font-num ${
                  c.reasignar ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300'
                    : c.vinculoProductoId ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'}`}
                  title={c.reasignar ? 'Se reasignará a este producto al guardar' : c.vinculoProductoId ? 'Ya vinculado a este producto' : 'Nuevo: se vinculará al guardar'}
                >
                  <Barcode size={11} />
                  {c.clave}
                  <span className="text-[9px] uppercase">{c.reasignar ? 'reasignar' : c.vinculoProductoId ? 'vinculado' : 'nuevo'}</span>
                  <button type="button" onClick={() => handleQuitarCodigo(c.clave)} title="Quitar de la lista" className="p-0.5 rounded-full hover:bg-black/10">
                    <Trash2 size={11} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-2.5">
          <div className="w-[110px]">
            <label className={CLASE_LABEL}>Cantidad</label>
            <input type="number" min="1" step="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} disabled={guardando} className={CLASE_INPUT} />
          </div>
          <div className="w-[180px]">
            <label className={CLASE_LABEL}>Lote</label>
            <input value={lote} onChange={(e) => setLote(e.target.value)} disabled={guardando} placeholder="Lote" className={CLASE_INPUT} />
          </div>
          <div className="w-[160px]">
            <label className={CLASE_LABEL}>Vencimiento</label>
            <input type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} disabled={guardando} className={CLASE_INPUT} />
          </div>
          <button
            type="button"
            onClick={handleGuardar}
            disabled={guardando || !producto}
            className="h-8 px-4 rounded font-bold text-[12px] flex items-center gap-1.5 text-white bg-[#2383C2] hover:bg-[#369BCE] transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {guardando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
          </button>
        </div>
      </section>

      <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center gap-1.5 text-[11px] font-bold text-gray-700 dark:text-gray-200 uppercase">
          <PackageCheck size={13} className="text-emerald-600" />
          Ingresado en esta sesión: {sesion.length} registro(s) · {totalSesion} unidad(es)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px] border-collapse">
            <thead className="bg-slate-100 dark:bg-gray-900/80 text-slate-600 dark:text-gray-400 uppercase text-[10px]">
              <tr>
                <th className="px-2 py-1.5 border-b border-slate-200 dark:border-gray-700">Producto</th>
                <th className="px-2 py-1.5 border-b border-slate-200 dark:border-gray-700">Lote</th>
                <th className="px-2 py-1.5 border-b border-slate-200 dark:border-gray-700">Vencimiento</th>
                <th className="px-2 py-1.5 border-b border-slate-200 dark:border-gray-700 text-right">Cantidad</th>
                <th className="px-2 py-1.5 border-b border-slate-200 dark:border-gray-700">Caja</th>
              </tr>
            </thead>
            <tbody>
              {sesion.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400 italic">Aún no se ha guardado nada en esta sesión.</td></tr>
              ) : sesion.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 dark:border-gray-700/60 text-gray-700 dark:text-gray-200">
                  <td className="px-2 py-1" title={s.codigosBarra.join(' · ')}>{s.producto} {s.codigo && <span className="text-emerald-600 dark:text-emerald-400">[{s.codigo}]</span>}</td>
                  <td className="px-2 py-1">{s.lote || 'S/L'}</td>
                  <td className="px-2 py-1">{fechaCorta(s.vencimiento)}</td>
                  <td className="px-2 py-1 text-right font-semibold">{s.cantidad}{s.sumado && <span className="ml-1 text-[9px] text-gray-400">(sumado)</span>}</td>
                  <td className="px-2 py-1">{s.caja}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default IngresoDirecto;
