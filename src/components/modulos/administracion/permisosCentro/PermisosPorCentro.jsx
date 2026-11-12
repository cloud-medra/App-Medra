import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { KeyRound, Search, X, AlertTriangle, SlidersHorizontal } from 'lucide-react';
import { db } from '../../../../firebaseConfig';
import { useUser } from '../../../../context/UserContext';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { puedeAdministrar } from '../../../../../functions/permisos/nucleo.mjs';
import Spinner from '../../../ui/Spinner';
import { usePlantillasPermisos, ROLES_CON_PLANTILLA, labelRol } from '../usuarios/permisosCentroCosto';
import { resumenCentros, filtrarCentros } from './resumenCentros';
import ConfigurarCentro from './ConfigurarCentro';

// Administración → Permisos por centro (solo admin/dev): los permisos que
// recibe cada usuario según su centro de costo y su rol (plantilla por
// centro + rol; admin/dev tienen acceso total y no la usan). Listado con el
// estado de cada centro por rol; clic en uno abre su configuración, con una
// pestaña por rol (ConfigurarCentro). Lecturas: el catálogo de centros (caché
// de sesión), las plantillas y los usuarios en vivo (los mismos que Lista
// Usuario).

const COLUMNAS = ['Centro', 'Estado por rol', 'Módulos con acceso', 'Usuarios por rol', 'Usuarios con permisos personalizados'];
const Separador = () => <span className="text-tinta-atenuada"> · </span>;

const useUsuarios = () => {
  const [estado, setEstado] = useState({ usuarios: [], cargados: false });
  useEffect(() => onSnapshot(
    query(collection(db, 'usuarios'), orderBy('nombreCompleto')),
    (snap) => setEstado({ usuarios: snap.docs.map((d) => ({ id: d.id, ...d.data() })), cargados: true }),
    (error) => { console.error('Error al leer usuarios:', error); setEstado({ usuarios: [], cargados: true }); }
  ), []);
  return estado;
};

