import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../../../../../firebaseConfig';
import { useToast } from '../../../../../../context/ToastContext';
import { useUser } from '../../../../../../context/UserContext';
import { useGranularPermission } from '../../../../../../hooks/useGranularPermission';
import { User, Package, UploadCloud, Loader2, AlertCircle, CheckCircle2, Save, Link2, Pencil, Check, X, Lock, Unlock, RefreshCw } from 'lucide-react';
import { resolverGuiaCacheada, resolverMaestroCacheado, resolverMaestrosCacheados, normalizarCodigo } from './cacheDelivery';
import { useAutocompleteReferenciaConsignacion } from './useAutocompleteReferenciaConsignacion';
import { periodoEstaAbierto } from './verificacionPeriodoConsignacion';
import { registrarLogConsignacion } from '../../utils/registrarLogConsignacion';
import { camposModificacionConsignacion } from '../../utils/modificacionesConsignacion';
import { mapearItemMaestro, buscarItemMaestro } from '../../utils/registroConsignacionService';
import { costoMaestroDe, esPrecioEspecial, errorPrecio, precioANumero, camposPrecio, calcularVentaItem, diferencias, buscarReglaRecargo } from '../../utils/precioEspecial';
import BadgePrecioEspecial from '../../utils/BadgePrecioEspecial';
import { obtenerCodigosCacheados } from '../../registroConsignacion/utils/cacheMaestros';
import { useCatalogo } from '../../../../../../hooks/useCatalogo';
import { ordenarPor } from '../../../../../../stores/catalogosStore';
import { useColumnResize } from '../../../../../../hooks/useColumnResize';
import { ThRedimensionable, ColgroupRedimensionable, ThRelleno, TdRelleno } from '../../../../../ui/ThRedimensionable';
import { BotonRestablecerAnchos } from '../../../../../ui/BotonRestablecerAnchos';

const VIEW_PATH_CARGAS = '/consignacion/cargasConsignacion/cargas';

const formatearFechaTabla = (fechaString) => {
  if (!fechaString || !fechaString.includes('-')) return fechaString || '-';
  const partes = fechaString.split('-');
  if (partes.length !== 3) return fechaString;
  const [yyyy, mm, dd] = partes;
  return `${dd}-${mm}-${yyyy}`;
};

// Columnas de "Ítems Registrados" (redimensionables; ancho y mínimo en px).
const COLUMNAS_ITEMS = [
  { key: 'codigo', label: 'Código', ancho: 95, min: 60 },
  { key: 'referencia', label: 'Referencia', ancho: 140, min: 80 },
  { key: 'descripcion', label: 'Descripción', ancho: 200, min: 90 },
  { key: 'empresa', label: 'Empresa', ancho: 180, min: 80 },
  { key: 'cantidad', label: 'Cant.', ancho: 60, min: 50, extra: 'text-center' },
  { key: 'costo', label: 'Costo', ancho: 130, min: 60 },
  { key: 'lote', label: 'Lote', ancho: 95, min: 60 },
  { key: 'vencimiento', label: 'Vencimiento', ancho: 115, min: 105 },
  { key: 'total', label: 'Total', ancho: 130, min: 60 },
  { key: 'delivery', label: 'Delivery', ancho: 105, min: 65 },
  { key: 'numGuia', label: 'N° Guía', ancho: 95, min: 60 },
  { key: 'atributo', label: 'Atributo', ancho: 110, min: 65 },
  { key: 'estadoCarga', label: 'Estado Carga', ancho: 125, min: 110 },
  { key: 'acciones', label: 'Acciones', ancho: 85, min: 75, extra: 'text-center' }
];
// +1 por la columna de relleno (ColgroupRedimensionable con `relleno`).
const COLSPAN_ITEMS = COLUMNAS_ITEMS.length + 1;

const renderP = (valor) => (valor === '' || valor === undefined || valor === null ? 'P' : valor);

const ESTADO_BADGE = {
  AGENDADO: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
  PENDIENTE: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
  INGRESADO: 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400',
  REVISAR: 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400',
  INCOMPLETO: 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400',
  'S/COTIZACION': 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
  CARGADO: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
};

// Opciones del selector "Estado Carga" (columna "Cargar"), igual patrón que
// CargasTab de Implantes: por-ítem, sin checkboxes. Reusa el mismo campo
// `estado` que ya escribía el checkbox anterior (solo CARGADO/INGRESADO);
// esto amplía ese mismo campo a un tercer valor (REVISAR) vía selector.
const ESTADO_CARGA_OPTIONS = ['PENDIENTE', 'CARGADO', 'REVISAR'];
const ESTADO_CARGA_SELECT_STYLE = {
  PENDIENTE: 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300',
  CARGADO: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400',
  REVISAR: 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400'
};

// Color de fondo de la FILA completa según Estado Carga (distinto del color
// del pill del selector de arriba, a propósito — mismo valor exacto que en
// CargasTab de Implantes, para que ambos módulos se vean consistentes.
const ESTADO_CARGA_ROW_STYLE = {
  PENDIENTE: 'bg-amber-50/40 dark:bg-amber-950/10',
  CARGADO: 'bg-emerald-50/40 dark:bg-emerald-950/10',
  REVISAR: 'bg-orange-50/40 dark:bg-orange-950/10'
};

const NumeroGuiaCell = ({ it, pendiente }) => {
  if (it.numeroGuiaVinculada) {
    return <span>{it.numeroGuiaVinculada}</span>;
  }
  if (pendiente) {
    return (
      <span className="text-amber-600 dark:text-amber-400" title="Pendiente de guardar">
        {pendiente.numeroGuiaVinculada || '-'} <span className="text-[8px] font-bold uppercase">(sin guardar)</span>
      </span>
    );
  }

  const deliveryValor = (it.delivery || '').trim();
  if (!deliveryValor) return <span>-</span>;
  if (it.deliveryVinculado) return <span>-</span>;

  return <span className="text-slate-400 dark:text-gray-500 italic">Resolviendo...</span>;
};

