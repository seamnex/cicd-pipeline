# Imagen de la status-api.
#
# Base distroless: sin shell, sin gestor de paquetes, sin usuario root. Lo que
# no está en la imagen no puede tener una CVE, y es la diferencia entre un
# reporte de Trivy que se lee en un minuto y uno que nadie lee.
#
# Fijada por digest además del tag: el tag `nonroot` se mueve con cada parche
# de Debian, y un build que hoy pasa el escaneo podría no pasarlo mañana sin
# que nadie haya tocado el repo. Actualizar el digest es un cambio explícito.
FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:b8cec4b2f2126ff7bd034ec9ac207ffb3272667dfdc48376e3b035d3270549ba

# La app no tiene dependencias de runtime, así que no hay `npm ci` ni etapa de
# build: se copia el código y nada más. node_modules (eslint, globals) es solo
# de desarrollo y queda afuera por el .dockerignore.
WORKDIR /app
COPY package.json ./
COPY src/ ./src/

ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION} \
    NODE_ENV=production \
    PORT=8080

EXPOSE 8080

# La base `nonroot` ya corre como 65532, pero el Dockerfile lo dice igual: si
# mañana alguien cambia la base por una que corre como root, el escaneo de
# configuración (Trivy DS-0002) lo frena en vez de dejarlo pasar en silencio.
USER 65532:65532

# Sin curl ni wget en distroless: el healthcheck usa el propio node.
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# El ENTRYPOINT de la base ya es /nodejs/bin/node.
CMD ["src/server.js"]
