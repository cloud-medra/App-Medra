// Lógica de carga de candidatos a "Solicitud" de Consignación, compartida
// entre la pantalla nativa (SolicitudConsignacion.jsx) y la pestaña
// "Solicitudes" de Administración → Cargas Consolidado
// (useSolicitudesUnificadasData.js). Antes vivía solo dentro del hook de la
// pantalla nativa — Cargas Consolidado hacía su propia consulta simplificada
// (solo `where('estado','==','CARGADO')`, sin el desglose de guía por
// delivery) y por eso mostraba menos filas que la pantalla nativa para el
// mismo período: a cualquier ítem con una guía de despacho vinculada le
// faltaban sus filas de desglose (productos de la guía).
import { collectionGroup, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../../../../../firebaseConfig';
import { codigosPorReferenciaSiDisponible } from '../../../../../../stores/catalogosStore';
import { descripcionDesdeMaestro } from '../../utils/registroConsignacionService';
import { estaExcluidoDeGuia } from '../../utils/exclusionKitsGuia';
import { ordenarRegistrosCargas } from '../../cargasConsignacion/utils/ordenarRegistrosCargas';

const NOMBRE_SUBCOL_DETALLES = 'detalles';
const ESTADO_ORIGEN = 'CARGADO';
const COL_MAESTROS_CODIGOS = 'maestros_codigos';

const trocear = (arr, tamano) => {
  const bloques = [];
  for (let i = 0; i < arr.length; i += tamano) {
    bloques.push(arr.slice(i, i + tamano));
  }
  return bloques;
};

// Caches a nivel de módulo (no por instancia de hook) — así la pantalla
// nativa y la de Cargas Consolidado comparten el mismo caché de guías y
// maestros en vez de resolverlos por separado si ambas se usan en la misma
// sesión.
const cacheGuiasPorDelivery = new Map();
const cacheMaestrosPorCodigo = new Map();

const resolverGuiaCacheada = async (deliveryValor, forzar) => {
  if (!forzar && cacheGuiasPorDelivery.has(deliveryValor)) {
    return cacheGuiasPorDelivery.get(deliveryValor);
  }
  try {
    const qGuia = query(
      collectionGroup(db, NOMBRE_SUBCOL_DETALLES),
      where('numeroDocumento', '==', deliveryValor)
    );
    const snapGuia = await getDocs(qGuia);
    if (snapGuia.empty) {
      cacheGuiasPorDelivery.set(deliveryValor, null);
      return null;
    }
    const numeroGuia = snapGuia.docs[0]?.data()?.numeroGuia || null;
    const productos = snapGuia.docs.map(d => d.data()).filter(p => !estaExcluidoDeGuia(p.codigo));
    const resultado = { numeroGuia, productos };
    cacheGuiasPorDelivery.set(deliveryValor, resultado);
    return resultado;
  } catch (err) {
    console.error(`Error al resolver la guía ${deliveryValor}:`, err);
    return null;
  }
};

const resolverMaestrosCacheados = async (referencias, forzar) => {
  const unicas = [...new Set(referencias.map(r => (r || '').trim()).filter(Boolean))];

  // Si maestros_codigos ya está en el catalogosStore en esta sesión, se
  // resuelve en memoria (y al día) sin consultas por referencia.
  const enMemoria = await codigosPorReferenciaSiDisponible(unicas);
  if (enMemoria) {
    const resultado = {};
    unicas.forEach(r => {
      const data = enMemoria.get(r);
      resultado[r] = data
        ? { descripcion: descripcionDesdeMaestro(data), tipo: data.tipo || '', empresa: data.empresa || '' }
        : null;
    });
    return resultado;
  }

  const pendientes = forzar ? unicas : unicas.filter(r => !cacheMaestrosPorCodigo.has(r));

  if (pendientes.length > 0) {
    const bloques = trocear(pendientes, 10);
    for (const bloque of bloques) {
      try {
        const qMaestro = query(collection(db, COL_MAESTROS_CODIGOS), where('referencia', 'in', bloque));
        const snapMaestro = await getDocs(qMaestro);
        const encontrados = new Set();
        snapMaestro.docs.forEach(d => {
          const data = d.data();
          if (data.referencia) {
            cacheMaestrosPorCodigo.set(data.referencia, {
              descripcion: descripcionDesdeMaestro(data),
              tipo: data.tipo || '',
              empresa: data.empresa || ''
            });
            encontrados.add(data.referencia);
          }
        });
        bloque.forEach(r => {
          if (!encontrados.has(r)) cacheMaestrosPorCodigo.set(r, cacheMaestrosPorCodigo.get(r) ?? null);
        });
      } catch (err) {
        console.error('Error al resolver bloque de maestros_codigos:', bloque, err);
      }
    }
  }

  const resultado = {};
  unicas.forEach(r => { resultado[r] = cacheMaestrosPorCodigo.get(r) ?? null; });
  return resultado;
};

// Lo que se guarda de cada fila "No lleva OC" en consignacion_imputadas
// (campo filasGuia del doc de la fila principal). Exportada para Resumen.
export const filaGuiaParaImputar = (f) => ({
  codigoGuia: f.codigoGuia || '',
  descripcion: f.descripcion || '-',
  empresa: f.empresa || '-',
  atributo: f.atributo || '-',
  cantidad: f.cantidad ?? 0,
  lote: f.lote || 'N/A',
  vencimiento: f.vencimiento || 'N/A',
  numeroGuia: f.numeroGuia || 0
});

// Consulta de candidatos (ítems con estado 'CARGADO'). Exportada aparte
// para que Cargas Consolidado pueda escucharla en vivo con onSnapshot
// (igual que Implantes/Hemodinamia allí), mientras la pantalla nativa
// sigue usando la lectura puntual de cargarCandidatosSolicitudConsignacion.
export const consultaCandidatosSolicitudConsignacion = () => query(
  collectionGroup(db, NOMBRE_SUBCOL_DETALLES),
  where('estado', '==', ESTADO_ORIGEN),
  orderBy('fechaRegistro', 'desc')
);

// Trae TODOS los ítems de Consignación con estado 'CARGADO' (candidatos a
// solicitar) más, para cada uno con un delivery vinculado a una guía, las
// filas de desglose de esa guía (productos, sin costo propio — informativas,
// no tienen documento propio en Firestore y no se marcan como SOLICITADO).
export const cargarCandidatosSolicitudConsignacion = async (forzarRelecturaGuias = false, opciones = {}) => {
  const snapshot = await getDocs(consultaCandidatosSolicitudConsignacion());
  return construirCandidatosSolicitudConsignacion(snapshot.docs, forzarRelecturaGuias, opciones);
};

// Ítems en el mismo orden que Cargas (ordenarRegistrosCargas: por carga, con
// cada admisión junta y en el orden de la carga masiva), con los datos
// originales del documento (gestionId sin el "P" de relleno, posicionCarga).
const ordenarItemsPorCarga = (items) => {
  const porRuta = new Map(items.map((it) => [it.refPath, it]));
  return ordenarRegistrosCargas(items.map((it) => ({ ...it.datosOriginales, id: it.refPath })))
    .map((r) => porRuta.get(r.id));
};

// Arma las filas (ítems + desglose de guía) a partir de los docs que
// devolvió consultaCandidatosSolicitudConsignacion, vengan de getDocs o de
// un snapshot en vivo. `opciones.ordenCarga`: ordena los ítems como Cargas
// (las filas de desglose de guía siguen debajo de su ítem); sin ella quedan
// en el orden de la consulta.
export const construirCandidatosSolicitudConsignacion = async (docs, forzarRelecturaGuias = false, { ordenCarga = false } = {}) => {
  const docsConsignacion = docs.filter(d => d.ref.path.startsWith('consignacion_registros/'));

  const itemsSinOrden = docsConsignacion.map((document) => {
    const data = document.data();
    const costo = Number(data.costo) || 0;
    const cantidad = Number(data.cantidad) || 0;
    const vecesCosto = data.recargoVecesCosto != null ? Number(data.recargoVecesCosto) : 1;
    const deliveryValor = (data.delivery || '').trim();
    const tieneVinculo = Boolean(data.deliveryVinculado);

    return {
      id: document.id,
      ref: document.ref,
      refPath: document.ref.path,
      datosOriginales: data,
      gestionId: data.gestionId || 'P',
      nombre: data.nombre || 'P',
      medico: data.medico || 'P',
      fecha: data.fecha || '',
      empresa: data.empresa || 'P',
      codigo: data.codigo || 'S/C',
      descripcion: data.descripcion || 'P',
      cantidad,
      costo,
      ventaUnitaria: costo * vecesCosto,
      costoTotal: costo * cantidad,
      atributo: data.atributo || 'P',
      fechaRegistro: data.fechaRegistro || null,
      delivery: deliveryValor,
      numeroGuiaVinculada: data.numeroGuiaVinculada || null,
      lote: tieneVinculo && data.loteGuiaVinculado
        ? data.loteGuiaVinculado
        : (deliveryValor ? 'PAD' : 'Sin lote'),
      vencimiento: tieneVinculo && data.vencimientoGuiaVinculado
        ? data.vencimientoGuiaVinculado
        : (deliveryValor ? 'PAD' : 'Sin fecha')
    };
  });
  const itemsCargados = ordenCarga ? ordenarItemsPorCarga(itemsSinOrden) : itemsSinOrden;

  try {
    const deliveriesUnicos = [...new Set(itemsCargados.map(it => it.delivery).filter(Boolean))];

    const filasGuiaPorDelivery = {};
    const numeroGuiaPorDelivery = {};

    await Promise.all(deliveriesUnicos.map(async (deliveryValor) => {
      const guia = await resolverGuiaCacheada(deliveryValor, forzarRelecturaGuias);
      if (!guia || guia.productos.length === 0) return;

      numeroGuiaPorDelivery[deliveryValor] = guia.numeroGuia;

      const referenciasUnicas = guia.productos.map(p => (p.codigo || '').trim()).filter(Boolean);
      const vinculosCodigos = await resolverMaestrosCacheados(referenciasUnicas, forzarRelecturaGuias);

      const itemRelacionado = itemsCargados.find(it => it.delivery === deliveryValor) || null;

      filasGuiaPorDelivery[deliveryValor] = guia.productos.map((p, idx) => {
        const vinculo = vinculosCodigos[(p.codigo || '').trim()];
        return {
          id: `guia-${deliveryValor}-${idx}`,
          ref: null,
          esFilaGuia: true,
          gestionId: itemRelacionado?.gestionId || '-',
          nombre: itemRelacionado?.nombre || '-',
          medico: itemRelacionado?.medico || '-',
          fecha: itemRelacionado?.fecha || '',
          empresa: vinculo?.empresa || '-',
          codigo: 'No lleva OC',
          descripcion: vinculo?.descripcion || '-',
          cantidad: p.cantidad ?? 0,
          costo: 0,
          ventaUnitaria: 0,
          costoTotal: 0,
          atributo: vinculo?.tipo || '-',
          fechaRegistro: itemRelacionado?.fechaRegistro || null,
          lote: p.lote || 'N/A',
          vencimiento: p.vencimiento || 'N/A',
          codigoGuia: p.codigo || '',
          // N° de guía del propio producto (un mismo delivery puede venir en
          // más de una guía).
          numeroGuia: p.numeroGuia || 0
        };
      });
    }));

    // La fila principal muestra N° de guía 0: el número va en sus filas
    // "No lleva OC". Al solicitar, esas filas se guardan dentro del doc de
    // consignacion_imputadas (filasGuia) para que Resumen las muestre igual.
    // numeroGuiaParaImputar es lo que se guarda como numeroGuia del doc: 0 si
    // el número quedó en filasGuia; si no hay filas de guía, se conserva el
    // número de la guía para no perder el dato.
    const itemsConNumeroGuia = itemsCargados.map(it => {
      const filasGuia = (filasGuiaPorDelivery[it.delivery] || []).map(filaGuiaParaImputar);
      return {
        ...it,
        numeroGuia: 0,
        filasGuia,
        numeroGuiaParaImputar: filasGuia.length > 0
          ? 0
          : (it.numeroGuiaVinculada || numeroGuiaPorDelivery[it.delivery] || 0)
      };
    });

    const deliveriesYaInsertados = new Set();
    const listaFinal = [];

    itemsConNumeroGuia.forEach(it => {
      listaFinal.push(it);
      if (it.delivery && !deliveriesYaInsertados.has(it.delivery) && filasGuiaPorDelivery[it.delivery]) {
        deliveriesYaInsertados.add(it.delivery);
        listaFinal.push(...filasGuiaPorDelivery[it.delivery]);
      }
    });

    return listaFinal;
  } catch (err) {
    console.error('Error al construir filas de guías de Delivery:', err);
    return itemsCargados;
  }
};
