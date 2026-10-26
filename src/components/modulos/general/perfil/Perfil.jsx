import React from 'react';
import { User, Mail, Shield, AtSign, Briefcase, CalendarDays, Activity } from 'lucide-react';
import AvatarUsuario from '../../../ui/AvatarUsuario';

const Perfil = ({ userData }) => {
  const fechaUnion = userData.fechaCreacion || "15 de Mayo, 2023";
  const esActivo = userData.estado?.toLowerCase() === 'activo';

  return (
    <div className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden transition-all duration-300 hover:shadow-xl">
      <div className="bg-gray-50 dark:bg-gray-800/50 p-5 flex items-center justify-between border-b border-gray-100 dark:border-gray-700">
        <h2 className="text-[15px] font-extrabold text-gray-800 dark:text-gray-100 flex items-center gap-2.5 tracking-tight">
          <div className="p-1.5 bg-[#2383C2]/10 dark:bg-[#2383C2]/20 rounded-lg">
            <User size={18} className="text-[#2383C2]" />
          </div>
          PANEL DE PERFIL PERSONAL
        </h2>
        
        <span className={`text-[11px] px-3 py-1 rounded-full font-bold uppercase flex items-center gap-1.5 border ${
          esActivo 
            ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-900/50' 
            : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/50'
        }`}>
          <div className={`w-1.5 h-1.5 rounded-full ${esActivo ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
          {userData.estado || 'Desconocido'}
        </span>
      </div>

      <div className="p-8">
        <div className="flex flex-col md:flex-row gap-8 items-start">
          
          <div className="w-full md:w-1/3 flex flex-col items-center p-6 bg-gray-50 dark:bg-gray-900/40 rounded-2xl border border-gray-100 dark:border-gray-700/60 text-center">
            <div className="relative mb-4">
              {/* Foto de perfil (si tiene) o iniciales: del documento del usuario ya cargado. */}
              <AvatarUsuario
                nombre={userData.nombreCompleto}
                fotoUrl={userData.fotoPerfilUrl}
                porDefecto="U"
                className="w-28 h-28 bg-gradient-to-br from-[#2383C2] to-[#1a618f] shadow-inner border-4 border-white dark:border-gray-800 ring-2 ring-gray-100 dark:ring-gray-700 text-5xl font-black text-white"
              />
              <div className="absolute bottom-1 right-1 p-2 bg-white dark:bg-gray-800 rounded-full shadow-md border border-gray-200 dark:border-gray-700 text-[#2383C2]">
                 <Briefcase size={14} />
              </div>
            </div>
            
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
              {userData.nombreCompleto || 'Usuario'}
            </h3>
            <p className="text-[13px] text-gray-500 dark:text-gray-400 font-medium mb-4 flex items-center gap-1">
              <AtSign size={12} className="text-gray-400 dark:text-gray-500" />
              {userData.nombreUsuario || 'sin_nombre_usuario'}
            </p>
            
            <span className="text-[11px] px-4 py-1 rounded-full font-bold uppercase tracking-wider bg-[#2383C2] text-white shadow-sm">
              {userData.rol || 'Sin Rol'}
            </span>
            
            <div className="w-full border-t border-gray-200 dark:border-gray-700 my-5"></div>
            
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-[12px]">
                <CalendarDays size={14} className="text-gray-400 dark:text-gray-500" />
                <span>Miembro desde: <span className='font-semibold text-gray-700 dark:text-gray-200'>{fechaUnion}</span></span>
            </div>
          </div>

          <div className="w-full md:w-2/3 space-y-6">
            <div className="flex items-center justify-between">
                <h4 className="text-[13px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Información Detallada</h4>
                <button className="text-[12px] font-semibold text-[#2383C2] hover:underline">Editar Datos</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <ElegantInfoCard icon={User} label="Nombre Completo" value={userData.nombreCompleto} />
              <ElegantInfoCard icon={AtSign} label="Nombre de Usuario" value={userData.nombreUsuario} />
              <ElegantInfoCard icon={Mail} label="Correo Electrónico" value={userData.email} />
              <ElegantInfoCard icon={Shield} label="Rol" value={userData.rol} isCapitalized />
              <ElegantInfoCard icon={Activity} label="Estado" value={userData.estado} isCapitalized />
              <ElegantInfoCard icon={Briefcase} label="ID" value={userData.uid || userData.id || 'N/A'} isCode />
            </div>
            
            <div className="mt-8 p-5 bg-blue-50 dark:bg-blue-950/20 rounded-xl border border-blue-100 dark:border-blue-900/40 flex items-center gap-4">
                <div className="p-3 bg-white dark:bg-gray-800 rounded-full text-[#2383C2] shadow-sm border border-transparent dark:border-gray-700">
                    <Shield size={20}/>
                </div>
                <div>
                    <h5 className="text-[14px] font-bold text-blue-900 dark:text-blue-300">Seguridad de la Cuenta</h5>
                    <p className="text-[12px] text-blue-800/80 dark:text-blue-400/80">Tu cuenta está protegida. Último cambio de contraseña hace 3 meses.</p>
                </div>
                <button className="ml-auto text-[12px] px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  Gestionar
                </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ElegantInfoCard = ({ icon: Icon, label, value, isCapitalized, isCode }) => (
  <div className="relative group p-5 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700/70 shadow-sm transition-all duration-300 hover:border-[#2383C2]/30 dark:hover:border-[#2383C2]/40 hover:shadow-md overflow-hidden">
    <div className="absolute -bottom-6 -right-6 text-[#2383C2]/5 dark:text-[#2383C2]/10 transform group-hover:scale-150 transition-transform duration-500">
        <Icon size={80} strokeWidth={1}/>
    </div>

    <div className="relative flex items-center gap-4">
      <div className="p-2.5 bg-gray-100 dark:bg-gray-900 rounded-xl text-gray-500 dark:text-gray-400 group-hover:bg-[#2383C2]/10 dark:group-hover:bg-[#2383C2]/20 group-hover:text-[#2383C2] transition-colors">
        <Icon size={18} />
      </div>
      <div className="flex-1">
        <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-bold tracking-widest mb-0.5">{label}</p>
        <p className={`text-[14px] font-semibold text-gray-800 dark:text-gray-200 ${isCapitalized ? 'capitalize' : ''} ${isCode ? 'font-num text-[13px] bg-gray-50 dark:bg-gray-900 px-1.5 py-0.5 rounded border border-transparent dark:border-gray-700' : ''}`}>
          {value || 'No disponible'}
        </p>
      </div>
    </div>
  </div>
);

export default Perfil;