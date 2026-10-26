import React, { useState } from 'react';

// Avatar de un usuario: su foto de perfil (`fotoPerfilUrl` del documento del
// usuario, que ya viene cargado) o, si no tiene o no carga, sus iniciales.
// Las clases de tamaño, fondo y texto las pone quien lo usa (`className`);
// con foto, la imagen ocupa todo el círculo.

export const inicialesDe = (nombre = '') =>
  String(nombre || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');

const AvatarUsuario = ({ nombre, fotoUrl, className = '', alt, porDefecto = '?' }) => {
  // Si la URL falla (foto borrada, sin conexión) se muestran las iniciales.
  const [urlFallida, setUrlFallida] = useState(null);
  const mostrarFoto = Boolean(fotoUrl) && urlFallida !== fotoUrl;
  return (
    <span className={`relative rounded-full overflow-hidden inline-flex items-center justify-center shrink-0 select-none ${className}`}>
      {mostrarFoto ? (
        <img
          src={fotoUrl}
          alt={alt ?? (nombre ? `Foto de ${nombre}` : 'Foto de perfil')}
          className="w-full h-full object-cover"
          onError={() => setUrlFallida(fotoUrl)}
          draggable={false}
        />
      ) : (
        inicialesDe(nombre) || porDefecto
      )}
    </span>
  );
};

export default AvatarUsuario;
