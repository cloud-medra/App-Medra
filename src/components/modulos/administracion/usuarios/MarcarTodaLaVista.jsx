// Fila "Marcar todo / Desmarcar todo" de una vista o pestaña en el árbol de
// permisos granulares (PanelPermisosVista, en Crear y Editar usuario).
// estado: 'todo' | 'nada' | 'parcial' (ver estadoMarcadoVista).
const MarcarTodaLaVista = ({ estado, onMarcar }) => (
  <div className="flex items-center justify-end gap-2 text-pequeno">
    <span className="text-tinta-atenuada mr-auto">
      {estado === 'todo' ? 'Todas las secciones y acciones permitidas' : estado === 'nada' ? 'Sin secciones ni acciones' : 'Permisos parciales'}
    </span>
    <button
      type="button"
      onClick={() => onMarcar(true)}
      disabled={estado === 'todo'}
      className="text-etiqueta text-[#2383C2] hover:underline disabled:text-tinta-atenuada disabled:no-underline disabled:cursor-default"
    >
      Marcar todo
    </button>
    <span className="text-tinta-atenuada">·</span>
    <button
      type="button"
      onClick={() => onMarcar(false)}
      disabled={estado === 'nada'}
      className="text-etiqueta text-red-500 hover:underline disabled:text-tinta-atenuada disabled:no-underline disabled:cursor-default"
    >
      Desmarcar todo
    </button>
  </div>
);

export default MarcarTodaLaVista;
