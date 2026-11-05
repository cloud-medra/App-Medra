// Campos de "Datos generales" (Crear Usuario y Editar usuario).

export const Tarjeta = ({ titulo, descripcion, children, className = '' }) => (
  <section className={`rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 ${className}`}>
    {(titulo || descripcion) && (
      <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700">
        {titulo && <h3 className="text-[13px] font-semibold text-gray-800 dark:text-gray-100">{titulo}</h3>}
        {descripcion && <p className="text-[11.5px] text-gray-500 dark:text-gray-400 mt-0.5">{descripcion}</p>}
      </div>
    )}
    <div className="p-5">{children}</div>
  </section>
);

const ESTILO_INPUT =
  'w-full h-9 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-[12.5px] text-gray-800 dark:text-gray-100 focus:outline-none focus:border-[#2383C2] focus:ring-2 focus:ring-[#2383C2]/15 disabled:bg-gray-50 disabled:text-gray-500 dark:disabled:bg-gray-800/60 dark:disabled:text-gray-400';

export const Campo = ({ label, icon: Icon, ayuda, error, id, children }) => (
  <div>
    <label htmlFor={id} className="block text-[11.5px] font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
      {label}
    </label>
    <div className="relative">
      {Icon && <Icon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />}
      {children}
    </div>
    {error ? (
      <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">{error}</p>
    ) : ayuda ? (
      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">{ayuda}</p>
    ) : null}
  </div>
);

export const CampoTexto = ({ label, icon, ayuda, error, id, ...props }) => (
  <Campo label={label} icon={icon} ayuda={ayuda} error={error} id={id}>
    <input id={id} {...props} className={`${ESTILO_INPUT} ${icon ? 'pl-9' : 'pl-3'} pr-3 ${error ? 'border-red-400' : ''}`} />
  </Campo>
);

export const CampoSelect = ({ label, icon, ayuda, error, id, opciones, ...props }) => (
  <Campo label={label} icon={icon} ayuda={ayuda} error={error} id={id}>
    <select id={id} {...props} className={`${ESTILO_INPUT} ${icon ? 'pl-9' : 'pl-3'} pr-3 appearance-none ${error ? 'border-red-400' : ''}`}>
      {opciones.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  </Campo>
);

// Interruptor Activo / Inactivo.
export const CampoEstado = ({ activo, onChange, disabled }) => (
  <div>
    <span className="block text-[11.5px] font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Estado</span>
    <div className="inline-flex rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden" role="radiogroup" aria-label="Estado del usuario">
      {[
        { valor: true, label: 'Activo', on: 'bg-green-600 text-white' },
        { valor: false, label: 'Inactivo', on: 'bg-gray-600 text-white' },
      ].map((op) => (
        <button
          key={op.label}
          type="button"
          role="radio"
          aria-checked={activo === op.valor}
          disabled={disabled}
          onClick={() => onChange(op.valor)}
          className={`h-9 px-4 text-[12px] font-semibold transition-colors ${
            activo === op.valor ? op.on : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
        >
          {op.label}
        </button>
      ))}
    </div>
    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Se refleja en Listado Usuario (hoy no bloquea el ingreso).</p>
  </div>
);
