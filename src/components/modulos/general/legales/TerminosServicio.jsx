import React, { useState } from 'react';

const Section = ({ number, title, children, highlight }) => {
  const [open, setOpen] = useState(true);
  return (
    <section className="border-b border-gray-100 pb-4 dark:border-gray-700">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-left py-1 group"
      >
        <h2 className="text-titulo-seccion text-tinta-principal group-hover:text-indigo-600 transition-colors">
          {number}. {title}
          {highlight && (
            <span className="ml-2 text-normal text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">
              {highlight}
            </span>
          )}
        </h2>
        <span className="text-tinta-atenuada text-normal ml-2">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-2 text-normal text-tinta-secundaria space-y-2 pl-3 border-l-2 border-indigo-100">
          {children}
        </div>
      )}
    </section>
  );
};

const TerminosServicio = () => {
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 max-w-4xl mx-auto dark:bg-gray-800 dark:border-gray-700">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-1 h-6 bg-indigo-500 rounded-full" />
          <h1 className="text-titulo-pagina text-tinta-principal">Términos del Servicio</h1>
        </div>
        <div className="flex items-center gap-4 ml-3 mt-1">
          <p className="text-normal text-tinta-atenuada">Cloud – Medra</p>
          <span className="text-tinta-atenuada">|</span>
          <p className="text-normal text-tinta-atenuada">Última actualización: Junio 2026</p>
        </div>
        <div className="mt-3 p-3 bg-indigo-50 rounded-lg border border-indigo-100">
          <p className="text-normal text-indigo-700">
            <strong>Uso interno restringido:</strong> Cloud – Medra es una plataforma de gestión 
            administrativa de uso exclusivo para personal autorizado. El acceso está condicionado 
            a la aceptación íntegra de estos términos y a la autorización expresa del administrador titular.
          </p>
        </div>
      </div>

      <div className="space-y-4">

        <Section number="1" title="Aceptación de los Términos">
          <p>
            Al acceder y utilizar la plataforma Cloud – Medra, el usuario acepta de manera expresa, 
            consciente e incondicional los presentes Términos del Servicio, así como la Política de 
            Privacidad asociada.
          </p>
          <p>
            Si el usuario no está de acuerdo con alguno de estos términos, deberá abstenerse de 
            utilizar la plataforma y comunicarlo de inmediato al administrador del sistema para 
            la revocación de sus credenciales de acceso.
          </p>
        </Section>

        <Section number="2" title="Descripción del Servicio">
          <p>
            Cloud – Medra es una herramienta digital interna diseñada para optimizar la gestión 
            administrativa y operativa de un equipo de trabajo. Sus funcionalidades incluyen, 
            sin limitarse a:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Módulos de gestión organizados por áreas de trabajo</li>
            <li>Registro de referencias internas de pacientes mediante nombre y apellidos</li>
            <li>Control de acceso por usuario con permisos granulados</li>
            <li>Coordinación y seguimiento de actividades del equipo</li>
          </ul>
          <p>
            El servicio <strong>no constituye</strong> un sistema de historia clínica electrónica (HCE), 
            ni una plataforma de telemedicina, ni un sistema de registro sanitario oficial.
          </p>
        </Section>

        <Section number="3" title="Acceso y Autorización" highlight="Clave">
          <p>
            El acceso a Cloud – Medra es <strong>exclusivo y personal</strong>. Solo podrán 
            utilizar la plataforma las personas que cuenten con autorización explícita del 
            administrador titular del sistema. Está estrictamente prohibido:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Compartir credenciales de acceso con terceros</li>
            <li>Permitir el uso de la cuenta a personas no autorizadas</li>
            <li>Acceder a módulos o datos que excedan los permisos asignados</li>
            <li>Intentar eludir los controles de seguridad del sistema</li>
          </ul>
          <p>
            El incumplimiento de estas restricciones puede derivar en la revocación inmediata 
            del acceso y en las responsabilidades legales que correspondan.
          </p>
        </Section>

        <Section number="4" title="Uso Permitido de la Plataforma">
          <p>
            El usuario se compromete a utilizar Cloud – Medra exclusivamente para los fines 
            administrativos internos para los cuales fue diseñada. Queda expresamente prohibido:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Ingresar datos que no correspondan a la finalidad del módulo utilizado</li>
            <li>Almacenar información que infrinja derechos de terceros o la ley chilena</li>
            <li>Usar la plataforma para actividades ilícitas, fraudulentas o no autorizadas</li>
            <li>Extraer, exportar o reproducir datos fuera del sistema sin autorización expresa</li>
            <li>Realizar ingeniería inversa sobre la plataforma o sus componentes</li>
          </ul>
        </Section>

        <Section number="5" title="Manejo de Datos de Referencia de Pacientes" highlight="Importante">
          <p>
            En los módulos donde sea necesario identificar a un paciente de forma referencial, 
            el sistema permite ingresar <strong>únicamente un nombre de pila y dos apellidos</strong>, 
            sin número de identificación (RUT), datos de contacto ni información clínica.
          </p>
          <p>
            Esta práctica responde a un diseño deliberado orientado a la <strong>minimización de datos</strong>, 
            principio reconocido en la normativa de protección de datos vigente y futura en Chile 
            (Ley N° 19.628 y Ley Marco de Ciberseguridad).
          </p>
          <p>
            El usuario reconoce que los datos ingresados son de carácter referencial interno 
            y se compromete a no ingresar voluntariamente información adicional que permita 
            la identificación inequívoca de una persona natural.
          </p>
          <p className="text-tinta-secundaria italic">
            El administrador del sistema es el responsable del tratamiento de estos datos 
            conforme a la Política de Privacidad vigente.
          </p>
        </Section>

        <Section number="6" title="Responsabilidades del Usuario">
          <p>Cada usuario autorizado es responsable de:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Mantener la confidencialidad de sus credenciales de acceso</li>
            <li>Notificar de inmediato al administrador ante cualquier acceso no autorizado sospechado</li>
            <li>Usar el sistema conforme a los permisos asignados y a estos términos</li>
            <li>Responder personalmente por el uso indebido realizado desde su cuenta</li>
          </ul>
        </Section>

        <Section number="7" title="Limitación de Responsabilidad">
          <p>
            Cloud – Medra es una herramienta de apoyo administrativo. El administrador y 
            desarrollador del sistema no se hace responsable de:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Decisiones clínicas o administrativas tomadas basándose en la información del sistema</li>
            <li>Pérdida de datos derivada de uso incorrecto por parte de los usuarios</li>
            <li>Interrupciones del servicio atribuibles a terceros proveedores (Firebase/Google)</li>
            <li>Datos ingresados incorrectamente por los usuarios autorizados</li>
          </ul>
          <p>
            El sistema se proporciona en el estado en que se encuentra ("as is"), con mejoras 
            continuas según las necesidades operativas del equipo.
          </p>
        </Section>

        <Section number="8" title="Disponibilidad del Servicio">
          <p>
            El administrador del sistema realizará los esfuerzos razonables para mantener 
            la disponibilidad de Cloud – Medra. Sin embargo, no se garantiza disponibilidad 
            ininterrumpida, ya que el servicio depende de infraestructura de terceros (Firebase).
          </p>
          <p>
            Las labores de mantenimiento, actualizaciones o interrupciones planificadas serán 
            comunicadas a los usuarios con la mayor anticipación posible.
          </p>
        </Section>

        <Section number="9" title="Propiedad Intelectual">
          <p>
            La plataforma Cloud – Medra, incluyendo su diseño, código fuente, estructura de 
            módulos y lógica de funcionamiento, es propiedad del administrador titular. 
            El acceso concedido a los usuarios no implica transferencia de ningún derecho 
            de propiedad intelectual sobre el sistema.
          </p>
        </Section>

        <Section number="10" title="Vigencia y Terminación del Acceso">
          <p>
            El acceso a la plataforma se mantiene vigente mientras el usuario cuente con 
            autorización del administrador y cumpla estos términos. El administrador puede 
            revocar el acceso en cualquier momento, con o sin previo aviso, especialmente ante:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Incumplimiento de estos términos o de la Política de Privacidad</li>
            <li>Desvinculación del usuario del equipo de trabajo</li>
            <li>Sospecha fundada de uso indebido del sistema</li>
          </ul>
        </Section>

        <Section number="11" title="Ley Aplicable y Jurisdicción">
          <p>
            Estos Términos del Servicio se rigen por la legislación vigente en la 
            República de Chile, incluyendo la Ley N° 19.628 sobre Protección de la Vida 
            Privada y demás normativas aplicables.
          </p>
          <p>
            Cualquier controversia derivada del uso de la plataforma se someterá a los 
            tribunales ordinarios de justicia con asiento en Chile.
          </p>
        </Section>

        <Section number="12" title="Modificaciones a los Términos">
          <p>
            El administrador del sistema se reserva el derecho de modificar estos Términos 
            del Servicio en cualquier momento. Los cambios entrarán en vigencia una vez 
            publicados en la plataforma. El uso continuado del sistema tras la publicación 
            de cambios implica la aceptación de los nuevos términos.
          </p>
        </Section>

      </div>

      <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between dark:border-gray-700">
        <p className="text-normal text-tinta-atenuada">
          Marco legal: Ley N° 19.628 · República de Chile
        </p>
        <span className="text-normal bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full border border-indigo-100">
          v1.0 · Junio 2026
        </span>
      </div>
    </div>
  );
};

export default TerminosServicio;