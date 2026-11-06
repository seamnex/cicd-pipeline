// Punto de entrada del contenedor.
//
// Lo único que hace además de escuchar es apagarse bien: ante SIGTERM marca
// la readiness en 503, espera a que el balanceador lo saque y recién ahí
// cierra el socket. Es la misma carrera que el k8s-lab resolvió con un
// preStop hook, resuelta desde la aplicación.

import { crearApp } from './app.js'

const PUERTO = Number(process.env.PORT ?? 8080)
const VERSION = process.env.APP_VERSION ?? 'dev'
const GRACIA_MS = Number(process.env.SHUTDOWN_GRACE_MS ?? 5000)

let listo = true
const servidor = crearApp({ version: VERSION, listo: () => listo })

servidor.listen(PUERTO, () => {
  console.log(JSON.stringify({ msg: 'escuchando', port: PUERTO, version: VERSION }))
})

process.on('SIGTERM', () => {
  console.log(JSON.stringify({ msg: 'SIGTERM recibido, saliendo del balanceo', grace_ms: GRACIA_MS }))
  listo = false
  setTimeout(() => {
    servidor.close(() => process.exit(0))
    // Si una conexión keep-alive no se cierra sola, no esperamos para siempre.
    servidor.closeIdleConnections()
  }, GRACIA_MS).unref()
})
