# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Firebase Storage: CORS

El dominio principal de la app es **https://app.medra.cl** (también responde en `workcraft-491b7.web.app` y `workcraft-491b7.firebaseapp.com`; el dominio anterior `workcraft.medra.cl` se mantiene durante la transición). El código no tiene el dominio escrito: la configuración de Firebase sale de las variables `VITE_*` de `.env` y los enlaces se arman con `window.location.origin`.

Los archivos (Documentos de implantes, órdenes de compra, Respaldo de documentos y Archivo digital) se suben, se abren y se borran desde el navegador directo contra Storage (`uploadBytesResumable`, `getBlob`, `deleteObject`), así que el bucket debe permitir esos orígenes (`GET`, `HEAD`, `PUT`, `POST`, `DELETE`). La configuración aplicada está en [`cors.json`](cors.json): el dominio principal (y el anterior, mientras dure la transición), los dos de Hosting, el Codespace de desarrollo y `http://localhost:5173`. Si cambia la URL del Codespace, hay que actualizarla en `cors.json` y volver a aplicarlo.

Para aplicarla después de cambiar `cors.json`:

```bash
gcloud storage buckets update gs://workcraft-491b7.firebasestorage.app --cors-file=cors.json
```

Para revisar lo que está aplicado en el bucket:

```bash
gcloud storage buckets describe gs://workcraft-491b7.firebasestorage.app --format="default(cors_config)"
```

Requiere `gcloud` autenticado con una cuenta con permisos sobre el bucket (por ejemplo, desde Cloud Shell). No se aplica con `firebase deploy`.

## Permisos: acciones sensibles

Los permisos granulares (`permisosGranulares`, ver `src/config/componentMaps/`) siguen la regla "sección o acción sin configurar = permitida": así una vista que suma un botón nuevo no se lo quita a quien ya la tenía.

Las **acciones sensibles** (desbloquear, aprobar, rechazar…) son la excepción: **toda acción sensible nueva debe agregarse a `ACCIONES_DENEGADAS_POR_DEFECTO` en [`functions/permisos/nucleo.mjs`](functions/permisos/nucleo.mjs)**. Para no-admin, sin configurar quedan denegadas en `useGranularPermission`, en las Cloud Functions (`puedeAccion`), en plantillas y excepciones (`valorDe`) y en el editor de permisos (las completa desmarcadas; habilitar la vista o "marcar toda la vista" sí las marcan). Admin/dev las tienen siempre. Se validan en Cloud Functions, no en las reglas de Firestore/Storage (lo verifica `src/config/componentMaps/accionesDenegadas.test.js`).
