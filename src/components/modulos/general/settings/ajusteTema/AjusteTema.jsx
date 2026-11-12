import { Sun, Moon, Monitor, Palette } from 'lucide-react';
import { useTheme } from '../../../../../context/ThemeContext';
import { useToast } from '../../../../../context/ToastContext';

// Selector de tema. El estado y el guardado viven en ThemeContext (la misma
// fuente que usa el toggle "Modo Oscuro" del menú del avatar), así que ambas
// opciones siempre muestran el tema actual.
const OPCIONES = [
  { valor: 'claro', icon: Sun, titulo: 'Modo Claro', descripcion: 'Fondo claro, texto oscuro', preview: 'bg-gray-100', claseIcono: 'text-amber-500' },
  { valor: 'oscuro', icon: Moon, titulo: 'Modo Oscuro', descripcion: 'Fondo oscuro, texto claro', preview: 'bg-gray-800', claseIcono: 'text-white' },
  { valor: 'sistema', icon: Monitor, titulo: 'Según el sistema', descripcion: 'Sigue la configuración del dispositivo', preview: 'bg-gradient-to-r from-gray-100 to-gray-800', claseIcono: 'text-[#2383C2]' }
];

const AjusteTema = () => {
  const { tema, setTema } = useTheme();
  const { showToast } = useToast();

  const seleccionar = async (valor) => {
    if (valor === tema) return;
    const guardado = await setTema(valor);
    if (!guardado) showToast('El tema se aplicó, pero no se pudo guardar en tu cuenta.', 'warning');
  };

  return (
    <div className="w-full max-w-2xl">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm flex flex-col gap-4">
        <div className="border-b border-gray-100 dark:border-gray-700 pb-2">
          <h3 className="text-titulo-seccion text-tinta-principal flex items-center gap-2">
            <Palette size={16} className="text-[#2383C2]" />
            Tema y apariencia
          </h3>
          <p className="text-secundario text-tinta-secundaria">
            Elige cómo quieres ver el sistema. Se aplica al instante y se guarda en tu cuenta.
          </p>
        </div>

        <div role="radiogroup" aria-label="Tema" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {OPCIONES.map(({ valor, icon: Icon, titulo, descripcion, preview, claseIcono }) => {
            const activo = tema === valor;
            return (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={activo}
                onClick={() => seleccionar(valor)}
                className={`text-left border rounded-lg p-3 transition-all cursor-pointer ${
                  activo
                    ? 'border-[#2383C2] ring-1 ring-[#2383C2] bg-[#2383C2]/5 dark:bg-[#2383C2]/10'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className={`h-16 rounded-md mb-2.5 flex items-center justify-center ${preview}`}>
                  <Icon size={22} className={claseIcono} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-etiqueta text-tinta-principal">{titulo}</p>
                    <p className="text-pequeno text-tinta-secundaria">{descripcion}</p>
                  </div>
                  <div
                    className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${
                      activo ? 'border-[#2383C2] bg-[#2383C2]' : 'border-gray-300 dark:border-gray-600'
                    }`}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AjusteTema;
