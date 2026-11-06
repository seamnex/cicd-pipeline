import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { crearApp } from '../src/app.js'

// Cada suite levanta el servidor en el puerto 0 (el SO elige uno libre): los
// tests no chocan entre sí ni con algo que ya esté escuchando en el 8080.
function levantar(opciones) {
  const servidor = crearApp(opciones)
  return new Promise((resolve) => {
    servidor.listen(0, () => {
      const { port } = servidor.address()
      resolve({ servidor, url: `http://127.0.0.1:${port}` })
    })
  })
}

describe('rutas', () => {
  let ctx
  before(async () => {
    ctx = await levantar({ version: '1.2.3' })
  })
  after(() => ctx.servidor.close())

  test('/healthz responde 200', async () => {
    const res = await fetch(`${ctx.url}/healthz`)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { status: 'ok' })
  })

  test('/api/v1/status reporta la versión inyectada', async () => {
    const res = await fetch(`${ctx.url}/api/v1/status`)
    const cuerpo = await res.json()
    assert.equal(res.status, 200)
    assert.equal(cuerpo.version, '1.2.3')
    assert.equal(cuerpo.service, 'status-api')
    assert.ok(Number.isInteger(cuerpo.uptime_seconds))
  })

  test('una ruta inexistente devuelve 404', async () => {
    const res = await fetch(`${ctx.url}/no-existe`)
    assert.equal(res.status, 404)
  })

  test('un método no soportado devuelve 405, no 404', async () => {
    const res = await fetch(`${ctx.url}/healthz`, { method: 'POST' })
    assert.equal(res.status, 405)
  })
})

describe('readiness', () => {
  test('/readyz pasa a 503 cuando el proceso deja de estar listo', async () => {
    let listo = true
    const ctx = await levantar({ version: 'test', listo: () => listo })
    try {
      assert.equal((await fetch(`${ctx.url}/readyz`)).status, 200)
      listo = false
      assert.equal((await fetch(`${ctx.url}/readyz`)).status, 503)
      // La liveness no depende de la readiness: el proceso sigue vivo.
      assert.equal((await fetch(`${ctx.url}/healthz`)).status, 200)
    } finally {
      ctx.servidor.close()
    }
  })
})

describe('/metrics', () => {
  test('expone contador e histograma en formato Prometheus', async () => {
    const ctx = await levantar({ version: 'test' })
    try {
      await fetch(`${ctx.url}/healthz`)
      await fetch(`${ctx.url}/healthz`)
      const res = await fetch(`${ctx.url}/metrics`)
      const texto = await res.text()

      assert.match(res.headers.get('content-type'), /^text\/plain/)
      assert.match(texto, /http_requests_total\{route="\/healthz",code="200"\} 2/)
      assert.match(texto, /http_request_duration_seconds_bucket\{route="\/healthz",le="\+Inf"\} 2/)
      assert.match(texto, /# TYPE http_request_duration_seconds histogram/)
    } finally {
      ctx.servidor.close()
    }
  })

  test('las rutas desconocidas comparten una sola etiqueta', async () => {
    const ctx = await levantar({ version: 'test' })
    try {
      for (const p of ['/a', '/b', '/c']) await fetch(`${ctx.url}${p}`)
      const texto = await (await fetch(`${ctx.url}/metrics`)).text()

      // Tres paths distintos, una sola serie: así un escaneo de URLs no
      // genera una serie nueva por cada path que inventa.
      assert.match(texto, /http_requests_total\{route="otra",code="404"\} 3/)
      assert.doesNotMatch(texto, /route="\/a"/)
    } finally {
      ctx.servidor.close()
    }
  })
})
