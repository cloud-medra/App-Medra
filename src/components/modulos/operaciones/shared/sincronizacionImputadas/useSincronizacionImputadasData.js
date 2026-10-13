import { useState } from 'react';
import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  documentId,
  writeBatch
} from 'firebase/firestore';
import { db } from '../../../../../firebaseConfig';
import { useToast } from '../../../../../context/ToastContext';
import { useUser } from '../../../../../context/UserContext';
import { construirPayloadImputada } from '../../implantes/gestionImplantes/utils/imputadaSync';
import { registrarLogImplantes as registrarLogGestion } from '../../implantes/gestionImplantes/utils/registrarLogImplantes';
import { diffBloque } from './utils/diffAdmision';
import { moduloGestion, rangoGestiones } from '../modulosGestion';
import { periodoEstaAbierto, obtenerPeriodoAbiertoModulo } from '../periodosModulo';

// Sincronización de imputadas de un módulo de Gestión (Implantes,
// Hemodinamia): compara {módulo}_gestiones (fuente correcta) con
// {módulo}_imputadas y corrige un bloque puntual. `construirPayloadImputada`
// y el log son los mismos en ambos módulos (solo cambia la colección).
//
// Consultas acotadas con el mismo rango sobre documentId() que el listener
// principal de Gestión (rangoGestiones) — evita depender de un índice de
// collectionGroup sobre "gestionId". Es una consulta puntual (getDocs, no
// onSnapshot), disparada solo al buscar, no en cada render.

const normalizarAdmision = (valor) => (valor ?? '').toString().trim();

/**
 * Agrupa los ítems de un bloque por período resuelto (propio, o el período
 * abierto actual como fallback para ítems legacy sin periodoAnio/periodoMes
 * — mismo criterio que usa guardarDesdeDetalle al re-sincronizar).
 */
const agruparItemsPorPeriodo = async (modulo, itemsGestion) => {
  let fallback;
  let fallbackCargado = false;
  const obtenerFallback = async () => {
    if (!fallbackCargado) {
      fallback = await obtenerPeriodoAbiertoModulo(modulo);
      fallbackCargado = true;
    }
    return fallback;
  };

  const grupos = new Map();

  for (const it of itemsGestion) {
    let anio = it.periodoAnio;
    let mes = it.periodoMes;
    let sinPeriodoResoluble = false;

    if (!anio || !mes) {
      const fb = await obtenerFallback();
      if (!fb) {
        sinPeriodoResoluble = true;
      } else {
        anio = fb.anio;
        mes = fb.mes;
      }
    }

    const clave = sinPeriodoResoluble ? '__SIN_PERIODO__' : `${anio}__${mes}`;
    if (!grupos.has(clave)) {
      grupos.set(clave, { anio: sinPeriodoResoluble ? null : anio, mes: sinPeriodoResoluble ? null : mes, sinPeriodoResoluble, items: [] });
    }
    grupos.get(clave).items.push(it);
  }

  return [...grupos.values()];
};