const DesgloseGuia = ({ deliveryValor, referenciaDestacada, colSpanTotal, productosGuardados, productosPendientes }) => {
  const productosAMostrar = (Array.isArray(productosGuardados) && productosGuardados.length > 0)
    ? productosGuardados
    : (Array.isArray(productosPendientes) && productosPendientes.length > 0)
      ? productosPendientes
      : null;

  const esPreview = !(Array.isArray(productosGuardados) && productosGuardados.length > 0) &&
    Array.isArray(productosPendientes) && productosPendientes.length > 0;

  const [cargandoGuia, setCargandoGuia] = useState(false);
  const [guiaEncontrada, setGuiaEncontrada] = useState(null);
  const [error, setError] = useState('');
  const [vinculosCodigos, setVinculosCodigos] = useState({});
  const [cargandoVinculos, setCargandoVinculos] = useState(false);

  useEffect(() => {
    if (productosAMostrar) return; 
    if (!deliveryValor) {
      setGuiaEncontrada(null);
      setError('');
      return;
    }

    let cancelado = false;
    setCargandoGuia(true);
    setError('');

    resolverGuiaCacheada(db, deliveryValor)
      .then((guia) => {
        if (!cancelado) setGuiaEncontrada(guia);
      })
      .catch((err) => {
        console.error('Error al buscar guía por N° Documento:', err);
        if (!cancelado) setError('No se pudo buscar la guía. Intenta nuevamente.');
      })
      .finally(() => {
        if (!cancelado) setCargandoGuia(false);
      });

    return () => { cancelado = true; };
  }, [deliveryValor, productosAMostrar]);

  const productosVisibles = guiaEncontrada?.productos || [];

  useEffect(() => {
    if (productosAMostrar) return;

    const referenciasUnicas = [...new Set(productosVisibles.map(p => (p.codigo || '').trim()).filter(Boolean))];
    if (referenciasUnicas.length === 0) {
      setVinculosCodigos({});
      return;
    }

    let cancelado = false;
    (async () => {
      setCargandoVinculos(true);
      try {
        const mapa = await resolverMaestrosCacheados(db, referenciasUnicas);
        if (!cancelado) setVinculosCodigos(mapa);
      } catch (err) {
        console.error('Error al vincular códigos desde maestros_codigos:', err);
      } finally {
        if (!cancelado) setCargandoVinculos(false);
      }
    })();

    return () => { cancelado = true; };
  }, [guiaEncontrada, productosAMostrar]);

  if (!deliveryValor) {
    return null;
  }

  if (productosAMostrar) {
    return (
      <>
        {esPreview && (
          <tr>
            <td colSpan={colSpanTotal} className="px-2.5 py-1 text-[9px] font-bold uppercase text-amber-700 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-950/10 border-b border-slate-100 dark:border-gray-700/60">
              Vínculo resuelto — pendiente de guardar
            </td>
          </tr>
        )}
        {productosAMostrar.map((p, idx) => {
          const esCoincidente = normalizarCodigo(p.codigo) === normalizarCodigo(referenciaDestacada);
          return (
            <tr
              key={`${p.codigo || 'sc'}-${idx}`}
              className={`text-[10px] ${esCoincidente ? 'bg-blue-100/60 dark:bg-blue-900/30' : 'bg-blue-50/30 dark:bg-blue-950/10'}`}
              title={esCoincidente ? 'Este es el producto que corresponde a este ítem' : ''}
            >
              <td className="px-2.5 py-1 border-b border-r border-slate-100 dark:border-gray-700/60 font-sans font-normal text-slate-500 dark:text-gray-400 truncate" title="No lleva OC">
                No lleva OC
              </td>
              <td className="px-2.5 py-1 border-b border-r border-slate-100 dark:border-gray-700/60 font-num text-emerald-600 dark:text-emerald-400 truncate" title={p.codigo || 'N/A'}>
                <span className="flex items-center gap-1 min-w-0">
                  {esCoincidente && <CheckCircle2 size={10} className="text-blue-600 dark:text-blue-400 shrink-0" />}
                  <span className="truncate">{p.codigo || 'N/A'}</span>
                </span>
              </td>
              <td className="px-2.5 py-1 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-700 dark:text-gray-200 truncate" title={p.descripcion || '-'}>
                {p.descripcion || '-'}
              </td>
              <td className="px-2.5 py-1 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-700 dark:text-gray-200 truncate" title={p.empresa || '-'}>
                {p.empresa || '-'}
              </td>
              <td className="px-2.5 py-1 border-b border-r border-slate-100 dark:border-gray-700/60 text-center text-slate-700 dark:text-gray-200 font-semibold truncate" title={p.cantidad ?? 'N/A'}>
                {p.cantidad ?? 'N/A'}
              </td>
              <td className="px-2.5 py-1 border-b border-r border-slate-100 dark:border-gray-700/60 text-emerald-700 dark:text-emerald-400 truncate">
                $0
              </td>
              <td className="px-2.5 py-1 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-700 dark:text-gray-200 truncate" title={p.lote || 'N/A'}>
                {p.lote || 'N/A'}
              </td>
              <td className="px-2.5 py-1 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-700 dark:text-gray-200 truncate" title={p.vencimiento || 'N/A'}>
                {p.vencimiento || 'N/A'}
              </td>
              <td className="px-2.5 py-1 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-400 dark:text-gray-500 truncate" />
              <td className="px-2.5 py-1 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-400 dark:text-gray-500 truncate" />
              <td className="px-2.5 py-1 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-400 dark:text-gray-500 truncate">
                0
              </td>
              <td className="px-2.5 py-1 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-700 dark:text-gray-200 truncate" title={p.tipo || '-'}>
                {p.tipo || '-'}
              </td>
              <td className="px-2.5 py-1 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-400 dark:text-gray-500 truncate" />
              <td className="px-2.5 py-1 border-b border-slate-100 dark:border-gray-700/60 text-slate-400 dark:text-gray-500 truncate" />
              <TdRelleno className="border-b border-slate-100 dark:border-gray-700/60" />
            </tr>
          );
        })}
      </>
    );
  }

  if (cargandoGuia) {
    return (
      <tr>
        <td colSpan={colSpanTotal} className="px-3 py-2 text-[9px] text-slate-500 dark:text-gray-400 bg-slate-50/60 dark:bg-gray-900/30 border-b border-slate-100 dark:border-gray-700/60">
          <span className="flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> Buscando guía con N° Documento {deliveryValor}...</span>
        </td>
      </tr>
    );
  }

  if (error) {
    return (
      <tr>
        <td colSpan={colSpanTotal} className="px-3 py-2 text-[9px] text-red-600 dark:text-red-400 bg-red-50/60 dark:bg-red-950/10 border-b border-slate-100 dark:border-gray-700/60">
          <span className="flex items-center gap-1.5"><AlertCircle size={11} /> {error}</span>
        </td>
      </tr>
    );
  }

  if (!guiaEncontrada) {
    return (
      <tr>
        <td colSpan={colSpanTotal} className="px-3 py-2 text-[9px] text-amber-700 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-950/10 border-b border-slate-100 dark:border-gray-700/60">
          <span className="flex items-center gap-1.5"><AlertCircle size={11} /> No se encontró ninguna guía con N° Documento{' '}<strong>{deliveryValor}</strong>.</span>
        </td>
      </tr>
    );
  }

  if (productosVisibles.length === 0) {
    return (
      <tr>
        <td colSpan={colSpanTotal} className="px-3 py-2 text-[9px] text-slate-400 dark:text-gray-500 bg-blue-50/30 dark:bg-blue-950/10 border-b border-slate-100 dark:border-gray-700/60">
          Sin productos visibles en esta guía.
        </td>
      </tr>
    );
  }

  return (
    <>
      {productosVisibles.map((p) => {
        const esCoincidente = normalizarCodigo(p.codigo) === normalizarCodigo(referenciaDestacada);
        const vinculo = vinculosCodigos[(p.codigo || '').trim()];
        return (
          <tr
            key={p.id}
            className={`text-[10px] ${esCoincidente ? 'bg-blue-100/60 dark:bg-blue-900/30' : 'bg-blue-50/30 dark:bg-blue-950/10'}`}
            title={esCoincidente ? 'Este es el producto que corresponde a este ítem' : ''}
          >
            <td className="px-2.5 py-1 border-b border-r border-slate-100 dark:border-gray-700/60 font-sans font-normal text-slate-500 dark:text-gray-400 truncate" title="No lleva OC">
              No lleva OC
            </td>
            <td className="px-2.5 py-1 border-b border-r border-slate-100 dark:border-gray-700/60 font-num text-emerald-600 dark:text-emerald-400 truncate" title={p.codigo || 'N/A'}>
              <span className="flex items-center gap-1 min-w-0">
                {esCoincidente && <CheckCircle2 size={10} className="text-blue-600 dark:text-blue-400 shrink-0" />}
                <span className="truncate">{p.codigo || 'N/A'}</span>
              </span>
            </td>
            <td className="px-2.5 py-1 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-700 dark:text-gray-200 truncate" title={cargandoVinculos ? undefined : (vinculo?.descripcion || '-')}>
              {cargandoVinculos ? '...' : (vinculo?.descripcion || '-')}
            </td>
            <td className="px-2.5 py-1 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-700 dark:text-gray-200 truncate" title={cargandoVinculos ? undefined : (vinculo?.empresa || '-')}>
              {cargandoVinculos ? '...' : (vinculo?.empresa || '-')}
            </td>
            <td className="px-2.5 py-1 border-b border-r border-slate-100 dark:border-gray-700/60 text-center text-slate-700 dark:text-gray-200 font-semibold truncate" title={p.cantidad ?? 'N/A'}>
              {p.cantidad ?? 'N/A'}
            </td>
            <td className="px-2.5 py-1 border-b border-r border-slate-100 dark:border-gray-700/60 text-emerald-700 dark:text-emerald-400 truncate">
              $0
            </td>
            <td className="px-2.5 py-1 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-700 dark:text-gray-200 truncate" title={p.lote || 'N/A'}>
              {p.lote || 'N/A'}
            </td>
            <td className="px-2.5 py-1 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-700 dark:text-gray-200 truncate" title={p.vencimiento || 'N/A'}>
              {p.vencimiento || 'N/A'}
            </td>
            <td className="px-2.5 py-1 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-400 dark:text-gray-500 truncate" />
            <td className="px-2.5 py-1 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-400 dark:text-gray-500 truncate" />
            <td className="px-2.5 py-1 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-400 dark:text-gray-500 truncate">
              0
            </td>
            <td className="px-2.5 py-1 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-700 dark:text-gray-200 truncate" title={cargandoVinculos ? undefined : (vinculo?.tipo || '-')}>
              {cargandoVinculos ? '...' : (vinculo?.tipo || '-')}
            </td>
            <td className="px-2.5 py-1 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-400 dark:text-gray-500 truncate" />
            <td className="px-2.5 py-1 border-b border-slate-100 dark:border-gray-700/60 text-slate-400 dark:text-gray-500 truncate" />
            <TdRelleno className="border-b border-slate-100 dark:border-gray-700/60" />
          </tr>
        );
      })}
    </>
  );
};

