import { useUser } from '../context/UserContext';
import { esExterno } from '../../functions/permisos/nucleo.mjs';
import Dashboard from './Dashboard';
import PlataformaExterna from './PlataformaExterna';

// Tras el login: un usuario externo entra a su pantalla propia. Dashboard lee al
// arrancar datos internos (módulos activos, alertas, tickets, períodos…) que las
// reglas le niegan. El cambio obligatorio de contraseña lo resuelve antes
// ProtectedRoute, igual para internos y externos.
const Plataforma = () => {
  const { userData } = useUser();
  return esExterno(userData) ? <PlataformaExterna /> : <Dashboard />;
};

export default Plataforma;