const compararBloque = async (config, bloque, admisionStr) => {
  const itemsGestion = bloque.cotizaciones?.[0]?.items || [];
  const dataGestion = {
    gestionId: bloque.gestionId || bloque.agendaId || admisionStr,
    agendaId: bloque.agendaId || bloque.gestionId || admisionStr,
    admision: bloque.admision || admisionStr,
    nombre: bloque.nombre || 'P',
    fecha: bloque.fecha || 'P',
    empresa: bloque.empresa || 'P',
    informe: bloque.informe || 'PENDIENTE',
    convenio: bloque.convenio || 'P',
    prevision: bloque.prevision || 'P',
    medico: bloque.medico || 'P',
    descripcion: bloque.descripcion || 'P',
    centro: config.centroDe(bloque),
    atributo: bloque.atributo || config.atributoPorDefecto,
    estado: bloque.estado || 'AGENDADO',
    costo: bloque.costo || 0
  };

  const base = {
    refPath: bloque.refPath,
    empresa: bloque.empresa || 'P',
    fecha: bloque.fecha || 'P',
    solicitud: bloque.solicitud || 'PENDIENTE',
    dataGestion
  };

  if (itemsGestion.length === 0) {
    return { ...base, gruposPeriodo: [], sinItems: true, sinDiferencias: true };
  }

  const gruposItems = await agruparItemsPorPeriodo(config.clave, itemsGestion);

  const gruposPeriodo = await Promise.all(gruposItems.map(async (grupo) => {
    if (grupo.sinPeriodoResoluble) {
      const { itemsComparados, itemsSobrantesEnImputadas } = diffBloque(grupo.items, {});
      return { anio: null, mes: null, sinPeriodoResoluble: true, periodoAbierto: null, itemsComparados, itemsSobrantesEnImputadas, sinDiferencias: false };
    }

    const [periodoAbierto, snapImp] = await Promise.all([
      periodoEstaAbierto(config.clave, grupo.anio, grupo.mes),
      getDocs(query(
        collection(db, config.coleccionImputadas, String(grupo.anio), 'meses', grupo.mes, 'documentos'),
        where('gestionId', '==', admisionStr),
        where('empresa', '==', dataGestion.empresa)
      ))
    ]);

    const itemsImputadaPorId = {};
    snapImp.docs.forEach(d => { itemsImputadaPorId[d.id] = { id: d.id, ...d.data() }; });

    const { itemsComparados, itemsSobrantesEnImputadas, sinDiferencias } = diffBloque(grupo.items, itemsImputadaPorId);

    return { anio: grupo.anio, mes: grupo.mes, sinPeriodoResoluble: false, periodoAbierto, itemsComparados, itemsSobrantesEnImputadas, sinDiferencias };
  }));

  const sinDiferencias = gruposPeriodo.every(g => g.sinDiferencias);

  return { ...base, gruposPeriodo, sinItems: false, sinDiferencias };
};

