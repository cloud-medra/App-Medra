import { defineConfig, loadEnv, normalizePath } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

// Con barras "/" (normalizePath), como llegan los `importer` de Vite también
// en Windows: si no, el medidor no se reconoce a sí mismo y su propio
// `export * from 'firebase/firestore'` se redirige a él (no exporta nada).
const METER_PATH = normalizePath(fileURLToPath(new URL('./src/dev/firestoreMeter.js', import.meta.url)))

// Solo en `npm run dev` (apply: 'serve'): redirige los imports de
// 'firebase/firestore' hechos desde src/ al medidor de lecturas
// (src/dev/firestoreMeter.js). `vite build` nunca aplica este plugin.
// Se desactiva con VITE_FIRESTORE_METER=off en .env.local.
const firestoreMeter = () => ({
  name: 'firestore-meter',
  apply: 'serve',
  enforce: 'pre',
  resolveId(source, importer) {
    if (source !== 'firebase/firestore' || !importer) return null
    if (importer.includes('node_modules') || normalizePath(importer.split('?')[0]) === METER_PATH) return null
    return METER_PATH
  },
})

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const meterActivo = env.VITE_FIRESTORE_METER !== 'off' && !process.env.VITEST
  return {
    plugins: [react(), meterActivo && firestoreMeter()].filter(Boolean),
    // Las pruebas de reglas y funciones necesitan el emulador: npm run test:emulador.
    test: { exclude: [...configDefaults.exclude, 'tests/emulador/**'] },
  }
})
