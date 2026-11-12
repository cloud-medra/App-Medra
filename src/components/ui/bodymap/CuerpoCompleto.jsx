import CuerpoSVG from './CuerpoSVG';

// Cuerpo completo: vista anterior y posterior lado a lado, del mismo tamaño
// y alineadas, con la referencia discreta del lado del paciente (D / I).
const Marca = ({ children, titulo }) => (
  <span title={titulo} className="text-pequeno text-tinta-atenuada select-none">{children}</span>
);

const Vista = ({ vista, titulo, izquierda, derecha, zonas, lado, compacto }) => (
  <figure className="flex flex-col items-center gap-1.5 min-w-0">
    <figcaption className="text-pequeno uppercase tracking-[0.12em] text-tinta-secundaria">{titulo}</figcaption>
    <div className="w-full flex items-center justify-center gap-1">
      <Marca titulo={izquierda === 'D' ? 'Lado derecho del paciente' : 'Lado izquierdo del paciente'}>{izquierda}</Marca>
      <CuerpoSVG vista={vista} zonas={zonas} lado={lado} titulo={`Cuerpo, vista ${titulo.toLowerCase()}`}
        className={`${compacto ? 'h-[210px]' : 'h-[300px] lg:h-[340px]'} w-auto max-w-[calc(100%-24px)] overflow-visible`} />
      <Marca titulo={derecha === 'D' ? 'Lado derecho del paciente' : 'Lado izquierdo del paciente'}>{derecha}</Marca>
    </div>
  </figure>
);

// `compacto`: más chico (vista previa del editor del Maestro).
const CuerpoCompleto = ({ zonas = [], lado, compacto = false }) => (
  <div className="grid grid-cols-2 gap-4 items-start">
    {/* De frente, el lado derecho del paciente queda a la izquierda. */}
    <Vista vista="anterior" titulo="Anterior" izquierda="D" derecha="I" zonas={zonas} lado={lado} compacto={compacto} />
    <Vista vista="posterior" titulo="Posterior" izquierda="I" derecha="D" zonas={zonas} lado={lado} compacto={compacto} />
  </div>
);

export default CuerpoCompleto;