// El listado de sugerencias vive dentro de la tabla de ítems, que tiene
// overflow-auto — eso recorta cualquier dropdown posicionado con `absolute`
// que se salga de sus bordes. Se resuelve sacándolo del flujo con un portal
// a document.body, posicionado en coordenadas de viewport (mismo patrón que
// CotizacionCard.jsx de Implantes).
const DropdownReferenciaPortal = ({ anchorRef, portalRef, children }) => {
  const [rect, setRect] = useState(null);

  useLayoutEffect(() => {
    const actualizarPosicion = () => {
      if (anchorRef.current) setRect(anchorRef.current.getBoundingClientRect());
    };
    actualizarPosicion();
    window.addEventListener('scroll', actualizarPosicion, true);
    window.addEventListener('resize', actualizarPosicion);
    return () => {
      window.removeEventListener('scroll', actualizarPosicion, true);
      window.removeEventListener('resize', actualizarPosicion);
    };
  }, [anchorRef]);

  if (!rect) return null;

  return createPortal(
    <div
      ref={portalRef}
      style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, zIndex: 9999 }}
    >
      {children}
    </div>,
    document.body
  );
};

// `costoMaestro`: precio del maestro del ítem (para saber si el precio
// editado es especial, ver utils/precioEspecial.js).
const BORRADOR_ITEM_VACIO = {
  referencia: '', codigo: '', empresa: '', descripcion: '', costo: '', costoMaestro: '',
  cantidad: '', lote: '', vencimiento: ''
};