export const useSincronizacionImputadasData = (modulo) => {
  const config = moduloGestion(modulo);
  const { min: RANGO_MIN_GESTIONES, max: RANGO_MAX_GESTIONES } = rangoGestiones(config);
  const refImputada = (anio, mes, itemId) => doc(db, config.coleccionImputadas, String(anio), 'meses', mes, 'documentos', itemId);
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [aplicando, setAplicando] = useState({});
  const { showToast } = useToast();
  const { userData } = useUser();

  const buscarAdmisiones = async (listaAdmisiones) => {
    const admisionesNormalizadas = [...new Set(listaAdmisiones.map(normalizarAdmision).filter(Boolean))];
    if (admisionesNormalizadas.length === 0) {
      showToast('Ingresá al menos un número de admisión', 'error');
      return;
    }

    setBuscando(true);
    try {
      const qGestiones = query(
        collectionGroup(db, 'detalles'),
        where(documentId(), '>=', RANGO_MIN_GESTIONES),
        where(documentId(), '<', RANGO_MAX_GESTIONES),
        orderBy(documentId())
      );
      const snapGestiones = await getDocs(qGestiones);
      const todosLosBloques = snapGestiones.docs.map(d => ({ refPath: d.ref.path, ...d.data() }));

      const nuevosResultados = await Promise.all(admisionesNormalizadas.map(async (admisionStr) => {
        const bloquesAdmision = todosLosBloques.filter(b => normalizarAdmision(b.gestionId || b.agendaId) === admisionStr);

        if (bloquesAdmision.length === 0) {
          return { admision: admisionStr, error: `No se encontró esta admisión en ${config.coleccionGestiones}.`, bloques: [] };
        }

        const bloques = await Promise.all(bloquesAdmision.map(b => compararBloque(config, b, admisionStr)));
        return { admision: admisionStr, error: null, bloques };
      }));

      setResultados(nuevosResultados);
    } catch (error) {
      console.error('Error al buscar/comparar admisiones:', error);
      showToast('Error al buscar: ' + error.message, 'error');
    } finally {
      setBuscando(false);
    }
  };

  const rebuscarUnaAdmision = async (admisionStr) => {
    const parcial = await (async () => {
      const qGestiones = query(
        collectionGroup(db, 'detalles'),
        where(documentId(), '>=', RANGO_MIN_GESTIONES),
        where(documentId(), '<', RANGO_MAX_GESTIONES),
        orderBy(documentId())
      );
      const snapGestiones = await getDocs(qGestiones);
      const bloquesAdmision = snapGestiones.docs
        .map(d => ({ refPath: d.ref.path, ...d.data() }))
        .filter(b => normalizarAdmision(b.gestionId || b.agendaId) === admisionStr);

      if (bloquesAdmision.length === 0) {
        return { admision: admisionStr, error: `No se encontró esta admisión en ${config.coleccionGestiones}.`, bloques: [] };
      }
      const bloques = await Promise.all(bloquesAdmision.map(b => compararBloque(config, b, admisionStr)));
      return { admision: admisionStr, error: null, bloques };
    })();

    setResultados(prev => prev.map(r => (r.admision === admisionStr ? parcial : r)));
  };

  const aplicarCorreccion = async (admisionStr, bloqueResultado) => {
    if ((bloqueResultado.solicitud || '').toUpperCase() !== 'SOLICITADO') {
      showToast('Este bloque no está SOLICITADO todavía — no corresponde sincronizar imputadas.', 'error');
      return;
    }

    for (const grupo of bloqueResultado.gruposPeriodo) {
      if (grupo.sinPeriodoResoluble) {
        showToast('No se puede corregir: hay ítems sin período resoluble (ni período propio, ni período abierto actual).', 'error');
        return;
      }
    }

    // Re-verificar período abierto justo antes de escribir — pudo cerrarse
    // entre el momento del diff y el click en "Aplicar corrección".
    for (const grupo of bloqueResultado.gruposPeriodo) {
      const abiertoAhora = await periodoEstaAbierto(config.clave, grupo.anio, grupo.mes);
      if (!abiertoAhora) {
        showToast(`No se puede corregir: el período ${grupo.mes} ${grupo.anio} de este bloque ya está cerrado.`, 'error');
        return;
      }
    }

    setAplicando(prev => ({ ...prev, [bloqueResultado.refPath]: true }));
    try {
      const batch = writeBatch(db);
      const itemsActualizados = [];
      const itemsEliminadosDeImputadas = [];
      const camposCorregidos = [];

      for (const grupo of bloqueResultado.gruposPeriodo) {
        for (const comparado of grupo.itemsComparados) {
          if (comparado.estado === 'IGUAL') continue;
          const payload = construirPayloadImputada(
            comparado.itemGestion,
            bloqueResultado.dataGestion,
            grupo.anio,
            grupo.mes,
            userData?.nombreCompleto
          );
          batch.set(refImputada(grupo.anio, grupo.mes, comparado.itemId), payload, { merge: true });
          itemsActualizados.push(comparado.itemId);
          camposCorregidos.push({
            itemId: comparado.itemId,
            referencia: comparado.itemGestion?.referencia || '',
            campos: comparado.campos.filter(c => c.difiere).map(c => c.campo)
          });
        }
        for (const sobrante of grupo.itemsSobrantesEnImputadas) {
          batch.delete(refImputada(grupo.anio, grupo.mes, sobrante.id));
          itemsEliminadosDeImputadas.push(sobrante.id);
        }
      }

      if (itemsActualizados.length === 0 && itemsEliminadosDeImputadas.length === 0) {
        showToast('No hay diferencias para corregir en este bloque.', 'info');
        return;
      }

      await batch.commit();

      await registrarLogGestion(
        doc(db, bloqueResultado.refPath),
        'IMPUTACION_RESINCRONIZADA',
        {
          origen: 'herramienta_sincronizacion_manual',
          admision: admisionStr,
          empresa: bloqueResultado.empresa,
          fecha: bloqueResultado.fecha,
          itemsActualizados,
          itemsEliminadosDeImputadas,
          camposCorregidos
        },
        userData
      );

      showToast(
        `Corrección aplicada: ${itemsActualizados.length} ítem(s) sincronizado(s)` +
        (itemsEliminadosDeImputadas.length ? `, ${itemsEliminadosDeImputadas.length} sobrante(s) eliminado(s) de imputadas` : '') +
        '.',
        'success'
      );

      await rebuscarUnaAdmision(admisionStr);
    } catch (error) {
      console.error('Error al aplicar corrección:', error);
      showToast('Error al aplicar corrección: ' + error.message, 'error');
    } finally {
      setAplicando(prev => {
        const copia = { ...prev };
        delete copia[bloqueResultado.refPath];
        return copia;
      });
    }
  };

  return {
    resultados,
    buscando,
    aplicando,
    buscarAdmisiones,
    aplicarCorreccion
  };
};
