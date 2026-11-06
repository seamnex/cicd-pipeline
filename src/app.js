// API de estado mínima: la "app chica" sobre la que corre el pipeline.
//
// Sin dependencias de runtime a propósito. Cada paquete que entra en la
// imagen es superficie que Trivy tiene que escanear y que alguien tiene que
// mantener; para servir cuatro rutas alcanza con node:http.

import { createServer } from 'node:http'
import { Metricas } from './metrics.js'

/**
 * Arma el servidor sin ponerlo a escuchar, para que los tests puedan
 * levantarlo en un puerto efímero y apagarlo al terminar.
 *
 * @param {object} opciones
 * @param {string} opciones.version  versión que reporta /api/v1/status
 * @param {() => boolean} [opciones.listo]  si devuelve false, /readyz responde 503
 */
export function crearApp({ version, listo = () => true }) {
  const metricas = new Metricas()
  const inicio = Date.now()

  const rutas = {
    // Liveness: el proceso responde. No consulta dependencias: si lo hiciera,
    // una base caída haría que el orquestador reinicie pods sanos en loop.
    '/healthz': () => ({ estado: 200, cuerpo: { status: 'ok' } }),

    // Readiness: el proceso puede recibir tráfico. Es la que se pone en 503
    // durante el apagado para salir del balanceo antes de cerrar el socket.
    '/readyz': () =>
      listo()
        ? { estado: 200, cuerpo: { status: 'ready' } }
        : { estado: 503, cuerpo: { status: 'not-ready' } },

    '/api/v1/status': () => ({
      estado: 200,
      cuerpo: {
        service: 'status-api',
        version,
        uptime_seconds: Math.floor((Date.now() - inicio) / 1000),
      },
    }),

    '/metrics': () => ({
      estado: 200,
      tipo: 'text/plain; version=0.0.4; charset=utf-8',
      cuerpo: metricas.exponer(),
    }),
  }

  const servidor = createServer((req, res) => {
    const t0 = process.hrtime.bigint()
    const { pathname } = new URL(req.url, 'http://localhost')
    const handler = req.method === 'GET' ? rutas[pathname] : undefined

    let respuesta
    if (handler) {
      respuesta = handler()
    } else if (rutas[pathname]) {
      respuesta = { estado: 405, cuerpo: { error: 'method not allowed' } }
    } else {
      respuesta = { estado: 404, cuerpo: { error: 'not found' } }
    }

    const tipo = respuesta.tipo ?? 'application/json; charset=utf-8'
    const cuerpo = typeof respuesta.cuerpo === 'string' ? respuesta.cuerpo : JSON.stringify(respuesta.cuerpo)
    res.writeHead(respuesta.estado, { 'content-type': tipo })
    res.end(cuerpo)

    // La ruta se etiqueta solo si existe: etiquetar con el path crudo deja
    // que cualquiera que pida /x1, /x2, /x3... explote la cardinalidad de la
    // serie en Prometheus.
    const ruta = rutas[pathname] ? pathname : 'otra'
    const segundos = Number(process.hrtime.bigint() - t0) / 1e9
    metricas.registrar(ruta, respuesta.estado, segundos)
  })

  return servidor
}
