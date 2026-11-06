// Contador y histograma en el formato de exposición de Prometheus, escritos a
// mano. Una librería de métricas sería la opción normal en un servicio real;
// acá el objetivo es que la imagen no tenga dependencias de runtime.

// Buckets en segundos. Arrancan en 5 ms porque una respuesta en memoria tarda
// menos de 1 ms: buckets más finos no le dirían nada a nadie.
const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1]

export class Metricas {
  constructor() {
    this.peticiones = new Map() // "ruta|codigo" -> cantidad
    this.duraciones = new Map() // ruta -> { buckets[], suma, cantidad }
  }

  registrar(ruta, codigo, segundos) {
    const clave = `${ruta}|${codigo}`
    this.peticiones.set(clave, (this.peticiones.get(clave) ?? 0) + 1)

    let h = this.duraciones.get(ruta)
    if (!h) {
      h = { buckets: BUCKETS.map(() => 0), suma: 0, cantidad: 0 }
      this.duraciones.set(ruta, h)
    }
    BUCKETS.forEach((limite, i) => {
      if (segundos <= limite) h.buckets[i]++
    })
    h.suma += segundos
    h.cantidad++
  }

  exponer() {
    const lineas = [
      '# HELP http_requests_total Peticiones HTTP atendidas, por ruta y código.',
      '# TYPE http_requests_total counter',
    ]
    for (const [clave, n] of this.peticiones) {
      const [ruta, codigo] = clave.split('|')
      lineas.push(`http_requests_total{route="${ruta}",code="${codigo}"} ${n}`)
    }

    lineas.push(
      '# HELP http_request_duration_seconds Latencia de las peticiones HTTP.',
      '# TYPE http_request_duration_seconds histogram',
    )
    for (const [ruta, h] of this.duraciones) {
      BUCKETS.forEach((limite, i) => {
        lineas.push(`http_request_duration_seconds_bucket{route="${ruta}",le="${limite}"} ${h.buckets[i]}`)
      })
      lineas.push(`http_request_duration_seconds_bucket{route="${ruta}",le="+Inf"} ${h.cantidad}`)
      lineas.push(`http_request_duration_seconds_sum{route="${ruta}"} ${h.suma}`)
      lineas.push(`http_request_duration_seconds_count{route="${ruta}"} ${h.cantidad}`)
    }

    return lineas.join('\n') + '\n'
  }
}
