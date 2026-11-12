import React, { useState } from 'react';

const Section = ({ number, title, children }) => {
  const [open, setOpen] = useState(true);
  return (
    <section className="border-b border-gray-100 pb-4 dark:border-gray-700">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-left py-1 group"
      >
        <h2 className="text-titulo-seccion text-tinta-principal group-hover:text-blue-600 transition-colors dark:group-hover:text-blue-400">
          {number}. {title}
        </h2>
        <span className="text-tinta-atenuada text-normal ml-2">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-2 text-normal text-tinta-secundaria space-y-2 pl-3 border-l-2 border-blue-100 dark:border-blue-900">
          {children}
        </div>
      )}
    </section>
  );
};

const PoliticasPrivacidad = () => {
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 max-w-4xl mx-auto dark:bg-gray-800 dark:border-gray-700">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-1 h-6 bg-blue-500 rounded-full" />
          <h1 className="text-titulo-pagina text-tinta-principal">Política de Privacidad</h1>
        </div>
        <div className="flex items-center gap-4 ml-3 mt-1">
          <p className="text-normal text-tinta-atenuada">Cloud – Medra</p>
          <span className="text-tinta-atenuada">|</span>
          <p className="text-normal text-tinta-atenuada">Última actualización: Junio 2026</p>
        </div>
        <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100 dark:bg-blue-950/30 dark:border-blue-900">
          <p className="text-normal text-blue-700 dark:text-blue-300">
            <strong>Nota importante:</strong> Cloud – Medra es una herramienta interna de gestión administrativa 
            que <strong>no almacena datos sensibles de salud</strong> ni información de identificación completa 
            de pacientes. El sistema opera con datos mínimos y acceso controlado, conforme a la 
            Ley N° 19.628 sobre Protección de la Vida Privada de Chile.
          </p>
        </div>
      </div>

      <div className="space-y-4">

        <Section number="1" title="Responsable del Tratamiento de Datos">
          <p>
            El responsable del tratamiento de los datos personales gestionados a través de Cloud – Medra 
            es el titular de la cuenta administradora que opera la plataforma. Dicho titular es quien 
            autoriza el acceso al sistema y determina los permisos de cada usuario registrado.
          </p>
          <p>
            Cloud – Medra actúa como herramienta tecnológica de soporte, sin acceso autónomo 
            a los datos ingresados por los usuarios autorizados.
          </p>
        </Section>

        <Section number="2" title="Datos que el Sistema Puede Contener">
          <p>
            El sistema está diseñado para operar con la <strong>cantidad mínima de información necesaria</strong>. 
            En relación a registros de pacientes, el sistema almacena únicamente:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>Un nombre de pila</strong> (no necesariamente el nombre legal completo)</li>
            <li><strong>Dos apellidos</strong></li>
            <li>Información administrativa asociada al módulo correspondiente (fechas, estados, notas de gestión)</li>
          </ul>
          <p>
            El sistema <strong>no almacena</strong> de forma intencional: RUT o número de identificación nacional, 
            datos clínicos o diagnósticos médicos, domicilio, teléfono ni correo electrónico de pacientes, 
            ni ningún otro dato sensible definido en la Ley N° 19.628.
          </p>
          <p className="text-tinta-secundaria italic">
            El uso de un nombre de pila y dos apellidos sin RUT no permite identificar de forma 
            unívoca a una persona natural, lo que reduce significativamente el riesgo de tratamiento 
            indebido de datos personales.
          </p>
        </Section>

        <Section number="3" title="Finalidad del Tratamiento">
          <p>
            Los datos gestionados a través de Cloud – Medra tienen exclusivamente finalidades 
            administrativas e internas:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Organización y seguimiento de agendas de trabajo</li>
            <li>Coordinación de actividades entre usuarios autorizados del equipo</li>
            <li>Reducción de tiempos operativos internos</li>
            <li>Control de gestión por módulos de trabajo</li>
          </ul>
          <p>
            Los datos no serán utilizados con fines comerciales, publicitarios, ni serán 
            cedidos o vendidos a terceros bajo ninguna circunstancia.
          </p>
        </Section>

        <Section number="4" title="Acceso y Control de Usuarios">
          <p>
            El acceso a Cloud – Medra es <strong>estrictamente restringido</strong>. Solo pueden 
            ingresar al sistema las personas expresamente autorizadas por el administrador titular. 
            El sistema implementa:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Autenticación mediante Firebase Authentication con credenciales individuales</li>
            <li>Permisos granulados por módulo y por rol de usuario</li>
            <li>Registro de accesos para trazabilidad interna</li>
            <li>Revocación inmediata de acceso ante desvinculación del usuario</li>
          </ul>
          <p>
            Ningún usuario externo no autorizado puede acceder a la información almacenada.
          </p>
        </Section>

        <Section number="5" title="Almacenamiento y Seguridad">
          <p>
            Los datos son almacenados en <strong>Firebase (Google Cloud)</strong>, plataforma que 
            cumple con estándares internacionales de seguridad, incluyendo cifrado en tránsito (TLS) 
            y en reposo. Firebase cuenta con certificaciones SOC 1, SOC 2, SOC 3 e ISO 27001.
          </p>
          <p>
            El administrador del sistema aplica reglas de seguridad en Firestore (Firebase Security Rules) 
            para garantizar que cada usuario acceda únicamente a los datos correspondientes a sus permisos.
          </p>
        </Section>

        <Section number="6" title="Derechos de los Titulares de Datos">
          <p>
            De conformidad con la Ley N° 19.628 y la futura Ley Marco de Ciberseguridad de Chile, 
            toda persona cuyos datos se encuentren en el sistema tiene derecho a:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>Acceso:</strong> conocer qué información existe sobre ella</li>
            <li><strong>Rectificación:</strong> corregir datos inexactos</li>
            <li><strong>Cancelación:</strong> solicitar la eliminación de sus datos</li>
            <li><strong>Oposición:</strong> oponerse al tratamiento de sus datos</li>
          </ul>
          <p>
            Las solicitudes deben dirigirse directamente al administrador del sistema, 
            quien es el responsable del tratamiento.
          </p>
        </Section>

        <Section number="7" title="Conservación de los Datos">
          <p>
            Los datos se conservarán durante el tiempo estrictamente necesario para cumplir 
            con los fines administrativos descritos, o hasta que el administrador del sistema 
            disponga su eliminación. No existe un período mínimo de retención forzosa dado que 
            el sistema no maneja datos de salud sensibles ni documentos legales obligatorios.
          </p>
        </Section>

        <Section number="8" title="Modificaciones a esta Política">
          <p>
            Esta política puede ser actualizada por el administrador del sistema cuando sea necesario. 
            Los usuarios registrados serán notificados de cambios relevantes. La versión vigente 
            siempre estará disponible dentro de la plataforma.
          </p>
        </Section>

      </div>

      <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between dark:border-gray-700">
        <p className="text-normal text-tinta-atenuada">
          Marco legal: Ley N° 19.628 – Protección de la Vida Privada (Chile)
        </p>
        <span className="text-normal bg-green-50 text-green-600 px-2 py-1 rounded-full border border-green-100">
          v1.0 · Junio 2026
        </span>
      </div>
    </div>
  );
};

export default PoliticasPrivacidad;