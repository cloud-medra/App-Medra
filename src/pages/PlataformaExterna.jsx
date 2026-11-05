import { useState } from 'react';
import { AlertTriangle, Building2, FileText, KeyRound, LogOut, Moon, Sun, User } from 'lucide-react';
import { useUser } from '../context/UserContext';
import { useTheme } from '../context/ThemeContext';
import { useEmpresaUsuario } from '../hooks/useEmpresaUsuario';
import { cerrarSesion } from '../utils/cerrarSesion';
import Perfil from '../components/modulos/general/perfil/Perfil';
import CambiarPasswordAjustes from '../components/modulos/general/settings/cambiarPassword/CambiarPasswordAjustes';
import OrdenesCompra from '../components/modulos/portalProveedores/ordenesCompra/OrdenesCompra';
import { MODULO_PORTAL, RUTA_ORDENES_COMPRA } from '../../functions/portalProveedores/nucleo.mjs';
import logoMedraClaro from '../assets/logo/medra-logo-claro.svg';
import logoMedraOscuro from '../assets/logo/medra-logo-oscuro.svg';

// Pantalla de un usuario externo: su empresa, los ítems de Portal Proveedores que tenga
// asignados, Mi perfil y cambio de contraseña (las mismas de los internos). No lee ningún
// dato interno. Un ítem nuevo del portal se agrega aquí (MODULOS_PARA_EXTERNOS).
const BOTON = 'h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-[12px] font-semibold transition-colors';
const BOTON_INACTIVO = 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700';
const BOTON_ACTIVO = 'bg-[#2383C2]/10 text-[#2383C2]';

const PlataformaExterna = () => {
  const { userData } = useUser();
  const { oscuro, alternarOscuro } = useTheme();
  const { nombre, activa, cargando } = useEmpresaUsuario();
  const [vista, setVista] = useState('inicio');
  // Con la empresa desactivada las reglas le niegan los datos: no se ofrece.
  const verOrdenes = activa && (userData?.permisos?.[MODULO_PORTAL] || []).includes(RUTA_ORDENES_COMPRA);

  const salir = async () => {
    try {
      await cerrarSesion();
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  const botonVista = (id, etiqueta, Icono) => (
    <button type="button" onClick={() => setVista(id)} aria-current={vista === id ? 'page' : undefined} className={`${BOTON} ${vista === id ? BOTON_ACTIVO : BOTON_INACTIVO}`}>
      <Icono size={14} /> {etiqueta}
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <header className="flex flex-wrap items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <button type="button" onClick={() => setVista('inicio')} aria-label="Ir al inicio" className="mr-2">
          <img src={oscuro ? logoMedraOscuro : logoMedraClaro} alt="Medra" className="h-6" />
        </button>
        {verOrdenes && botonVista('ordenes', 'Órdenes de Compra', FileText)}
        {botonVista('perfil', 'Mi perfil', User)}
        {botonVista('password', 'Cambiar contraseña', KeyRound)}
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={alternarOscuro} aria-label={oscuro ? 'Usar tema claro' : 'Usar tema oscuro'} className={`${BOTON} ${BOTON_INACTIVO}`}>
            {oscuro ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button type="button" onClick={salir} className={`${BOTON} ${BOTON_INACTIVO}`}>
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6">
        {vista === 'ordenes' && verOrdenes && <div className="h-[calc(100vh-7rem)]"><OrdenesCompra /></div>}
        {vista === 'perfil' && <Perfil userData={userData} onGestionarPassword={() => setVista('password')} />}
        {vista === 'password' && <CambiarPasswordAjustes userData={userData} />}
        {vista === 'inicio' && (
          <div className="max-w-2xl rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h1 className="text-[15px] font-semibold text-gray-800 dark:text-gray-100">Hola, {userData?.nombreCompleto || 'usuario'}</h1>
            <p className="mt-2 flex items-center gap-2 text-[13px] text-gray-600 dark:text-gray-300">
              <Building2 size={15} className="text-[#2383C2] shrink-0" />
              Empresa: <span className="font-semibold">{cargando ? 'Cargando…' : nombre || 'Sin registro'}</span>
            </p>
            {!cargando && !activa ? (
              <p role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[12.5px] text-amber-800 dark:text-amber-300">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                Tu empresa está desactivada. Contacta al administrador.
              </p>
            ) : (
              <p className="mt-4 text-[12.5px] text-gray-500 dark:text-gray-400">{verOrdenes ? 'Consulta tus órdenes en el menú de arriba.' : 'Todavía no tienes módulos asignados.'}</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default PlataformaExterna;
