import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { COMPONENT_MAPS } from './index.js';
import {
  ACCIONES_DENEGADAS_POR_DEFECTO, accionDeVista, puedeAccion, valorDe, aplanar, claveElemento,
} from '../../../functions/permisos/nucleo.mjs';
import { completarPermisosGranulares, generarAccesoDesdeConfig } from '../../components/modulos/administracion/usuarios/permisosGranularesUtils';

// Acciones sensibles denegadas por defecto (functions/permisos/nucleo.mjs):
// sin configurar se niegan para no-admin; el resto sigue permitido.
const separar = (clave) => clave.split('|').slice(1); // [ruta, seccion, accion]
const LISTADO = '/administracion/listadoUsuario';
const DESBLOQUEAR = claveElemento(LISTADO, 'tabla_usuarios', 'btn_desbloquear');
// Vista del menú o pestaña (`procesos`) de una vista.
const configDe = (ruta) => COMPONENT_MAPS[ruta]
  || Object.values(COMPONENT_MAPS).map((c) => c.procesos?.[ruta]).find(Boolean);

describe('ACCIONES_DENEGADAS_POR_DEFECTO', () => {
  it('cada una existe en COMPONENT_MAPS (vista o pestaña, sección y acción)', () => {
    expect(ACCIONES_DENEGADAS_POR_DEFECTO).toContain(DESBLOQUEAR);
    ACCIONES_DENEGADAS_POR_DEFECTO.forEach((clave) => {
      const [ruta, seccion, accion] = separar(clave);
      expect(configDe(ruta)?.sections?.[seccion]?.elements?.[accion], clave).toBeTruthy();
    });
  });

  // Las reglas usan "sin configurar = permitida" (accionPermitida); una acción
  // denegada por defecto solo puede aparecer leída como true explícito
  // (`.get('accion', false) == true`, ej. anulaPerdidas de implantes_fibras).
  it('no se validan en reglas de Firestore/Storage salvo como true explícito', () => {
    const reglas = ['firestore.rules', 'storage.rules'].map((f) => fs.readFileSync(new URL(`../../../${f}`, import.meta.url), 'utf8')).join('\n');
    ACCIONES_DENEGADAS_POR_DEFECTO.forEach((clave) => {
      const [, , accion] = separar(clave);
      const usos = reglas.split(`'${accion}'`).length - 1;
      const explicitos = reglas.split(`.get('${accion}', false) == true`).length - 1;
      expect(usos - explicitos, `${accion} aparece en las reglas sin exigir true explícito: valídala en una Cloud Function`).toBe(0);
    });
  });

  it('sin configurar: denegada; marcada: permitida; las demás acciones, como antes', () => {
    const vista = { tabla_usuarios: { visible: true, elements: { btn_editar_acceso: true } } };
    expect(accionDeVista(vista, LISTADO, 'tabla_usuarios', 'btn_desbloquear')).toBe(false);
    expect(accionDeVista({}, LISTADO, 'tabla_usuarios', 'btn_desbloquear')).toBe(false); // sección sin configurar
    expect(accionDeVista(vista, LISTADO, 'tabla_usuarios', 'btn_activar_inactivar')).toBe(true);
    expect(accionDeVista({}, LISTADO, 'tabla_usuarios', 'btn_activar_inactivar')).toBe(true);
    const marcada = { tabla_usuarios: { visible: true, elements: { btn_desbloquear: true } } };
    expect(accionDeVista(marcada, LISTADO, 'tabla_usuarios', 'btn_desbloquear')).toBe(true);
    expect(accionDeVista({ tabla_usuarios: { visible: false, elements: { btn_desbloquear: true } } }, LISTADO, 'tabla_usuarios', 'btn_desbloquear')).toBe(false);
  });

  it('puedeAccion (Cloud Functions): igual (también el Administrador); Desarrollador siempre', () => {
    const operador = (vista) => ({ rol: 'operador', permisos: { administracion: [LISTADO] }, permisosGranulares: { [LISTADO]: vista } });
    expect(puedeAccion(operador({}), 'administracion', LISTADO, 'tabla_usuarios', 'btn_desbloquear')).toBe(false);
    expect(puedeAccion(operador({ tabla_usuarios: { visible: true, elements: { btn_desbloquear: true } } }), 'administracion', LISTADO, 'tabla_usuarios', 'btn_desbloquear')).toBe(true);
    expect(puedeAccion({ rol: 'admin' }, 'administracion', LISTADO, 'tabla_usuarios', 'btn_desbloquear')).toBe(false);
    expect(puedeAccion({ ...operador({}), rol: 'admin' }, 'administracion', LISTADO, 'tabla_usuarios', 'btn_desbloquear')).toBe(false);
    expect(puedeAccion({ rol: 'dev' }, 'administracion', LISTADO, 'tabla_usuarios', 'btn_desbloquear')).toBe(true);
    expect(puedeAccion({ rol: 'dev', activo: false }, 'administracion', LISTADO, 'tabla_usuarios', 'btn_desbloquear')).toBe(false);
  });

  it('plantillas y excepciones (valorDe): sin configurar vale false', () => {
    const plano = aplanar({ permisos: {}, permisosGranulares: { [LISTADO]: {} } });
    expect(valorDe(plano, DESBLOQUEAR)).toBe(false);
    expect(valorDe(plano, claveElemento(LISTADO, 'tabla_usuarios', 'btn_editar_acceso'))).toBe(true);
  });

  it('el editor la completa desmarcada; habilitar la vista o "marcar toda la vista" la marcan', () => {
    const completo = completarPermisosGranulares({ [LISTADO]: { tabla_usuarios: { visible: true, elements: {} } } }, COMPONENT_MAPS);
    expect(completo[LISTADO].tabla_usuarios.elements.btn_desbloquear).toBe(false);
    expect(completo[LISTADO].tabla_usuarios.elements.btn_editar_acceso).toBe(true);
    // Un valor ya guardado no se toca.
    expect(completarPermisosGranulares({ [LISTADO]: { tabla_usuarios: { visible: true, elements: { btn_desbloquear: true } } } }, COMPONENT_MAPS)[LISTADO].tabla_usuarios.elements.btn_desbloquear).toBe(true);
    expect(generarAccesoDesdeConfig(COMPONENT_MAPS[LISTADO], true).tabla_usuarios.elements.btn_desbloquear).toBe(true);
  });
});