const Vista = ({ onEditarUsuario }) => {
  const { datos: centros } = useCatalogo('centros');
  const { plantillas, cargadas, error } = usePlantillasPermisos();
  const { usuarios, cargados } = useUsuarios();
  const [busqueda, setBusqueda] = useState('');
  const [centroId, setCentroId] = useState(null);

  const filas = useMemo(() => resumenCentros(centros, plantillas, usuarios), [centros, plantillas, usuarios]);
  const visibles = filtrarCentros(filas, busqueda);
  const usuariosSinPermisos = filas.reduce((n, f) => n + f.sinPermisos, 0);
  const sinConfigurar = filas.filter((f) => f.ningunaConfigurada).length;
  const centro = centroId && filas.find((f) => f.id === centroId);

  if (error) return <p className="py-10 text-center text-normal text-red-600">No se pudieron cargar los permisos por centro.</p>;
  if (!cargadas || !cargados) return <div className="flex items-center justify-center py-10"><Spinner size="md" /></div>;
  if (centro) {
    return (
      <ConfigurarCentro key={centro.id} centro={centro} filas={filas} plantillas={plantillas} usuarios={usuarios}
        onVolver={() => setCentroId(null)} onEditarUsuario={onEditarUsuario} />
    );
  }

  const celda = 'px-3 py-1.5 border-b border-r last:border-r-0 border-gray-100 dark:border-gray-700/60';
  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden">
      <div className="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="w-8 h-8 rounded-lg bg-[#2383C2] text-white flex items-center justify-center shrink-0"><KeyRound size={16} /></span>
        <div className="min-w-0 mr-auto">
          <h2 className="text-titulo-seccion text-tinta-principal">Permisos por centro</h2>
          <p className="text-secundario text-tinta-secundaria">Los usuarios reciben los permisos de su centro de costo según su rol, más sus excepciones. Clic en un centro para configurarlo.</p>
        </div>
        {(sinConfigurar > 0 || usuariosSinPermisos > 0) && (
          <span className="inline-flex items-center gap-1.5 text-etiqueta text-amber-700 dark:text-amber-400">
            <AlertTriangle size={13} />
            {[sinConfigurar > 0 && `${sinConfigurar} centro(s) sin configurar`, usuariosSinPermisos > 0 && `${usuariosSinPermisos} usuario(s) sin permisos de su centro y rol`].filter(Boolean).join(' · ')}
          </span>
        )}
        <div className="relative w-64 max-w-full">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar centro…" aria-label="Buscar centro"
            className="w-full h-7 pl-8 pr-7 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-secundario text-tinta-principal focus:outline-none focus:border-[#2383C2]" />
          {busqueda && (
            <button type="button" onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 text-tinta-atenuada hover:text-[#2383C2]"><X size={13} /></button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-left text-secundario border-separate border-spacing-0 [&>tbody>tr:last-child>td]:border-b-0">
          <thead className="text-pequeno uppercase text-tinta-secundaria">
            <tr>
              {COLUMNAS.map((c) => (
                <th key={c} className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 px-3 py-1.5 text-etiqueta whitespace-nowrap border-b border-r last:border-r-0 border-gray-200 dark:border-gray-700">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr><td colSpan={COLUMNAS.length} className="py-10 text-center text-tinta-atenuada">{busqueda ? 'Ningún centro coincide con la búsqueda.' : 'No hay centros activos en Maestros → Centros.'}</td></tr>
            )}
            {visibles.map((f) => {
              // Resaltado: hay usuarios cuya combinación no está configurada, o el centro no tiene ninguna.
              const alerta = f.sinPermisos > 0 || f.ningunaConfigurada;
              return (
                <tr key={f.id} onClick={() => setCentroId(f.id)} data-alerta={alerta || undefined}
                  className={`cursor-pointer ${alerta ? 'bg-amber-50/70 dark:bg-amber-900/10 hover:bg-amber-100/70 dark:hover:bg-amber-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}>
                  <td className={`${celda} text-tinta-principal`}>
                    <button type="button" className="text-left hover:text-[#2383C2]" onClick={(e) => { e.stopPropagation(); setCentroId(f.id); }}>{f.nombre}</button>
                    {!f.usarEnGestiones && <span className="ml-1.5 text-pequeno px-1.5 py-0.5 rounded-full uppercase bg-gray-100 dark:bg-gray-700 text-tinta-secundaria" title="No se ofrece en las gestiones">Solo usuarios</span>}
                  </td>
                  <td className={celda}>
                    {ROLES_CON_PLANTILLA.map((rol, i) => (
                      <span key={rol} className="whitespace-nowrap">
                        {i > 0 && <Separador />}
                        <span className="text-tinta-secundaria">{labelRol(rol)}: </span>
                        {f.roles[rol].configurada
                          ? <span className="text-etiqueta text-green-700 dark:text-green-400">Configurada</span>
                          : <span className={`text-etiqueta ${f.roles[rol].usuarios ? 'text-amber-700 dark:text-amber-400' : 'text-tinta-atenuada'}`} title={f.roles[rol].usuarios ? 'Sus usuarios no reciben permisos de este centro' : undefined}>Sin configurar</span>}
                      </span>
                    ))}
                  </td>
                  <td className={`${celda} text-tinta-secundaria`}
                    title={ROLES_CON_PLANTILLA.map((rol) => `${labelRol(rol)}: ${f.roles[rol].modulos.join(', ') || '—'}`).join('\n')}>
                    {ROLES_CON_PLANTILLA.map((rol, i) => (
                      <span key={rol} className="whitespace-nowrap">{i > 0 && <Separador />}{labelRol(rol)}: {f.roles[rol].configurada ? f.roles[rol].modulos.length : '—'}</span>
                    ))}
                  </td>
                  <td className={`${celda} tabular-nums`}>
                    {ROLES_CON_PLANTILLA.map((rol, i) => (
                      <span key={rol} className="whitespace-nowrap">{i > 0 && <Separador />}{labelRol(rol)}: {f.roles[rol].usuarios}</span>
                    ))}
                  </td>
                  <td className={`${celda} tabular-nums`}>
                    {f.personalizados ? <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 text-etiqueta"><SlidersHorizontal size={11} />{f.personalizados}</span> : <span className="text-tinta-atenuada">0</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Rol Administrador con este ítem, o Desarrollador (igual que las reglas de
// plantillas_permisos y la función guardarPlantillaCentroCosto).
const PermisosPorCentro = ({ onEditarUsuario }) => {
  const { userData } = useUser();
  if (!puedeAdministrar(userData, ['/administracion/permisosCentro'])) {
    return <p className="py-10 text-center text-normal text-tinta-secundaria">Solo un administrador con acceso a Permisos por centro puede configurarlos.</p>;
  }
  return <Vista onEditarUsuario={onEditarUsuario} />;
};

export default PermisosPorCentro;