const CargasTab = ({ registro, items = [], formData, onChange, setCargando }) => {
  const totalItems = items.length;

  const { showToast } = useToast();
  const { userData } = useUser();
  const { anchos, handleResize, restablecerAnchos, anchoTotalTabla, personalizados } =
    useColumnResize(COLUMNAS_ITEMS, { clave: 'cargasConsignacion.itemsRegistrados', usuario: userData?.uid });
  const { hasPermission } = useGranularPermission();

  const registrarLog = (docRef, accion, detalles) => registrarLogConsignacion(docRef, accion, detalles, userData);

  // Reglas de recargo desde el catalogosStore (lectura única por sesión,
  // compartida con Implantes/Hemodinamia) en vez de un listener por montaje.
  const { datos: recargosCatalogo } = useCatalogo('recargos');
  const recargos = useMemo(() => [...recargosCatalogo].sort(ordenarPor('desde')), [recargosCatalogo]);

  const buscarRecargo = (costo) => buscarReglaRecargo(recargos, costo);

  // Venta = precio × veces costo (regla de recargo del rango del precio) ×
  // cantidad, misma fórmula que Implantes → Gestiones → Cargas. También
  // devuelve el total (precio × cantidad) y el margen (venta − total).
  const calcularVenta = (it) => calcularVentaItem(it.costo, it.cantidad, buscarRecargo);

  useEffect(() => {
    if (!recargos.length) return;

    items.forEach(async (it) => {
      if (!it.ref) return;
      const { vecesCosto, venta } = calcularVenta(it);
      if (vecesCosto === null || venta === null) return;

      if (it.recargoVecesCosto !== vecesCosto || it.venta !== venta) {
        try {
          await updateDoc(it.ref, { recargoVecesCosto: vecesCosto, venta });
        } catch (err) {
          console.error('Error al guardar recargo/venta del ítem:', err);
        }
      }
    });
  }, [items, recargos]);

  const procesandoRef = useRef(new Set());

  const [pendientes, setPendientes] = useState({}); 
  const [guardandoPendientes, setGuardandoPendientes] = useState(false);

  const claveVinculacion = items
    .map(it => `${it.id}:${(it.delivery || '').trim()}:${(it.referencia || '').trim()}:${it.deliveryVinculado ? 1 : 0}`)
    .join('|');

  useEffect(() => {
    let cancelado = false;

    (async () => {
      for (const it of items) {
        if (cancelado) return;
        if (!it.ref || it.deliveryVinculado || pendientes[it.id]) continue;

        const deliveryValor = (it.delivery || '').trim();
        const referencia = (it.referencia || '').trim();
        if (!deliveryValor) continue;

        const claveEnCurso = `${it.id}:${deliveryValor}`;
        if (procesandoRef.current.has(claveEnCurso)) continue;
        procesandoRef.current.add(claveEnCurso);

        try {
          const guia = await resolverGuiaCacheada(db, deliveryValor);
          if (!guia) continue; 

          const productoCoincidente = guia.productos.find(
            p => normalizarCodigo(p.codigo) === normalizarCodigo(referencia)
          );

          const codigosUnicos = guia.productos.map(p => (p.codigo || '').trim()).filter(Boolean);
          const mapaMaestros = await resolverMaestrosCacheados(db, codigosUnicos);

          const productosGuiaVinculados = guia.productos.map(p => {
            const codigoRef = (p.codigo || '').trim();
            const vinculoProducto = codigoRef ? mapaMaestros[codigoRef] : null;
            return {
              codigo: p.codigo || '',
              descripcion: vinculoProducto?.descripcion || '',
              empresa: vinculoProducto?.empresa || '',
              tipo: vinculoProducto?.tipo || '',
              lote: p.lote || '',
              vencimiento: p.vencimiento || '',
              cantidad: p.cantidad ?? null
            };
          });

          const vinculoMaestroCoincidente = productoCoincidente
            ? mapaMaestros[(productoCoincidente.codigo || '').trim()]
            : null;

          const payload = productoCoincidente
            ? {
                numeroGuiaVinculada: guia.numeroGuia || '',
                fechaEmisionGuiaVinculada: guia.fechaEmision || '',
                loteGuiaVinculado: productoCoincidente.lote || '',
                vencimientoGuiaVinculado: productoCoincidente.vencimiento || '',
                codigoMaestroVinculado: vinculoMaestroCoincidente?.codigo || '',
                descripcionMaestroVinculado: vinculoMaestroCoincidente?.descripcion || '',
                tipoMaestroVinculado: vinculoMaestroCoincidente?.tipo || '',
                empresaMaestroVinculada: vinculoMaestroCoincidente?.empresa || '',
                productosGuiaVinculados,
                deliveryVinculado: true,
                vinculoIncompleto: false,
                fechaVinculacionDelivery: new Date()
              }
            : {
                numeroGuiaVinculada: guia.numeroGuia || '',
                fechaEmisionGuiaVinculada: guia.fechaEmision || '',
                productosGuiaVinculados,
                deliveryVinculado: true,
                vinculoIncompleto: true,
                fechaVinculacionDelivery: new Date()
              };

          if (!cancelado) {
            setPendientes(prev => ({ ...prev, [it.id]: { ref: it.ref, payload } }));
          }
        } catch (err) {
          console.error('Error al resolver vínculo con guía de delivery:', err);
        } finally {
          procesandoRef.current.delete(claveEnCurso);
        }
      }
    })();

    return () => { cancelado = true; };
  }, [claveVinculacion]);

  const cantidadPendientes = Object.keys(pendientes).length;

  const handleGuardarPendientes = async () => {
    if (cantidadPendientes === 0) return;
    setGuardandoPendientes(true);
    try {
      const batch = writeBatch(db);
      Object.values(pendientes).forEach(({ ref, payload }) => {
        batch.update(ref, payload);
      });
      await batch.commit();
      setPendientes({});
    } catch (err) {
      console.error('Error al guardar las vinculaciones de delivery:', err);
    } finally {
      setGuardandoPendientes(false);
    }
  };

  const [actualizandoEstadoId, setActualizandoEstadoId] = useState(null);

  const handleActualizarEstadoCarga = async (it, nuevoEstado) => {
    if (!it.ref) return;
    const estaSolicitado = (it.estado || '').toUpperCase() === 'SOLICITADO';
    setActualizandoEstadoId(it.id);
    try {
      if (estaSolicitado) {
        // El ítem ya fue exportado a consignacion_imputadas — solo llega
        // acá con el candado desbloqueado (el select está deshabilitado si
        // no), así que el cambio también se resincroniza en el mismo batch.
        if (!it.periodoAnio || !it.periodoMes) {
          showToast('No se pudo actualizar: este ítem no tiene un período registrado (dato legado). Contactá a un administrador.', 'error');
          return;
        }
        const abierto = await periodoEstaAbierto(it.periodoAnio, it.periodoMes);
        if (!abierto) {
          showToast('No se actualizó: el período de este ítem ya fue cerrado.', 'error');
          return;
        }

        const batch = writeBatch(db);
        batch.update(it.ref, { estado: nuevoEstado });
        batch.set(
          doc(db, 'consignacion_imputadas', String(it.periodoAnio), 'meses', it.periodoMes, 'documentos', it.id),
          { estado: nuevoEstado, actualizadoEn: new Date() },
          { merge: true }
        );
        await batch.commit();
        await registrarLog(it.ref, 'ITEM_EDITADO', { estadoCargaAnterior: it.estado, estadoCargaNuevo: nuevoEstado });
      } else {
        await updateDoc(it.ref, { estado: nuevoEstado });
      }
    } catch (err) {
      console.error('Error al actualizar el estado del ítem:', err);
      showToast('Error al actualizar el estado del ítem', 'error');
    } finally {
      setActualizandoEstadoId(null);
    }
  };

  // Edición inline por fila de la tabla "Ítems Registrados" — mismo patrón
  // que CotizacionCard.jsx de Implantes (lápiz → fila editable → guardar),
  // pero acá cada ítem es un documento propio y se persiste al toque con
  // updateDoc (no hay "Guardar Todo" en este módulo). El recargo/venta no
  // se recalcula acá: al cambiar `costo` (vía referencia) el useEffect de
  // más arriba (líneas ~332) lo detecta y lo vuelve a guardar solo.
  const [editandoId, setEditandoId] = useState(null);
  const [borradorItem, setBorradorItem] = useState(BORRADOR_ITEM_VACIO);
  const [guardandoEdicionId, setGuardandoEdicionId] = useState(null);

  // Vista previa en vivo mientras se edita un ítem: la tabla "Cargas" (venta,
  // recargo) y el total de la admisión usan el precio y la cantidad del
  // borrador. Se calcula en el cliente, sin lecturas.
  const itemsVista = useMemo(() => items.map((it) => {
    if (it.id !== editandoId) return it;
    const costo = precioANumero(borradorItem.costo);
    return {
      ...it,
      costo: Number.isFinite(costo) ? costo : 0,
      cantidad: Number(borradorItem.cantidad) || 0,
      // Sin los guardados: se recalculan con el precio del borrador.
      recargoVecesCosto: undefined,
      venta: undefined
    };
  }), [items, editandoId, borradorItem.costo, borradorItem.cantidad]);
  const sumaCostos = itemsVista.reduce((acc, it) => acc + (Number(it.costo) || 0) * (Number(it.cantidad) || 1), 0);

  // Candado por ítem (equivalente al candado por bloque de implantes, pero
  // acá cada carga es su propio documento): un ítem con estado SOLICITADO
  // ya fue exportado a consignacion_imputadas y queda de solo lectura hasta
  // que se desbloquea a propósito. `desbloqueados` es puramente de sesión —
  // no se persiste, se vuelve a bloquear automáticamente tras guardar.
  const [desbloqueados, setDesbloqueados] = useState(new Set());
  const [verificandoCandadoId, setVerificandoCandadoId] = useState(null);
  const puedeDesbloquearCandado = hasPermission(VIEW_PATH_CARGAS, 'tabla_items_completa', 'accion_desbloquear_candado');

  const handleAbrirCandadoItem = async (it) => {
    if (verificandoCandadoId) return;
    setVerificandoCandadoId(it.id);
    try {
      if (!it.periodoAnio || !it.periodoMes) {
        showToast('No se puede editar: este ítem no tiene un período registrado (dato legado). Contactá a un administrador.', 'error');
        return;
      }
      const abierto = await periodoEstaAbierto(it.periodoAnio, it.periodoMes);
      if (!abierto) {
        showToast('No se puede editar: el período de este ítem ya fue cerrado.', 'error');
        return;
      }
      setDesbloqueados(prev => new Set(prev).add(it.id));
    } catch (err) {
      console.error('Error al verificar período para desbloquear candado:', err);
      showToast('No se pudo verificar el período. Intentá de nuevo.', 'error');
    } finally {
      setVerificandoCandadoId(null);
    }
  };

  // Candado de la admisión, en la cabecera de "Ítems Registrados" (como el
  // botón "Imputado" del bloque en Implantes): el candado de cada ítem va en
  // la última columna de la tabla, que en pantallas normales queda fuera de
  // la vista. Desbloquea de una vez los ítems SOLICITADO cuyo período está
  // abierto (1 consulta por período distinto) y avisa de los demás.
  const itemsImputados = items.filter(it => (it.estado || '').toUpperCase() === 'SOLICITADO');
  const imputadosBloqueados = itemsImputados.filter(it => !desbloqueados.has(it.id));
  const admisionBloqueada = imputadosBloqueados.length > 0;
  const [verificandoCandadoAdmision, setVerificandoCandadoAdmision] = useState(false);

  const handleAbrirCandadoAdmision = async () => {
    if (verificandoCandadoAdmision || !admisionBloqueada) return;
    setVerificandoCandadoAdmision(true);
    try {
      const abiertoPorPeriodo = new Map();
      const abrir = [];
      let cerrados = 0;
      let sinPeriodo = 0;
      for (const it of imputadosBloqueados) {
        if (!it.periodoAnio || !it.periodoMes) { sinPeriodo++; continue; }
        const clave = `${it.periodoAnio}/${it.periodoMes}`;
        if (!abiertoPorPeriodo.has(clave)) abiertoPorPeriodo.set(clave, await periodoEstaAbierto(it.periodoAnio, it.periodoMes));
        if (abiertoPorPeriodo.get(clave)) abrir.push(it.id); else cerrados++;
      }
      if (abrir.length) setDesbloqueados(prev => new Set([...prev, ...abrir]));
      if (cerrados || sinPeriodo) {
        const partes = [];
        if (cerrados) partes.push(`${cerrados} con el período ya cerrado`);
        if (sinPeriodo) partes.push(`${sinPeriodo} sin período registrado (dato legado; contactá a un administrador)`);
        showToast(`${abrir.length ? `Se desbloquearon ${abrir.length} ítem(s). ` : 'No se desbloqueó ningún ítem. '}Quedan bloqueados: ${partes.join(' y ')}.`, abrir.length ? 'info' : 'error');
      }
    } catch (err) {
      console.error('Error al verificar período para desbloquear candado:', err);
      showToast('No se pudo verificar el período. Intentá de nuevo.', 'error');
    } finally {
      setVerificandoCandadoAdmision(false);
    }
  };

  const {
    sugerencias: sugerenciasEdicion, buscando: buscandoEdicion, mostrarSug: mostrarSugEdicion,
    setMostrarSug: setMostrarSugEdicion, containerRef: containerRefEdicion, portalRef: portalRefEdicion, skipNext: skipNextEdicion
  } = useAutocompleteReferenciaConsignacion(editandoId ? borradorItem.referencia : '');

  const iniciarEdicionItem = (it) => {
    const estaSolicitado = (it.estado || '').toUpperCase() === 'SOLICITADO';
    if (estaSolicitado && !desbloqueados.has(it.id)) return;
    setEditandoId(it.id);
    setBorradorItem({
      referencia: it.referencia || '',
      codigo: it.codigo || '',
      empresa: it.empresa || '',
      descripcion: it.descripcion || '',
      costo: it.costo ?? '',
      costoMaestro: costoMaestroDe(it),
      cantidad: String(it.cantidad ?? ''),
      lote: it.lote || '',
      vencimiento: it.vencimiento || ''
    });
  };

  const cancelarEdicionItem = () => {
    setEditandoId(null);
    setBorradorItem(BORRADOR_ITEM_VACIO);
    setMostrarSugEdicion(false);
  };

  const handleReferenciaEdicionChange = (value) => {
    setBorradorItem(prev => ({
      ...prev,
      referencia: value,
      codigo: '',
      empresa: '',
      descripcion: '',
      costo: '',
      costoMaestro: ''
    }));
  };

  // Campos del borrador que vienen del maestro: mismo mapeo que Registro y
  // Carga Masiva (descripción = descriptorAuto). El precio vuelve al del
  // maestro (deja de ser especial hasta que se edite de nuevo).
  const camposMaestroBorrador = (item, prev) => {
    const m = mapearItemMaestro(item);
    const costo = m.costo === '' ? 0 : m.costo;
    return {
      referencia: m.referencia || prev.referencia,
      codigo: m.codigo,
      empresa: m.empresa,
      descripcion: m.descripcion,
      costo,
      costoMaestro: costo
    };
  };

  const tipoMaestroDeItem = (it) => it.atributo || it.tipo || 'CONSIGNACION';

  // Misma búsqueda en el maestro que Registro y Carga Masiva: catálogo
  // filtrado por tipo (atributo del ítem) y coincidencia exacta por Código
  // interno o, si no, por Referencia.
  const buscarEnMaestroParaItem = async (it, { codigo, referencia }) => {
    const codigos = await obtenerCodigosCacheados(db, tipoMaestroDeItem(it));
    return buscarItemMaestro(codigos, { codigo, referencia });
  };

  const handleSeleccionarSugerenciaEdicion = (item) => {
    skipNextEdicion.current = true;
    setBorradorItem(prev => ({ ...prev, ...camposMaestroBorrador(item, prev) }));
    setMostrarSugEdicion(false);
  };

  // "Actualizar desde maestro": vuelve a traer descripción, código,
  // empresa y precio sin cambiar la referencia (corrige registros antiguos).
  const [actualizandoMaestroId, setActualizandoMaestroId] = useState(null);
  const handleActualizarDesdeMaestro = async (it) => {
    if (actualizandoMaestroId) return;
    setActualizandoMaestroId(it.id);
    try {
      const item = await buscarEnMaestroParaItem(it, borradorItem);
      if (!item) {
        showToast(`"${borradorItem.referencia.trim() || borradorItem.codigo}" no está en el maestro (${tipoMaestroDeItem(it)})`, 'error');
        return;
      }
      setBorradorItem(prev => ({ ...prev, ...camposMaestroBorrador(item, prev) }));
      showToast('Datos actualizados desde el maestro. Presiona ✓ para guardar.', 'info');
    } catch (err) {
      console.error('Error al consultar el maestro:', err);
      showToast('No se pudo consultar el maestro. Intentá de nuevo.', 'error');
    } finally {
      setActualizandoMaestroId(null);
    }
  };

  const guardarEdicionItem = async (it) => {
    const cantidadNum = Number(borradorItem.cantidad);
    if (!borradorItem.referencia.trim() || !borradorItem.cantidad || isNaN(cantidadNum) || cantidadNum <= 0) return;
    if (!it.ref) return;
    const errorDelPrecio = errorPrecio(borradorItem.costo);
    if (errorDelPrecio) {
      showToast(errorDelPrecio, 'error');
      return;
    }

    setGuardandoEdicionId(it.id);
    try {
      // Referencia escrita a mano sin elegir sugerencia: se busca en el
      // maestro para no guardar el registro sin sus datos.
      let borrador = borradorItem;
      const referenciaCambio = borrador.referencia.trim() !== (it.referencia || '').trim();
      if (referenciaCambio && !borrador.codigo && !borrador.descripcion) {
        const item = await buscarEnMaestroParaItem(it, { referencia: borrador.referencia });
        if (!item) {
          showToast(`La referencia "${borrador.referencia.trim()}" no está en el maestro (${tipoMaestroDeItem(it)}). Selecciónala de la lista.`, 'error');
          return;
        }
        borrador = { ...borrador, ...camposMaestroBorrador(item, borrador) };
      }

      const estaSolicitado = (it.estado || '').toUpperCase() === 'SOLICITADO';
      // Precio editado: solo en esta carga (nunca en maestros_codigos). Se
      // guarda con el precio del maestro y la marca de precio especial.
      const costoNum = precioANumero(borrador.costo);
      const precio = camposPrecio(costoNum, borrador.costoMaestro === '' ? costoMaestroDe(it) : borrador.costoMaestro);
      const { vecesCosto, venta } = calcularVenta({ costo: costoNum, cantidad: cantidadNum });
      const camposFinancieros = vecesCosto != null ? { recargoVecesCosto: vecesCosto, venta } : {};
      const { cambios, anteriores } = diferencias(it, {
        referencia: borrador.referencia.trim(),
        codigo: borrador.codigo || '',
        empresa: borrador.empresa || '',
        descripcion: borrador.descripcion || '',
        ...precio,
        cantidad: cantidadNum,
        lote: borrador.lote.trim(),
        vencimiento: borrador.vencimiento || '',
        ...camposFinancieros
      });
      // Un ítem que nunca tuvo precio especial no necesita guardar la marca
      // en false ni el precio del maestro (no cambió nada).
      if (!precio.precioEspecial && !esPrecioEspecial(it) && it.costoMaestro === undefined) {
        delete cambios.precioEspecial;
        delete cambios.costoMaestro;
        delete anteriores.precioEspecialAnterior;
        delete anteriores.costoMaestroAnterior;
      }
      // Historial: los campos editados (sin los derivados de recargo/venta)
      // con su valor anterior, como ITEM_EDITADO de Implantes.
      const camposEditados = { ...cambios };
      delete camposEditados.recargoVecesCosto;
      delete camposEditados.venta;
      const detallesLog = { ...camposEditados, ...anteriores };
      delete detallesLog.recargoVecesCostoAnterior;
      delete detallesLog.ventaAnterior;

      if (Object.keys(cambios).length === 0) {
        showToast('No hay cambios para guardar', 'info');
        cancelarEdicionItem();
        return;
      }

      if (estaSolicitado) {
        // Solo se llega acá con el candado ya desbloqueado (el lápiz está
        // reemplazado por el candado si no) — de todos modos se re-verifica
        // el período por si se cerró mientras se editaba, mismo criterio que
        // el "Guardar Todo" de implantes.
        if (!it.periodoAnio || !it.periodoMes) {
          showToast('No se guardó: este ítem no tiene un período registrado (dato legado). Contactá a un administrador.', 'error');
          return;
        }
        const abierto = await periodoEstaAbierto(it.periodoAnio, it.periodoMes);
        if (!abierto) {
          showToast('No se guardó: el período de este ítem ya fue cerrado mientras lo editabas.', 'error');
          return;
        }

        // Igual que el guardado de un bloque SOLICITADO de Implantes: se
        // compara con la foto de lo solicitado (itemsSolicitados) y se marca
        // modificacionPendiente para "Solicitudes de modificaciones", en
        // esta misma escritura (0 lecturas extra).
        const camposModificacion = camposModificacionConsignacion(it.id, it, { ...cambios, ...camposFinancieros });

        const batch = writeBatch(db);
        batch.update(it.ref, { ...cambios, ...camposModificacion });
        batch.set(
          doc(db, 'consignacion_imputadas', String(it.periodoAnio), 'meses', it.periodoMes, 'documentos', it.id),
          { ...cambios, ...camposFinancieros, total: costoNum * cantidadNum, actualizadoEn: new Date() },
          { merge: true }
        );
        await batch.commit();

        await registrarLog(it.ref, 'ITEM_EDITADO', detallesLog);
        await registrarLog(it.ref, 'IMPUTACION_RESINCRONIZADA', { periodoAnio: it.periodoAnio, periodoMes: it.periodoMes });

        setDesbloqueados(prev => {
          const next = new Set(prev);
          next.delete(it.id);
          return next;
        });
      } else {
        await updateDoc(it.ref, cambios);
        await registrarLog(it.ref, 'ITEM_EDITADO', detallesLog);
      }

      cancelarEdicionItem();
    } catch (err) {
      console.error('Error al guardar la edición del ítem:', err);
      showToast('Error al guardar los cambios', 'error');
    } finally {
      setGuardandoEdicionId(null);
    }
  };

  return (
    <div className="p-4 max-w-7xl mx-auto w-full space-y-4">

      {/* Barra de guardado de vinculaciones pendientes de Delivery */}
      {cantidadPendientes > 0 && (
        <div className="flex items-center justify-between gap-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-lg px-3 py-2">
          <span className="flex items-center gap-1.5 text-[11px] text-amber-800 dark:text-amber-300 font-medium">
            <Link2 size={13} />
            {cantidadPendientes} ítem{cantidadPendientes !== 1 ? 's' : ''} con vínculo de Delivery resuelto, pendiente de guardar.
          </span>
          <button
            type="button"
            onClick={handleGuardarPendientes}
            disabled={guardandoPendientes}
            className="h-7 px-3 bg-[#2383C2] hover:bg-[#1d6fa5] text-white rounded font-semibold flex items-center gap-1.5 transition text-[11px] disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {guardandoPendientes ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Guardar Vinculaciones de Delivery ({cantidadPendientes})
          </button>
        </div>
      )}

      {/* Contenedor 1: Información General */}
      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700/80 rounded-lg shadow-xs overflow-hidden">
        <div className="px-3 py-1.5 bg-slate-50/80 dark:bg-gray-800/80 border-b border-slate-200 dark:border-gray-700 flex items-center gap-1.5">
          <User size={13} className="text-[#2383C2]" />
          <h3 className="text-[11px] font-bold text-slate-700 dark:text-gray-200 uppercase tracking-wide">
            Información General — Admisión #{registro?.gestionId || 'N/A'}
          </h3>
        </div>

        <div className="p-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2.5 text-[10px]">
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-slate-400 dark:text-gray-500 text-[9px] uppercase">Paciente</span>
            <span className="text-slate-700 dark:text-gray-200 font-medium">{renderP(registro?.nombre)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-slate-400 dark:text-gray-500 text-[9px] uppercase">Médico</span>
            <span className="text-slate-700 dark:text-gray-200">{renderP(registro?.medico)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-slate-400 dark:text-gray-500 text-[9px] uppercase">Fecha</span>
            <span className="text-slate-700 dark:text-gray-200">{formatearFechaTabla(registro?.fecha)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-slate-400 dark:text-gray-500 text-[9px] uppercase">Centro</span>
            <span className="text-slate-700 dark:text-gray-200">{renderP(registro?.centro)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-slate-400 dark:text-gray-500 text-[9px] uppercase">Convenio</span>
            <span className="text-slate-700 dark:text-gray-200">{renderP(registro?.convenio)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-slate-400 dark:text-gray-500 text-[9px] uppercase">Previsión</span>
            <span className="text-slate-700 dark:text-gray-200">{renderP(registro?.prevision)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-slate-400 dark:text-gray-500 text-[9px] uppercase">Registrado Por</span>
            <span className="text-slate-700 dark:text-gray-200">{renderP(registro?.registradoPor)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-slate-400 dark:text-gray-500 text-[9px] uppercase">N° de Ítems</span>
            <span className="text-slate-700 dark:text-gray-200 font-semibold">{totalItems}</span>
          </div>

          {registro?.descripcionPabellon && (
            <div className="flex flex-col gap-0.5 col-span-2 md:col-span-3 lg:col-span-4">
              <span className="font-bold text-slate-400 dark:text-gray-500 text-[9px] uppercase">Descripción Pabellón</span>
              <span className="text-slate-700 dark:text-gray-200">{registro.descripcionPabellon}</span>
            </div>
          )}
        </div>
      </div>

      {/* Contenedor 2: Cargas — Admisión, Código, Cantidad, Venta, Estado */}
      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700/80 rounded-lg shadow-xs overflow-hidden">
        <div className="px-3 py-1.5 bg-slate-50/80 dark:bg-gray-800/80 border-b border-slate-200 dark:border-gray-700 flex items-center gap-1.5">
          <UploadCloud size={13} className="text-[#2383C2]" />
          <h3 className="text-[11px] font-bold text-slate-700 dark:text-gray-200 uppercase tracking-wide">
            Cargas
          </h3>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-left text-[10px] border-collapse">
            <thead className="bg-slate-50 dark:bg-gray-900/60">
              <tr className="text-slate-500 dark:text-gray-400 uppercase font-bold text-[9px]">
                <th className="px-2.5 py-1.5 border-b border-r border-slate-200 dark:border-gray-700">Estado Carga</th>
                <th className="px-2.5 py-1.5 border-b border-r border-slate-200 dark:border-gray-700">Admisión</th>
                <th className="px-2.5 py-1.5 border-b border-r border-slate-200 dark:border-gray-700">Código</th>
                <th className="px-2.5 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 text-center">Cantidad</th>
                <th className="px-2.5 py-1.5 border-b border-r border-slate-200 dark:border-gray-700">Venta</th>
                <th className="px-2.5 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 text-center">Recargo</th>
                <th className="px-2.5 py-1.5 border-b border-slate-200 dark:border-gray-700">Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-slate-400 dark:text-gray-500">
                    Sin ítems registrados para esta admisión
                  </td>
                </tr>
              ) : (
                itemsVista.map((it) => {
                  const estadoKey = (it.estado || 'INGRESADO').toUpperCase();
                  const costo = Number(it.costo) || 0;
                  const { vecesCosto: vecesCostoCalculado, venta: ventaCalculada } = calcularVenta(it);
                  const vecesCosto = it.recargoVecesCosto ?? vecesCostoCalculado;
                  const venta = it.venta ?? ventaCalculada;
                  const actualizando = actualizandoEstadoId === it.id;
                  const estaSolicitadoResumen = estadoKey === 'SOLICITADO';
                  const candadoBloqueadoResumen = estaSolicitadoResumen && !desbloqueados.has(it.id);
                  const estadoCargaValor = ESTADO_CARGA_OPTIONS.includes(estadoKey)
                    ? estadoKey
                    : (estaSolicitadoResumen ? 'CARGADO' : 'PENDIENTE');
                  return (
                    <tr key={it.id} className={`border-l-2 border-transparent hover:border-[#2383C2] transition-colors ${ESTADO_CARGA_ROW_STYLE[estadoCargaValor]}`}>
                      <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60">
                        <select
                          value={estadoCargaValor}
                          disabled={actualizando || candadoBloqueadoResumen}
                          onChange={(e) => handleActualizarEstadoCarga(it, e.target.value)}
                          title={candadoBloqueadoResumen ? 'Bloqueado: ya fue solicitado/imputado — desbloqueá desde "Ítems Registrados"' : undefined}
                          className={`h-6 px-1.5 text-[9px] font-bold rounded border outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${ESTADO_CARGA_SELECT_STYLE[estadoCargaValor]}`}
                        >
                          {ESTADO_CARGA_OPTIONS.map(op => (
                            <option key={op} value={op}>{op}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 font-semibold text-[#2383C2]">
                        {registro?.gestionId || 'N/A'}
                      </td>
                      <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 font-num text-emerald-600 dark:text-emerald-400">
                        {it.codigo || 'S/C'}
                      </td>
                      <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-center text-slate-700 dark:text-gray-200 font-semibold">
                        {it.cantidad ?? 0}
                      </td>
                      <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-emerald-700 dark:text-emerald-400 font-semibold">
                        {venta != null ? (
                          <>
                            ${Number(venta).toLocaleString('es-CL')}
                            {editandoId === it.id && <span className="ml-1 text-[8px] font-normal text-blue-600 dark:text-blue-400 italic">(en edición)</span>}
                          </>
                        ) : costo === 0 ? (
                          <span className="text-slate-400 dark:text-gray-500 italic font-normal">Sin costo</span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400 italic font-normal">Sin regla</span>
                        )}
                      </td>
                      <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-center text-slate-700 dark:text-gray-200">
                        {vecesCosto != null ? `${vecesCosto} x` : '-'}
                      </td>
                      <td className="px-2.5 py-1.5 border-b border-slate-100 dark:border-gray-700/60">
                        <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold rounded-full uppercase ${ESTADO_BADGE[estadoKey] || 'bg-slate-100 text-slate-600'}`}>
                          {estadoKey}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Contenedor 3: Ítems Registrados — tabla completa, incluyendo el ítem vinculado del delivery */}
      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700/80 rounded-lg shadow-xs overflow-hidden">
        <div className="px-3 py-1.5 bg-slate-50/80 dark:bg-gray-800/80 border-b border-slate-200 dark:border-gray-700 flex items-center gap-1.5">
          <Package size={13} className="text-[#2383C2]" />
          <h3 className="text-[11px] font-bold text-slate-700 dark:text-gray-200 uppercase tracking-wide">
            Ítems Registrados
          </h3>
          {itemsImputados.length > 0 && puedeDesbloquearCandado && (
            <button
              type="button"
              onClick={admisionBloqueada ? handleAbrirCandadoAdmision : undefined}
              disabled={!admisionBloqueada || verificandoCandadoAdmision}
              title={
                admisionBloqueada
                  ? 'Hay ítems ya imputados — click para desbloquear su edición'
                  : 'Desbloqueado — editá y guardá cada ítem para volver a bloquearlo'
              }
              className={`flex items-center gap-1 h-6 px-2 rounded text-[9px] font-bold transition shrink-0 ${
                admisionBloqueada
                  ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-950/50 cursor-pointer'
                  : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 cursor-default'
              } disabled:opacity-60`}
            >
              {verificandoCandadoAdmision ? <Loader2 size={11} className="animate-spin" /> : admisionBloqueada ? <Lock size={11} /> : <Unlock size={11} />}
              <span>{admisionBloqueada ? 'Imputado' : 'Editando'}</span>
            </button>
          )}
          <BotonRestablecerAnchos onClick={restablecerAnchos} personalizados={personalizados} className="ml-auto h-6" />
        </div>

        {admisionBloqueada && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 text-[11px] text-amber-700 dark:text-amber-400">
            <Lock size={14} className="shrink-0" />
            <span>
              {imputadosBloqueados.length === items.length
                ? 'Esta admisión ya fue solicitada e imputada. Está en solo lectura'
                : `${imputadosBloqueados.length} de ${items.length} ítem(s) ya fueron solicitados e imputados y están en solo lectura`}
              {puedeDesbloquearCandado ? ' — presiona el candado "Imputado" para desbloquearlos y poder editarlos.' : '.'}
            </span>
          </div>
        )}

        <div className="overflow-auto">
          <table
            className="text-left text-[10px] border-collapse"
            style={{ tableLayout: 'fixed', width: anchoTotalTabla, minWidth: '100%' }}
          >
            <ColgroupRedimensionable columnas={COLUMNAS_ITEMS} anchos={anchos} relleno />
            <thead className="bg-slate-50 dark:bg-gray-900/60">
              <tr className="text-slate-500 dark:text-gray-400 uppercase font-bold text-[9px]">
                {COLUMNAS_ITEMS.map((col) => (
                  <ThRedimensionable
                    key={col.key}
                    col={col}
                    anchos={anchos}
                    onResize={handleResize}
                    className={`px-2.5 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 ${col.extra || ''}`}
                  >
                    {col.label}
                  </ThRedimensionable>
                ))}
                <ThRelleno className="border-b border-slate-200 dark:border-gray-700" />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={COLSPAN_ITEMS} className="px-3 py-4 text-center text-slate-400 dark:text-gray-500">
                    Sin ítems registrados para esta admisión
                  </td>
                </tr>
              ) : (
                (() => {
                  const deliveriesMostrados = new Set();
                  return items.map((it) => {
                    const estadoKey = (it.estado || 'INGRESADO').toUpperCase();
                    const estaSolicitado = estadoKey === 'SOLICITADO';
                    const desbloqueado = desbloqueados.has(it.id);
                    const candadoBloqueado = estaSolicitado && !desbloqueado;
                    const estadoCargaValor = ESTADO_CARGA_OPTIONS.includes(estadoKey)
                      ? estadoKey
                      : (estaSolicitado ? 'CARGADO' : 'PENDIENTE');
                    const total = (Number(it.costo) || 0) * (Number(it.cantidad) || 1);
                    const deliveryValor = (it.delivery || '').trim();
                    const mostrarDesglose = Boolean(deliveryValor) && !deliveriesMostrados.has(deliveryValor);
                    if (mostrarDesglose) deliveriesMostrados.add(deliveryValor);
                    const pendiente = pendientes[it.id]?.payload;
                    const actualizandoEstado = actualizandoEstadoId === it.id;
                    const enEdicion = editandoId === it.id;
                    const guardandoEsteItem = guardandoEdicionId === it.id;
                    const verificandoEsteCandado = verificandoCandadoId === it.id;

                    if (enEdicion) {
                      return (
                        <tr key={it.id} className="bg-blue-50/60 dark:bg-blue-950/20">
                          <td className="px-2 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 font-num text-[9px] truncate">
                            {borradorItem.codigo || <span className="text-red-500 font-bold">S/C</span>}
                          </td>
                          <td className="px-2 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 relative truncate" ref={containerRefEdicion}>
                            <input
                              type="text"
                              value={borradorItem.referencia}
                              onChange={e => handleReferenciaEdicionChange(e.target.value)}
                              onFocus={() => sugerenciasEdicion.length > 0 && setMostrarSugEdicion(true)}
                              autoComplete="off"
                              autoFocus
                              className="w-full h-6.5 px-1.5 text-[10px] border border-blue-300 dark:border-blue-700 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 outline-none"
                            />
                            {mostrarSugEdicion && (
                              <DropdownReferenciaPortal anchorRef={containerRefEdicion} portalRef={portalRefEdicion}>
                                <div className="w-56 max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded shadow-lg">
                                  {buscandoEdicion ? (
                                    <div className="px-2.5 py-2 text-[10px] text-slate-400 flex items-center gap-1.5">
                                      <Loader2 size={11} className="animate-spin" /> Buscando...
                                    </div>
                                  ) : sugerenciasEdicion.length === 0 ? (
                                    <div className="px-2.5 py-2 text-[10px] text-slate-400">Sin coincidencias</div>
                                  ) : (
                                    sugerenciasEdicion.map(sug => (
                                      <button
                                        key={sug.id}
                                        type="button"
                                        onClick={() => handleSeleccionarSugerenciaEdicion(sug)}
                                        className="w-full text-left px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-gray-700/60 border-b border-slate-100 dark:border-gray-700/50 last:border-b-0"
                                      >
                                        <div className="text-[10px] font-semibold text-slate-700 dark:text-gray-200 truncate">{sug.referencia}</div>
                                        <div className="text-[9px] text-slate-400 dark:text-gray-500 flex items-center gap-1.5">
                                          <span className="font-num text-emerald-600 dark:text-emerald-400">{sug.codigo || 'S/C'}</span>
                                          <span>·</span>
                                          <span className="truncate">{sug.empresa}</span>
                                        </div>
                                      </button>
                                    ))
                                  )}
                                </div>
                              </DropdownReferenciaPortal>
                            )}
                          </td>
                          <td className="px-2 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-[9px] text-slate-500 dark:text-gray-400 truncate" title={borradorItem.descripcion}>
                            {borradorItem.descripcion || '-'}
                          </td>
                          <td className="px-2 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-[9px] text-slate-600 dark:text-gray-300 truncate" title={renderP(borradorItem.empresa)}>
                            {renderP(borradorItem.empresa)}
                          </td>
                          <td className="px-2 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-center truncate">
                            <input
                              type="number"
                              value={borradorItem.cantidad}
                              onChange={e => setBorradorItem(prev => ({ ...prev, cantidad: e.target.value }))}
                              className="w-14 h-6.5 px-1 text-[10px] border border-blue-300 dark:border-blue-700 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 outline-none text-center"
                            />
                          </td>
                          {/* Precio editable (solo esta carga; el maestro no se toca). */}
                          <td className="px-2 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={borradorItem.costo}
                              onChange={e => setBorradorItem(prev => ({ ...prev, costo: e.target.value }))}
                              aria-label="Precio"
                              aria-invalid={Boolean(errorPrecio(borradorItem.costo))}
                              title={errorPrecio(borradorItem.costo) || 'Precio de esta carga (no modifica el maestro)'}
                              className={`w-20 h-6.5 px-1 text-[10px] border rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 outline-none text-right ${errorPrecio(borradorItem.costo) ? 'border-red-400 dark:border-red-600' : 'border-blue-300 dark:border-blue-700'}`}
                            />
                            {borradorItem.costoMaestro !== '' && precioANumero(borradorItem.costo) !== Number(borradorItem.costoMaestro) && (
                              <div className="text-[8px] text-violet-600 dark:text-violet-400 mt-0.5 whitespace-nowrap">
                                Maestro: ${Number(borradorItem.costoMaestro).toLocaleString('es-CL')}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 truncate">
                            <input
                              type="text"
                              value={borradorItem.lote}
                              onChange={e => setBorradorItem(prev => ({ ...prev, lote: e.target.value }))}
                              placeholder="Sin lote"
                              className="w-20 h-6.5 px-1 text-[10px] border border-blue-300 dark:border-blue-700 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 outline-none"
                            />
                          </td>
                          <td className="px-2 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 truncate">
                            <input
                              type="date"
                              value={borradorItem.vencimiento}
                              onChange={e => setBorradorItem(prev => ({ ...prev, vencimiento: e.target.value }))}
                              className="h-6.5 px-1 text-[10px] border border-blue-300 dark:border-blue-700 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 outline-none"
                            />
                          </td>
                          {/* Total y venta en vivo con el precio y la cantidad del borrador. */}
                          <td className="px-2 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-[9px] whitespace-nowrap">
                            {(() => {
                              const costoBorrador = precioANumero(borradorItem.costo);
                              if (!Number.isFinite(costoBorrador) || costoBorrador <= 0) return <span className="text-slate-400 dark:text-gray-500">—</span>;
                              const v = calcularVenta({ costo: costoBorrador, cantidad: borradorItem.cantidad });
                              return (
                                <>
                                  <div className="text-emerald-700 dark:text-emerald-400 font-semibold">${Math.round(v.total).toLocaleString('es-CL')}</div>
                                  <div className="text-slate-500 dark:text-gray-400" title="Venta = precio × veces costo × cantidad">
                                    {v.venta != null
                                      ? <>Venta ${v.venta.toLocaleString('es-CL')} · {v.vecesCosto} x</>
                                      : <span className="text-amber-600 dark:text-amber-400 italic">Sin regla de recargo</span>}
                                  </div>
                                </>
                              );
                            })()}
                          </td>
                          <td className="px-2 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-[9px] text-slate-600 dark:text-gray-300 truncate" title={it.delivery || '-'}>
                            {it.delivery || '-'}
                          </td>
                          <td className="px-2 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-[9px] text-slate-600 dark:text-gray-300 truncate">
                            <NumeroGuiaCell it={it} pendiente={pendiente} />
                          </td>
                          <td className="px-2 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-[9px] text-slate-600 dark:text-gray-300 truncate" title={it.atributo || '-'}>
                            {it.atributo || '-'}
                          </td>
                          <td className="px-2 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 whitespace-nowrap">
                            <select
                              value={estadoCargaValor}
                              disabled={actualizandoEstado}
                              onChange={(e) => handleActualizarEstadoCarga(it, e.target.value)}
                              className={`h-6 px-1.5 text-[9px] font-bold rounded border outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${ESTADO_CARGA_SELECT_STYLE[estadoCargaValor]}`}
                            >
                              {ESTADO_CARGA_OPTIONS.map(op => (
                                <option key={op} value={op}>{op}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1.5 border-b border-slate-100 dark:border-gray-700/60 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleActualizarDesdeMaestro(it)}
                                disabled={guardandoEsteItem || actualizandoMaestroId === it.id}
                                title="Actualizar desde maestro (descripción, código, empresa y precio)"
                                className="text-blue-600 hover:text-blue-800 transition p-0.5 rounded hover:bg-blue-50 dark:hover:bg-blue-950/30 disabled:opacity-40"
                              >
                                <RefreshCw size={13} className={actualizandoMaestroId === it.id ? 'animate-spin' : ''} />
                              </button>
                              <button
                                type="button"
                                onClick={() => guardarEdicionItem(it)}
                                disabled={guardandoEsteItem}
                                title="Guardar cambios"
                                className="text-emerald-600 hover:text-emerald-800 transition p-0.5 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-40"
                              >
                                {guardandoEsteItem ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                              </button>
                              <button
                                type="button"
                                onClick={cancelarEdicionItem}
                                disabled={guardandoEsteItem}
                                title="Cancelar edición"
                                className="text-slate-400 hover:text-slate-600 transition p-0.5 rounded hover:bg-slate-100 dark:hover:bg-gray-700 disabled:opacity-40"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          </td>
                          <TdRelleno className="border-b border-slate-100 dark:border-gray-700/60" />
                        </tr>
                      );
                    }

                    return (
                      <React.Fragment key={it.id}>
                        <tr className="border-l-2 border-transparent hover:border-[#2383C2] hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors">
                          <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 font-num text-emerald-600 dark:text-emerald-400 truncate" title={it.codigo || 'S/C'}>
                            {it.codigo || 'S/C'}
                          </td>
                          <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 font-medium text-slate-700 dark:text-gray-200 truncate" title={it.referencia}>
                            {it.referencia || '-'}
                          </td>
                          <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-500 dark:text-gray-400 truncate" title={it.descripcion}>
                            {it.descripcion || '-'}
                          </td>
                          <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-600 dark:text-gray-300 truncate" title={renderP(it.empresa)}>
                            {renderP(it.empresa)}
                          </td>
                          <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-center text-slate-700 dark:text-gray-200 font-semibold truncate" title={it.cantidad ?? 0}>
                            {it.cantidad ?? 0}
                          </td>
                          <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-emerald-700 dark:text-emerald-400 truncate" title={it.costo ? `$${Number(it.costo).toLocaleString('es-CL')}` : '-'}>
                            {it.costo ? `$${Number(it.costo).toLocaleString('es-CL')}` : '-'}
                            {esPrecioEspecial(it) && <BadgePrecioEspecial costoMaestro={it.costoMaestro} />}
                          </td>
                          <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-600 dark:text-gray-300 truncate" title={it.lote || (deliveryValor ? 'PAD' : 'Sin lote')}>
                            {it.lote || (deliveryValor ? 'PAD' : 'Sin lote')}
                          </td>
                          <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-600 dark:text-gray-300 truncate" title={it.vencimiento ? formatearFechaTabla(it.vencimiento) : (deliveryValor ? 'PAD' : 'Sin fecha')}>
                            {it.vencimiento
                              ? formatearFechaTabla(it.vencimiento)
                              : (deliveryValor ? 'PAD' : 'Sin fecha')}
                          </td>
                          <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-emerald-700 dark:text-emerald-400 font-semibold truncate" title={total ? `$${Math.round(total).toLocaleString('es-CL')}` : '-'}>
                            {total ? `$${Math.round(total).toLocaleString('es-CL')}` : '-'}
                          </td>
                          <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-600 dark:text-gray-300 truncate" title={it.delivery || '-'}>
                            {it.delivery || '-'}
                          </td>
                          <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-600 dark:text-gray-300 truncate">
                            <NumeroGuiaCell it={it} pendiente={pendiente} />
                          </td>
                          <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-600 dark:text-gray-300 truncate" title={it.atributo || '-'}>
                            {it.atributo || '-'}
                          </td>
                          <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 whitespace-nowrap">
                            {candadoBloqueado ? (
                              <span
                                title="Bloqueado: ya fue solicitado/imputado"
                                className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border bg-slate-100 dark:bg-gray-800 border-slate-300 dark:border-gray-700 text-slate-500 dark:text-gray-400"
                              >
                                <Lock size={9} /> SOLICITADO
                              </span>
                            ) : (
                              <select
                                value={estadoCargaValor}
                                disabled={actualizandoEstado}
                                onChange={(e) => handleActualizarEstadoCarga(it, e.target.value)}
                                className={`h-6 px-1.5 text-[9px] font-bold rounded border outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${ESTADO_CARGA_SELECT_STYLE[estadoCargaValor]}`}
                              >
                                {ESTADO_CARGA_OPTIONS.map(op => (
                                  <option key={op} value={op}>{op}</option>
                                ))}
                              </select>
                            )}
                            {/* Editado después de solicitar: se descarga en "Solicitudes de modificaciones". */}
                            {it.modificacionPendiente && (
                              <span
                                title="Modificación pendiente: cambios después de solicitar, aún no descargados en Solicitudes de modificaciones"
                                className="ml-1 text-[9px] px-1.5 py-0.5 rounded-full uppercase bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                              >
                                Modif. pendiente
                              </span>
                            )}
                          </td>
                          <td className="px-2.5 py-1.5 border-b border-slate-100 dark:border-gray-700/60 text-center whitespace-nowrap">
                            {candadoBloqueado ? (
                              puedeDesbloquearCandado ? (
                                <button
                                  type="button"
                                  onClick={() => handleAbrirCandadoItem(it)}
                                  disabled={verificandoEsteCandado}
                                  title="Este ítem ya está imputado — click para desbloquear edición"
                                  className="text-amber-600 hover:text-amber-800 transition p-0.5 rounded hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-40"
                                >
                                  {verificandoEsteCandado ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />}
                                </button>
                              ) : (
                                <span title="Bloqueado: ya fue solicitado/imputado. No tenés permiso para desbloquear." className="inline-flex text-slate-300 dark:text-gray-600">
                                  <Lock size={12} />
                                </span>
                              )
                            ) : (
                              <button
                                type="button"
                                onClick={() => iniciarEdicionItem(it)}
                                title={estaSolicitado ? 'Desbloqueado — editá y guardá para volver a bloquearlo' : 'Editar ítem'}
                                className="text-blue-600 hover:text-blue-800 transition p-0.5 rounded hover:bg-blue-50 dark:hover:bg-blue-950/30"
                              >
                                {estaSolicitado ? <Unlock size={12} className="text-emerald-600" /> : <Pencil size={12} />}
                              </button>
                            )}
                          </td>
                          <TdRelleno className="border-b border-slate-100 dark:border-gray-700/60" />
                        </tr>

                        {mostrarDesglose && (
                          <DesgloseGuia
                            deliveryValor={deliveryValor}
                            referenciaDestacada={it.referencia}
                            colSpanTotal={COLSPAN_ITEMS}
                            productosGuardados={it.productosGuiaVinculados}
                            productosPendientes={pendiente?.productosGuiaVinculados}
                          />
                        )}
                      </React.Fragment>
                    );
                  });
                })()
              )}
            </tbody>
            {items.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 dark:bg-gray-900/60 font-bold">
                  <td colSpan={8} className="px-2.5 py-1.5 border-t border-r border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-300 text-right whitespace-nowrap">
                    Total de la admisión:
                  </td>
                  <td className="px-2.5 py-1.5 border-t border-r border-slate-200 dark:border-gray-700 text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                    ${Math.round(sumaCostos).toLocaleString('es-CL')}
                  </td>
                  <td colSpan={6} className="border-t border-slate-200 dark:border-gray-700"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

    </div>
  );
};

export default CargasTab;