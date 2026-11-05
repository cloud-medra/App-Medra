// Tipo y empresa de un usuario en Crear usuario, Editar usuario y Listado.
// Lógica pura; la regla de negocio está en functions/permisos/nucleo.mjs.
import { empresaActiva } from '../../../../../functions/permisos/nucleo.mjs';

const porNombre = (a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');

// Opciones del selector: solo empresas activas; la ya asignada se mantiene a la
// vista aunque esté inactiva o eliminada, para no cambiarla sin querer.
export const opcionesEmpresa = (empresas, empresaId) => {
  const activas = (empresas || []).filter(empresaActiva).sort(porNombre).map((e) => ({ value: e.id, label: e.nombre }));
  const opciones = [{ value: '', label: 'Selecciona una empresa' }, ...activas];
  if (!empresaId || activas.some((o) => o.value === empresaId)) return opciones;
  const actual = datosEmpresa(empresas, empresaId);
  return [...opciones, { value: empresaId, label: `${actual.nombre} (${actual.aviso.toLowerCase()})` }];
};

// { nombre, aviso } para mostrar. aviso: '' si está activa.
export const datosEmpresa = (empresas, empresaId) => {
  const empresa = (empresas || []).find((e) => e.id === empresaId);
  if (!empresa) return { nombre: 'Empresa eliminada', aviso: 'Eliminada' };
  return { nombre: empresa.nombre || 'Sin nombre', aviso: empresaActiva(empresa) ? '' : 'Empresa inactiva' };
};
