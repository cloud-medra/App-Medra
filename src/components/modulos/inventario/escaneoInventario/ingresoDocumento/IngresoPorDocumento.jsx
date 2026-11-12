import { useEffect, useState } from 'react';
import { Search, Trash2, Loader2, Barcode, Eraser, Plus, ArrowRight, ArrowLeft, Pencil, CheckCircle2, AlertTriangle, FileText } from 'lucide-react';
import { useToast } from '../../../../../context/ToastContext';
import { useModal } from '../../../../../context/ModalContext';
import { useUser } from '../../../../../context/UserContext';
import CampoEscaneo from '../../shared/escaneo/CampoEscaneo';
import BuscadorProductoMaestro from '../../shared/escaneo/BuscadorProductoMaestro';
import { useProductoEscaneado, nombreProducto } from '../../shared/escaneo/useProductoEscaneado';
import CabeceraIngreso from '../../shared/ingreso/CabeceraIngreso';
import { useCatalogosIngreso } from '../../shared/ingreso/useCatalogosIngreso';
import {
  cabeceraVaciaIngreso, datosProductoIngreso, validarCabeceraIngreso, validarItemIngreso, validarIngresoStock,
  mensajeIngresoDuplicado, ORIGEN_INGRESO_ESCANEO
} from '../../shared/ingreso/ingresoStock';
import { buscarIngresoDuplicado, guardarIngresoStock } from '../../shared/ingreso/ingresoStockService';
import { nuevaLinea, indiceLineaIgual, sumarALinea, cambiarCantidadLinea, quitarLinea, totalUnidades } from './lineasDocumento';

const CLASE_INPUT = 'w-full h-8 px-2 border border-gray-300 dark:border-gray-600 rounded text-[12px] outline-none focus:border-[#2383C2] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 disabled:opacity-50';
const CLASE_LABEL = 'block text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-0.5';
const CLASE_BOTON_GRIS = 'h-7 px-2.5 rounded font-bold text-[11px] flex items-center gap-1 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50';
const CLASE_BOTON_AZUL = 'h-8 px-4 rounded font-bold text-[12px] flex items-center gap-1.5 text-white bg-[#2383C2] hover:bg-[#369BCE] transition disabled:opacity-40 disabled:cursor-not-allowed';
const TH = 'px-2 py-1.5 border-b border-slate-200 dark:border-gray-700';
const TD = 'px-2 py-1';

const fechaCorta = (iso) => {
  const [y, m, d] = String(iso || '').split('-');
  return y && m && d ? `${d}-${m}-${y}` : 'S/V';
};

const Aviso = ({ mensaje }) => (
  <div className="flex items-start gap-1.5 px-3 py-2 rounded border border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 text-[11.5px]">
    <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" /> {mensaje}
  </div>
);

const ResumenCabecera = ({ cabecera, onEditar, deshabilitado }) => (
  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-gray-700 dark:text-gray-200">
      <span className="flex items-center gap-1"><FileText size={13} className="text-[#2383C2]" /> Guía/Factura <b>{cabecera.numeroGuiaFactura}</b></span>
      <span>OC <b>{cabecera.numeroOrden || '—'}</b></span>
      <span>Empresa <b>{cabecera.empresa || '—'}</b></span>
      <span>Caja <b>{cabecera.nombreCaja}</b>{cabecera.ubicacion ? ` (${cabecera.ubicacion})` : ''}</span>
      {cabecera.observaciones && <span className="text-gray-500 italic">{cabecera.observaciones}</span>}
    </div>
    {onEditar && (
      <button type="button" onClick={onEditar} disabled={deshabilitado} className={CLASE_BOTON_GRIS}><Pencil size={12} /> Editar datos</button>
    )}
  </div>
);

