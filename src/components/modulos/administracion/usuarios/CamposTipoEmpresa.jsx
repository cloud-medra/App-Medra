import { useMemo } from 'react';
import { Building2, Users } from 'lucide-react';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { CampoSelect } from './CamposFormulario';
import { opcionesEmpresa } from './usuariosExternos';
import { TIPOS_USUARIO, TIPO_EXTERNO } from '../../../../../functions/permisos/nucleo.mjs';

// Tipo de usuario y, si es externo, su empresa (Crear usuario y Editar usuario).
export const CamposTipoEmpresa = ({ tipo, empresaId, onCambiarTipo, onCambiarEmpresa, errorEmpresa }) => {
  const { datos: empresas } = useCatalogo('empresas');
  const opciones = useMemo(() => opcionesEmpresa(empresas, empresaId), [empresas, empresaId]);
  const externo = tipo === TIPO_EXTERNO;

  return (
    <>
      <CampoSelect
        id="tipoUsuario" label="Tipo de usuario" icon={Users} opciones={TIPOS_USUARIO} value={tipo}
        onChange={(e) => onCambiarTipo(e.target.value)}
        ayuda={externo ? 'Personal de una empresa externa: rol Operador, sin centro de costo y sin módulos internos.' : 'Personal de la clínica.'}
      />
      {externo && (
        <CampoSelect
          id="empresaId" label="Empresa" icon={Building2} opciones={opciones} value={empresaId} error={errorEmpresa}
          onChange={(e) => onCambiarEmpresa(e.target.value)}
          ayuda="Del Maestro de Empresas. Solo verá los datos de esta empresa."
        />
      )}
    </>
  );
};