const TablaLineas = ({ lineas, editable, onCantidad, onQuitar }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-[11px] border-collapse">
      <thead className="bg-slate-100 dark:bg-gray-900/80 text-slate-600 dark:text-gray-400 uppercase text-[10px]">
        <tr>
          <th className={TH}>Producto</th>
          <th className={TH}>Lote</th>
          <th className={TH}>Vencimiento</th>
          <th className={`${TH} text-right`}>Precio U.</th>
          <th className={`${TH} text-right`}>Cantidad</th>
          {editable && <th className={`${TH} w-8`} />}
        </tr>
      </thead>
      <tbody>
        {lineas.length === 0 ? (
          <tr><td colSpan={editable ? 6 : 5} className="px-3 py-4 text-center text-gray-400 italic">Aún no hay productos en el documento. Escanea el primero.</td></tr>
        ) : lineas.map((l) => (
          <tr key={l.id} className="border-b border-slate-100 dark:border-gray-700/60 text-gray-700 dark:text-gray-200">
            <td className={TD} title={l.codigos.map((c) => c.codigo).join(' · ')}>
              {l.item.referencia || 'S/Ref'} <span className="text-emerald-600 dark:text-emerald-400">[{l.item.codigo || 'S/Cod'}]</span> <span className="text-[#2383C2]">{l.item.descripcion}</span>
            </td>
            <td className={TD}>{l.item.lote || 'S/L'}</td>
            <td className={TD}>{fechaCorta(l.item.vencimiento)}</td>
            <td className={`${TD} text-right`}>{l.item.precio}</td>
            <td className={`${TD} text-right font-semibold`}>
              {editable ? (
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={l.item.cantidad}
                  onChange={(e) => onCantidad(l.id, parseInt(e.target.value) || 0)}
                  className="w-20 h-6 px-1.5 border border-gray-300 dark:border-gray-600 rounded text-right bg-white dark:bg-gray-900 outline-none focus:border-[#2383C2]"
                />
              ) : l.item.cantidad}
            </td>
            {editable && (
              <td className={`${TD} text-center`}>
                <button type="button" onClick={() => onQuitar(l.id)} title="Quitar del documento" className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 rounded">
                  <Trash2 size={12} />
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// Escaneo · Con guía o factura. Igual que Ingresos (mismos datos, mismas
// validaciones, mismo documento en inventario_general), pero los productos
// se cargan escaneando: cabecera -> escaneo de productos -> resumen y
// confirmación.
const IngresoPorDocumento = () => {
  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { userData } = useUser();
  const { catalogoCodigos, listaEmpresas, listaCajas } = useCatalogosIngreso();

  const [paso, setPaso] = useState('cabecera'); // cabecera | escaneo | resumen
  const [cabecera, setCabecera] = useState(cabeceraVaciaIngreso);
  const [errorCabecera, setErrorCabecera] = useState('');
  const [verificando, setVerificando] = useState(false);

  const [lineas, setLineas] = useState([]);
  const [cantidad, setCantidad] = useState('1');
  const [lote, setLote] = useState('');
  const [vencimiento, setVencimiento] = useState('');

  const [errorGuardar, setErrorGuardar] = useState('');
  const [guardando, setGuardando] = useState(false);

  const {
    campoRef, senal, avisar, enfocarCampo,
    producto, codigos, buscador, setBuscador,
    handleLectura, handleSeleccionarProducto, handleQuitarCodigo, limpiarProducto: limpiarEscaneo, handleBlurCampo
  } = useProductoEscaneado({
    catalogo: catalogoCodigos,
    mensajeInicial: 'Escanea el primer producto del documento.',
    onGS1: (gs1) => {
      if (gs1.lote) setLote(gs1.lote);
      if (gs1.vencimiento) setVencimiento(gs1.vencimiento);
    }
  });

  useEffect(() => { if (paso === 'escaneo') enfocarCampo(); }, [paso]); // eslint-disable-line react-hooks/exhaustive-deps

  const limpiarProducto = ({ mensaje } = {}) => {
    setCantidad('1');
    setLote('');
    setVencimiento('');
    limpiarEscaneo({ mensaje });
  };

  // Paso 1: los mismos campos obligatorios que Ingresos y que el documento
  // (empresa + guía/factura + OC) no se haya ingresado antes.
  const handleContinuar = async () => {
    const error = validarCabeceraIngreso(cabecera);
    if (error) return setErrorCabecera(error);
    setVerificando(true);
    try {
      const previo = await buscarIngresoDuplicado(cabecera);
      if (previo) return setErrorCabecera(mensajeIngresoDuplicado(cabecera, previo));
      setErrorCabecera('');
      setErrorGuardar('');
      setPaso('escaneo');
    } catch (err) {
      console.error('Error al verificar el documento:', err);
      setErrorCabecera('No se pudo verificar si el documento ya fue ingresado: ' + (err.message || ''));
    } finally {
      setVerificando(false);
    }
  };

  // Paso 2: agrega el producto en curso a la lista del documento.
  const handleAgregar = () => {
    if (!producto) return avisar('error', 'Escanea un código o elige el producto antes de agregarlo.');
    const item = { ...datosProductoIngreso(producto), cantidad: parseInt(cantidad) || 0, lote: lote.trim(), vencimiento };
    const error = validarItemIngreso(item);
    if (error) return avisar('error', error);

    const etiqueta = `${item.cantidad} × ${nombreProducto(producto)}`;
    const agregarNueva = () => {
      setLineas((prev) => [...prev, nuevaLinea(producto, item, codigos)]);
      limpiarProducto();
      avisar('ok', `Agregado: ${etiqueta}. Escanea el siguiente producto.`);
    };
    const indice = indiceLineaIgual(lineas, item);
    if (indice < 0) return agregarNueva();

    confirmAction(
      'Producto ya en la lista',
      `${nombreProducto(producto)} con lote ${item.lote || 'S/L'} ya está en el documento (${lineas[indice].item.cantidad} unidad(es)). ¿Sumar ${item.cantidad} a esa línea o agregarlo como línea nueva?`,
      () => {
        setLineas((prev) => sumarALinea(prev, indice, item, codigos));
        limpiarProducto();
        avisar('ok', `Sumado: ${etiqueta}. Escanea el siguiente producto.`);
      },
      { confirmText: 'Sumar cantidad', cancelText: 'Agregar como línea nueva', type: 'warning', onCancel: agregarNueva }
    );
  };

  const irAResumen = () => {
    const error = validarIngresoStock(cabecera, lineas.map((l) => l.item));
    if (error) return avisar('error', error);
    setErrorGuardar('');
    setPaso('resumen');
  };

  // Paso 3: mismo guardado que Ingresos + vínculos de los códigos escaneados.
  const handleConfirmar = async () => {
    setGuardando(true);
    setErrorGuardar('');
    try {
      await guardarIngresoStock({
        cabecera,
        items: lineas.map((l) => l.item),
        usuario: userData,
        origen: ORIGEN_INGRESO_ESCANEO,
        vinculos: lineas.map((l) => ({ producto: l.producto, codigos: l.codigos }))
      });
      showToast('Ingreso de stock registrado con éxito', 'success');
      setCabecera(cabeceraVaciaIngreso());
      setLineas([]);
      limpiarProducto({ mensaje: 'Escanea el primer producto del documento.' });
      setPaso('cabecera');
    } catch (err) {
      console.error('Error al guardar el ingreso por escaneo:', err);
      setErrorGuardar(err.message || 'Error al guardar.');
      showToast(err.message || 'Error al guardar.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const unidades = totalUnidades(lineas);

  if (paso === 'cabecera') {
    return (
      <div className="flex-grow min-h-0 overflow-auto p-3 flex flex-col gap-3">
        <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 flex flex-col gap-3">
          <span className="text-[12px] font-bold text-gray-700 dark:text-gray-100">1. Datos del documento</span>
          <CabeceraIngreso cabecera={cabecera} setCabecera={setCabecera} listaEmpresas={listaEmpresas} listaCajas={listaCajas} />
          {errorCabecera && <Aviso mensaje={errorCabecera} />}
          <div className="flex items-center justify-end gap-2">
            {lineas.length > 0 && <span className="text-[11px] text-gray-500">{lineas.length} línea(s) ya escaneadas se mantienen.</span>}
            <button type="button" onClick={handleContinuar} disabled={verificando} className={CLASE_BOTON_AZUL}>
              {verificando ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />} Continuar al escaneo
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (paso === 'resumen') {
    return (
      <div className="flex-grow min-h-0 overflow-auto p-3 flex flex-col gap-3">
        <span className="text-[12px] font-bold text-gray-700 dark:text-gray-100">3. Revisar y confirmar</span>
        <ResumenCabecera cabecera={cabecera} />
        <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-[11px] font-bold text-gray-700 dark:text-gray-200 uppercase">
            {lineas.length} línea(s) · {unidades} unidad(es)
          </div>
          <TablaLineas lineas={lineas} />
        </section>
        {errorGuardar && <Aviso mensaje={errorGuardar} />}
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={() => setPaso('escaneo')} disabled={guardando} className={CLASE_BOTON_GRIS}><ArrowLeft size={12} /> Volver al escaneo</button>
          <button type="button" onClick={handleConfirmar} disabled={guardando} className={CLASE_BOTON_AZUL}>
            {guardando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Confirmar ingreso
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-grow min-h-0 overflow-auto p-3 flex flex-col gap-3">
      <ResumenCabecera cabecera={cabecera} onEditar={() => setPaso('cabecera')} />

      <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 flex flex-col gap-3">
        <span className="text-[12px] font-bold text-gray-700 dark:text-gray-100">2. Escanear productos</span>
        <div onBlur={handleBlurCampo}>
          <CampoEscaneo ref={campoRef} onLectura={handleLectura} senal={senal.tipo} mensaje={senal.mensaje} />
        </div>
      </section>

      {buscador && (
        <BuscadorProductoMaestro
          catalogo={catalogoCodigos}
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
            <button type="button" onClick={() => setBuscador({ aviso: '' })} className={CLASE_BOTON_GRIS}>
              <Search size={12} /> {producto ? 'Cambiar producto' : 'Buscar producto'}
            </button>
            <button
              type="button"
              onClick={() => limpiarProducto({ mensaje: 'Listo para el siguiente producto.' })}
              disabled={!producto && codigos.length === 0}
              className={CLASE_BOTON_GRIS}
            >
              <Eraser size={12} /> Descartar
            </button>
          </div>
        </div>

        <div>
          <span className={CLASE_LABEL}>Códigos de barra escaneados ({codigos.length})</span>
          {codigos.length === 0 ? (
            <div className="text-[11px] text-gray-400 italic">Ninguno todavía. Los códigos nuevos quedan vinculados al producto al confirmar el ingreso.</div>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {codigos.map((c) => (
                <li key={c.clave} className={`inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-full border text-[11px] font-num ${
                  c.reasignar ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300'
                    : c.vinculoProductoId ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'}`}
                  title={c.reasignar ? 'Se reasignará a este producto al confirmar' : c.vinculoProductoId ? 'Ya vinculado a este producto' : 'Nuevo: se vinculará al confirmar'}
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
            <input type="number" min="1" step="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={CLASE_INPUT} />
          </div>
          <div className="w-[180px]">
            <label className={CLASE_LABEL}>Lote</label>
            <input value={lote} onChange={(e) => setLote(e.target.value)} placeholder="Lote" className={CLASE_INPUT} />
          </div>
          <div className="w-[160px]">
            <label className={CLASE_LABEL}>Vencimiento</label>
            <input type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} className={CLASE_INPUT} />
          </div>
          <div className="w-[110px]">
            <label className={CLASE_LABEL}>Precio U.</label>
            <input type="number" value={producto ? datosProductoIngreso(producto).precio : ''} readOnly disabled placeholder="0" className={CLASE_INPUT} />
          </div>
          <button type="button" onClick={handleAgregar} disabled={!producto} className={CLASE_BOTON_AZUL}>
            <Plus size={14} /> Agregar a la lista
          </button>
        </div>
      </section>

      <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200 uppercase">Documento: {lineas.length} línea(s) · {unidades} unidad(es)</span>
          <button type="button" onClick={irAResumen} disabled={lineas.length === 0} className={CLASE_BOTON_AZUL}>
            Revisar y confirmar <ArrowRight size={14} />
          </button>
        </div>
        <TablaLineas
          lineas={lineas}
          editable
          onCantidad={(id, valor) => setLineas((prev) => cambiarCantidadLinea(prev, id, valor))}
          onQuitar={(id) => { setLineas((prev) => quitarLinea(prev, id)); enfocarCampo(); }}
        />
      </section>
    </div>
  );
};

export default IngresoPorDocumento;
