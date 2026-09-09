# Menú digital — FASES 1 a 8

Plataforma SaaS multiempresa para consultar y administrar menús. FASE 8 añade un código QR descargable que abre la URL pública canónica de cada negocio. No incluye pedidos, carrito ni pagos.

## Arquitectura

React + Vite (JavaScript) → Netlify → Netlify Functions → Neon PostgreSQL.

- `src/`: frontend público, React Router, componentes de menú y cliente HTTP con fetch.
- `netlify/functions/`: endpoints serverless health, public-menu, public-category y public-product.
- `netlify/lib/`: configuración, cliente de base de datos, JSON y errores.
- `database/migrations/`: migraciones SQL versionadas.
- `scripts/migrate.js`: ejecutor de migraciones desde Node.
- `tests/`: pruebas con PostgreSQL embebido PGlite, exclusivamente de desarrollo.

No existe un servidor Express propio. Functions usa el driver HTTP de Neon, reutilizado entre invocaciones, con consultas parametrizadas y timeout de 5 segundos. Las migraciones usan el mismo driver en modo WebSocket para mantener una sesión y transacción. `ws` solamente se importa desde los scripts de migración y seed de desarrollo.

## Requisitos

- Node.js 22.12 o superior (recomendado Node 22 actualizado), npm.
- Cuenta Neon y base PostgreSQL para pruebas conectadas.
- Cuenta Netlify cuando se despliegue.

## Instalación

```sh
npm install
```

Se incluye `package-lock.json`. En CI se puede usar `npm ci`.

## Variables de entorno

Copia `.env.example` a `.env` en la raíz (PowerShell: `Copy-Item .env.example .env`).

- `DATABASE_URL`: cadena de conexión obtenida desde **Connect** en el proyecto Neon. Debe incluir usuario, contraseña, base y `sslmode=require` o `sslmode=verify-full`. Nunca compartirla en capturas, commits o mensajes.
- `AUTH_SECRET`: secreto exclusivo del servidor, de al menos 32 caracteres, usado para firmar sesiones. Puede generarse sin imprimirlo en el historial del repositorio con `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"` y copiarse directamente a la configuración privada del entorno.
- `NODE_ENV`: `development` localmente; Netlify y Vite gestionan el modo de producción en el build. No fijar `development` en el sitio de producción.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` y `CLOUDINARY_API_SECRET`: credenciales exclusivas de Functions para firmar y verificar imágenes. El secreto nunca se expone a React.
- `PUBLIC_SITE_URL`: origen público canónico, sin slash final, que se utilizará en los QR (por ejemplo `https://mi-menu.netlify.app`). No es secreto, pero debe apuntar a una dirección estable antes de imprimir. En desarrollo puede usar una IP LAN como `http://192.168.1.91:8892`; el panel la marcará como local.

El script carga `.env` con Node y Netlify Dev también la detecta. Las variables ya presentes en el proceso tienen precedencia. No se incluye ninguna credencial en los archivos versionables. La configuración local debe mantenerse privada.

En Netlify, configurar `DATABASE_URL`, `AUTH_SECRET`, `PUBLIC_SITE_URL` y `NODE_ENV` en las variables del proyecto, con alcance **Functions**, para los contextos necesarios, y volver a desplegar. `PUBLIC_SITE_URL` puede ser inicialmente la URL estable `https://nombre-del-sitio.netlify.app` o un dominio personalizado. No escribir secretos en `netlify.toml`; no son necesarios para compilar React. Usar una base o rama de desarrollo para pruebas y previews.

**DATABASE_URL nunca debe estar disponible en React. No crear VITE_DATABASE_URL ni otras variables VITE_* con secretos.** Los módulos de `netlify/` no deben importarse desde `src/`. `.env` y sus variantes están ignoradas por Git; solo `.env.example` se versiona.

## Base de datos y migraciones

```sh
npm run db:migrate
npm run db:migrate
```

La segunda ejecución debe indicar `Sin migraciones pendientes.`

La migración 001 permanece intacta; FASE 2 no necesita una migración adicional. El ejecutor detecta archivos `NNN_nombre.sql`, ordena por nombre, utiliza un bloqueo transaccional PostgreSQL, compara checksums SHA-256 y ejecuta todas las migraciones pendientes en una transacción. Registra filename, checksum y executed_at en `schema_migrations`. Si falla cualquiera, revierte todos los cambios de esa ejecución y termina con código distinto de cero. Las migraciones ya confirmadas en ejecuciones anteriores permanecen aplicadas.

Usar prefijos de tres dígitos consecutivos (`001`, `002`, etc.). No modificar ni retirar migraciones aplicadas; crear una nueva. Se rechazan archivos aplicados modificados, faltantes o migraciones agregadas fuera de orden. Los archivos SQL son código confiable del repositorio, no entradas del navegador. No agregar BEGIN/COMMIT ni operaciones incompatibles con transacciones dentro de ellos. No hay reset, borrado de base ni seed automático.

Para ejecutar migraciones en producción, usar un entorno seguro de administración/CI con la variable del servidor. No se ejecutan en el build de Netlify ni desde endpoints públicos.

### Modelo

Todas las PK utilizan `BIGINT GENERATED ALWAYS AS IDENTITY`. Los timestamps son `TIMESTAMPTZ`; una función PostgreSQL `update_updated_at_column()` y seis triggers mantienen `updated_at` usando `clock_timestamp()`.

| Tabla | Relación / reglas principales |
| --- | --- |
| businesses | Nombre obligatorio, slug único en minúsculas apto para URL, estado activo |
| users | Pertenece a business; email normalizado en minúsculas, único globalmente desde la migración 002; password_hash; role TEXT con OWNER por defecto |
| categories | Pertenece a business; orden y estado activo |
| products | Pertenece a business y category de la misma empresa; precio base obligatorio |
| product_variants | Pertenece a business y product de la misma empresa; precio propio |
| promotions | Pertenece a business; precio y fechas opcionales; rango temporal válido |

Los precios usan `NUMERIC(12,2)`, rechazan negativos y NaN. El orden es entero no negativo. `ends_at >= starts_at` cuando ambas fechas existen. Las eliminaciones de negocios y padres propagan `ON DELETE CASCADE`: en futuras fases, preferir desactivación para operaciones ordinarias y revisar cualquier borrado explícito. No hay endpoints de borrado.

Hay siete FK. Las FK compuestas `(business_id, category_id)` y `(business_id, product_id)` impiden referencias cruzadas entre empresas incluso fuera del backend. Los índices cubren business_id, category_id, product_id, disponibilidad, estado y orden. Los índices compuestos con business_id al inicio cubren búsquedas por empresa sin duplicar índices individuales; users usa su índice único `(business_id, email)`.

No hay usuarios ni contraseñas de prueba persistentes. `password_hash` exige un valor no vacío; en una futura fase el backend deberá generar un hash con un algoritmo apropiado, nunca guardar la contraseña como valor del campo. El esquema por sí solo no puede demostrar que un texto sea un hash seguro. El login futuro deberá considerar que la unicidad de email es por empresa. Los BIGINT deben serializarse como cadenas si exceden el entero seguro de JavaScript; los decimales requieren conservar su precisión.

### Aislamiento multiempresa

`slug` identifica el negocio en las URLs públicas /:slug. `business_id` delimita los datos de cada empresa. Nunca hacer consultas administrativas únicamente por ID:

```js
// Solo en servidor: businessId debe derivarse de la sesión validada futura.
await query('SELECT * FROM products WHERE id = $1 AND business_id = $2', [productId, businessId]);
```

Esta regla aplica también a UPDATE, DELETE, listas, relaciones y validaciones. Nunca confiar en un business_id enviado libremente por el navegador. Desde FASE 5, el backend administrativo deriva el negocio del usuario autenticado y vuelve a validar usuario, rol y negocio en PostgreSQL. Las FK protegen integridad, no sustituyen la autorización de lectura. No exponer CRUD hasta implementar su autorización en una fase posterior. No concatenar valores de usuario en SQL.

## Desarrollo

```sh
npm run dev
```

React en http://localhost:5173. Este comando solo ejecuta Vite; no sirve Functions.

Para probar frontend y API juntos:

```sh
npm run dev:netlify
```

Abrir http://localhost:8888. Netlify Dev ejecuta Vite y Functions y aplica los redirects. No hace falta desplegar para probar localmente. La primera ejecución de la CLI puede descargar herramientas auxiliares. `netlify.toml` declara explícitamente el directorio de Functions tanto para build como para dev. La regla `/api/*` precede al fallback SPA; una API inexistente devuelve 404, no el HTML de React.

El cliente `src/services/api.js` se usa como `await api('/health')`. Admite las opciones de fetch (headers, method, body, signal), devuelve JSON o null para 204 y lanza ApiError para HTTP no exitoso o JSON inválido. Para futuros cuerpos JSON, usar JSON.stringify y Content-Type application/json. Los errores de red conservan el comportamiento de fetch.

## Build

```sh
npm run build
npm run preview
```

`npm run build` establece NODE_ENV=production antes de iniciar Vite para que una .env de desarrollo no incluya React en modo de desarrollo. `dist/` contiene solo el frontend. `preview` verifica el build estático y no ejecuta Functions. Netlify usa `npm run build`, publica `dist` y empaqueta `netlify/functions` con esbuild. No se ha desplegado ningún sitio desde esta fase.

## Endpoint

`GET /api/health`

- 200: `{"ok":true,"service":"digital-menu-api","database":"connected"}` tras ejecutar SELECT 1.
- 503: `{"ok":false,"service":"digital-menu-api","database":"unavailable"}` si falta configuración o falla PostgreSQL.
- Otros métodos: 405 con `Allow: GET`.

Respuestas JSON sin caché, sin CORS abierto, sin stack, URL, host o credenciales. Los logs internos registran contexto y código sanitizado, no mensajes del driver. El health verifica conectividad, no que las migraciones estén aplicadas.

## Validaciones

```sh
npm test
npm run build
npx netlify functions:build --src netlify/functions --functions .netlify/functions-build
npm audit --omit=dev
```

Las pruebas ejecutan el SQL real sobre PGlite (PostgreSQL embebido) y verifican doble migración, rollback, checksum, tablas, FK, índices, restricciones, cascadas, updated_at, health y fetch. No necesitan secretos y no tocan Neon. La validación concurrente de varias conexiones y el transporte HTTP/WebSocket hacia Neon requieren una base real.

Para aceptación conectada, configurar DATABASE_URL, ejecutar dos veces db:migrate y consultar http://localhost:8888/api/health; debe devolver 200 con database connected. Revisar tablas e índices en el SQL Editor de Neon. Las pruebas locales no sustituyen este paso.

## Problemas del entorno observados

En esta máquina el lanzador npm resolvía una instalación global incompleta. Se ejecutó el npm oficial instalado mediante `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js"`. Una alternativa temporal en PowerShell es `$env:NPM_CONFIG_PREFIX = 'C:\Program Files\nodejs'` antes de usar npm. No se modificó la configuración global. Si ocurre en otra máquina, reparar la instalación de Node/npm.

La auditoría de dependencias de desarrollo señala 10 alertas altas derivadas de `sharp` y `toml` en Netlify CLI 27.5.0. `npm audit fix` no las resolvió; la opción force propone degradar la CLI a 5.3.1 y no se aplicó. Revisar futuras versiones de la CLI. Estas dependencias no se importan desde React ni desde la Function.

## Referencias oficiales

- [Vite: instalación y requisitos](https://vite.dev/guide/)
- [Neon: driver serverless](https://neon.com/docs/serverless/serverless-driver)
- [Netlify: configuración de Functions](https://docs.netlify.com/build/functions/configuration/)
- [Netlify: desarrollo local](https://docs.netlify.com/api-and-cli-guides/cli-guides/local-development/)

## FASE 2: menú público

Flujo: `/:slug` → `getPublicMenu(slug)` → `GET /api/public-menu?slug=...` → consultas parametrizadas del servidor a Neon → negocio y categorías.

La pantalla obtiene todos los datos del negocio y categorías desde la API; no hay un menú demo embebido en React. La ruta `/` explica cómo acceder con el QR del establecimiento. Las rutas desconocidas muestran una página de menú no encontrado. Desde FASE 3, las tarjetas son enlaces reales a /:slug/categoria/:categoryId.

### Contrato de API

`GET /api/public-menu?slug=negocio-demo`

| HTTP | Respuesta |
| --- | --- |
| 200 | `{ ok: true, business: {...}, categories: [...] }` |
| 400 | `{ ok: false, error: "INVALID_REQUEST" }` |
| 404 | `{ ok: false, error: "BUSINESS_NOT_FOUND" }` |
| 405 | `{ ok: false, error: "METHOD_NOT_ALLOWED" }`, con Allow: GET |
| 503 | `{ ok: false, error: "SERVICE_UNAVAILABLE" }` |

El slug se recorta y normaliza a minúsculas; acepta de 1 a 120 caracteres ASCII alfanuméricos separados por guiones simples. Se rechazan slugs vacíos, parámetros repetidos y formatos inválidos antes de consultar PostgreSQL.

Solo se obtiene un negocio activo. Las categorías se consultan con su business_id obtenido del servidor y active=true, ordenadas por sort_order e id ascendentes. Un negocio inactivo responde igual que uno inexistente. Un negocio sin categorías devuelve 200 con un array vacío.

Business expone únicamente name, slug, logo_url, cover_url, description, address y phone. Las categorías exponen id, name, image_url y sort_order. Los IDs se devuelven como cadenas para conservar toda la precisión BIGINT. No se exponen business_id, timestamps, usuarios ni credenciales.

La respuesta pública no tiene caché. No hay CORS abierto ni nueva conexión a PostgreSQL: se reutiliza netlify/lib/db.js. El health conserva su contrato original.

### Interfaz

- Portada con imagen decorativa y overlay; altura móvil de 210–260 px.
- Logo con object-fit: contain, o iniciales si falta o falla.
- Nombre, mensaje “¿Qué te podemos preparar?”, descripción de hasta tres líneas y dirección discreta de hasta dos líneas.
- Categorías con imágenes object-fit: cover, carga diferida, títulos legibles y espacios reservados. No hay interacción de productos.
- Una columna en móvil; dos a partir de 768 px. Los nombres largos pueden aumentar la altura de las tarjetas.
- Fallbacks CSS sin URLs externas, tanto para imágenes ausentes como rotas. Solo se admiten URLs HTTP(S) o rutas locales absolutas, sin credenciales incrustadas.
- Skeleton de portada, identidad y tres tarjetas; estados de menú no encontrado, error con Reintentar y negocio sin categorías.
- AbortController cancela peticiones al cambiar de negocio o desmontar la página, evitando respuestas atrasadas de otra empresa. El título del documento se actualiza con el nombre.
- Tipografía del sistema, variables CSS, HTML semántico, foco visible y ausencia de animaciones continuas.

### Datos de desarrollo

Después de migrar, con una base de desarrollo y NODE_ENV=development:

```sh
npm run db:seed
```

El seed es opcional, no se ejecuta automáticamente y rechaza producción. Crea Negocio Demo (`negocio-demo`) y las categorías Cervezas, Preparadas, Botanas y Comida. Usa una transacción y bloqueo. Completa categorías y productos demo faltantes sin sobrescribir registros existentes; ejecutarlo dos veces no duplica registros. Rechaza un negocio con ese slug si su nombre no es Negocio Demo. No crea usuarios ni contraseñas.

Las imágenes quedan NULL deliberadamente para comprobar los fallbacks, sin servicios externos. Los campos de imagen existentes admiten URLs cuando haya fotografías disponibles; no se implementó subida de archivos.

### Prueba local conectada

```sh
npm run db:migrate
npm run db:seed
npx netlify dev --port 8889
```

Abrir `http://localhost:8889/negocio-demo`, `http://localhost:8889/api/public-menu?slug=negocio-demo` y `http://localhost:8889/api/health`. Usar el puerto de Netlify, no el interno de Vite. Si cambias .env, reinicia la instancia para que Functions reciba los cambios.

Durante la implementación los puertos 8889 y 5174 estaban ocupados. Se verificó una instancia independiente de Netlify en **8890**, con Vite interno en 5197 y carga explícita de .env, sin detener los servidores existentes:

```sh
node --env-file-if-exists=.env node_modules/netlify-cli/bin/run.js dev --port 8890 --target-port 5197 --command "node node_modules/vite/bin/vite.js --port 5197 --strictPort" --no-open
```

### Pruebas de FASE 2

La suite original de FASES 1 y 2 contiene 15 pruebas; la suite completa actual se documenta en FASE 3. Mantiene node:test; PGlite prueba SQL real y jsdom prueba componentes React. esbuild transforma JSX exclusivamente para las pruebas en .netlify/tests; jsdom y esbuild son dependencias de desarrollo.

Se verifican slugs, métodos, actividad, aislamiento, orden estable, errores sanitizados, seed repetible, rutas, skeleton, estados vacío/404/error, reintento, imágenes rotas, título y cancelación de peticiones entre negocios.

El banco visual `/tests/fixtures/menu.html?state=...`, servido solo durante desarrollo, acepta `success`, `images`, `broken`, `long`, `loading`, `empty`, `not-found` y `error`. Contiene datos simulados e ilustración SVG de prueba fuera de src y public. No se incluye en dist y no debe usarse como menú real. El escenario error permite comprobar la recuperación con Reintentar. No requiere escribir datos adicionales en Neon.

Verificación realizada el 7 de septiembre de 2026: health y public-menu respondieron 200 desde Neon a través de Netlify Dev; migraciones y seed ejecutados dos veces sin duplicación. Se revisaron 320, 375, 390, 430, 768, 1024 y 1440 px, además de imágenes cargadas/rotas y textos largos. Se corrigieron el ancho de tarjetas y el recorte de títulos extensos. Esta verificación corresponde al cierre original de FASE 2.

Referencia de routing: [React Router — rutas declarativas](https://reactrouter.com/start/declarative/routing).

## FASE 3: categorías y productos

Flujo: /:slug → enlace de categoría → /:slug/categoria/:categoryId → getPublicCategory → GET /api/public-category → Neon. Volver al menú usa una ruta explícita, incluso al abrir un enlace directo.

### API y aislamiento

GET /api/public-category?slug=negocio-demo&category_id=2 (usar siempre el ID devuelto por public-menu).

- slug: misma normalización y validación que public-menu.
- category_id: cadena decimal canónica positiva, sin espacios ni ceros iniciales, hasta 9223372036854775807; nunca se convierte a Number. Parámetros repetidos se rechazan.
- 200: { ok: true, business: { name, slug, logo_url }, category: { id, name, image_url }, products: [{ id, name, description, price, image_url, available, featured, sort_order }] }.
- 400 INVALID_REQUEST; 404 BUSINESS_NOT_FOUND o CATEGORY_NOT_FOUND; 405 METHOD_NOT_ALLOWED con Allow: GET; 503 SERVICE_UNAVAILABLE.

Primero se resuelve el negocio activo por slug. La categoría debe estar activa y pertenecer a ese negocio; una categoría ajena devuelve el mismo 404 que una inexistente. Los productos se filtran simultáneamente por business_id y category_id, incluyendo agotados. Orden: featured descendente, sort_order ascendente e ID numérico ascendente. Se califican las columnas SQL para que el alias público id::text no cause orden lexicográfico.

IDs BIGINT y precios NUMERIC viajan como cadenas. Las consultas usan parámetros; la respuesta proyecta únicamente campos públicos y no expone business_id, credenciales, SQL ni trazas. Se conserva la conexión compartida, respuesta sin caché y ausencia de CORS abierto. DATABASE_URL permanece solo en el servidor.

### Interfaz y estados

Encabezado compacto con logo pequeño, nombre del negocio, volver y título de categoría. Lista de una columna con imágenes pequeñas lazy y fallback, nombre y descripción limitados a dos líneas, precio exacto por operaciones de cadenas, etiquetas Recomendado y Agotado. Los agotados siguen visibles y legibles. Desde FASE 4, las filas son enlaces al detalle del producto, incluidos los agotados.

Búsqueda local por nombre y descripción, insensible a mayúsculas y acentos, con espacios normalizados; todas las palabras deben coincidir. Conserva el orden de la API, muestra conteo y permite limpiar recuperando el foco. No dispara solicitudes.

Estados independientes: skeleton de cinco filas, lista, categoría vacía, búsqueda sin resultados, categoría inexistente, negocio inexistente y error recuperable con Reintentar. AbortController y el componente identificado por ruta evitan respuestas atrasadas y reinician búsqueda al cambiar de categoría. Controles de 44 px, etiquetas accesibles, foco visible y campo de búsqueda de 16 px.

### Seed y base de datos

No hay nueva migración. 001_initial_schema.sql conserva SHA256 1f3b3aea744277196fb0e5a824f6258fb159375e99a2235ed534f90e4d8d36bb.

El seed agrega 14 productos ficticios en las cuatro categorías: cuatro cervezas, cuatro preparadas, tres botanas y tres comidas. Incluye Michelada Especial, Nachos y Modelo Especial recomendados; Azulito agotado; descripciones nulas y precios decimales. Imágenes NULL para validar fallbacks. Es transaccional, exclusivo de desarrollo e idempotente por negocio/categoría/nombre; añade faltantes sin actualizar productos existentes. No crea usuarios.

### Validación de FASE 3

7 de septiembre de 2026: npm test pasa 51 pruebas (27 principales y 24 subpruebas), sin fallos; npm run build termina correctamente. Cubre validación, métodos, tres consultas fallidas, aislamiento con PostgreSQL embebido, BIGINT por encima de precisión Number, precios exactos, orden numérico, seed repetido/rollback, rutas, búsqueda sin red, estados, reintentos y cancelación.

Neon mediante Netlify Dev en puerto 8890: health, public-menu y public-category responden 200. Migraciones sin pendientes; seed ejecutado dos veces y 14 productos sin duplicación. Preparadas devuelve productos reales, incluidos precio decimal, recomendado, agotado y descripción NULL.

Revisión visual: 320, 375, 390, 430, 768, 1024 y 1440 px, sin desbordamiento horizontal. Se comprobaron búsqueda y limpieza, textos extensos, precio máximo, imágenes cargadas/rotas, skeleton, vacíos y errores. Fixture solo de desarrollo: /tests/fixtures/category.html?state=success; también images, broken, long, loading, empty, not-found, business-not-found y error. El último permite reintentar. Los datos simulados y SVG quedan fuera del bundle de producción.

Sin nuevas dependencias. El cierre de FASE 3 dejó los detalles y variantes para FASE 4, documentada a continuación.

## FASE 4: detalle público y presentaciones

Flujo: negocio → categoría → listado → detalle → presentaciones. Nueva ruta React Router: /:slug/categoria/:categoryId/producto/:productId. Todas las filas del listado navegan, también las agotadas. El regreso usa el enlace explícito a la categoría y funciona desde acceso directo.

### API pública

GET /api/public-product?slug=negocio-demo&category_id=ID_REAL&product_id=ID_REAL

Obtén los IDs desde public-menu y public-category; no los supongas. El slug utiliza la normalización existente. category_id y product_id son cadenas decimales canónicas positivas de hasta 9223372036854775807, sin conversión a Number. Se rechazan parámetros ausentes, repetidos, decimales, negativos, espacios y formatos no canónicos.

| HTTP | Resultado |
| --- | --- |
| 200 | ok, business, category, product, variants |
| 400 | INVALID_REQUEST |
| 404 | BUSINESS_NOT_FOUND, CATEGORY_NOT_FOUND o PRODUCT_NOT_FOUND |
| 405 | METHOD_NOT_ALLOWED; Allow: GET |
| 503 | SERVICE_UNAVAILABLE |

Campos públicos:

- business: name, slug, logo_url.
- category: id, name.
- product: id, name, description, price, image_url, available, featured.
- variants: id, name, price, sort_order.

Se valida en orden el negocio activo, la categoría activa perteneciente al negocio y el producto perteneciente al negocio y categoría. Después se consultan variantes activas por business_id y product_id. Una relación ajena devuelve 404 sin revelar información del otro negocio. Productos available=false conservan detalle y variantes. No se inventa una columna active en products.

Las variantes se ordenan por sort_order y por ID numérico original, ambos ascendentes. No se exponen business_id, product_id interno, active, timestamps ni credenciales. SQL parametrizado, conexión compartida, errores sanitizados, Cache-Control: no-store y sin CORS abierto.

### Interfaz

Encabezado con regreso de 44 px y negocio discreto; imagen principal eager con alt y object-fit: cover, proporción móvil 4:3, radio existente y altura máxima de 420 px. MenuImage reutiliza iniciales y fondo neutral cuando falta o falla la imagen.

Nombre completo h1, precio con formatPrice sin operaciones float, descripción completa como texto con saltos de línea y omisión si es NULL. Recomendado conserva el estilo del listado. Agotado aparece junto a la información principal; Disponible es discreto. Si hay variantes se muestra Precio base y una sección Presentaciones con filas informativas; si no, la sección se omite. No se calcula ni muestra Desde.

No hay selectores de variantes, cantidades, botones de pedido, ingredientes inventados ni controles de compra. Se conserva el diseño de las fases anteriores; únicamente se añade la navegación necesaria al listado. Contenedor máximo 800 px y scroll natural.

Skeleton específico de encabezado, imagen, título, precio, descripción y variantes. Estados separados para producto/categoría/negocio no encontrados y error con reintento real. La respuesta PRODUCT_NOT_FOUND solo se emite tras validar categoría, por lo que permite regresar a ella. BUSINESS_NOT_FOUND no ofrece rutas posiblemente inválidas. AbortController y reinicio por ruta descartan respuestas atrasadas; document.title refleja producto y negocio.

### Seed y migraciones

Sin migración nueva; 001_initial_schema.sql conserva el SHA256 documentado. El seed añade 11 variantes sin actualizar productos ni variantes existentes: Michelada Clásica (3 activas y 1 inactiva de temporada), Modelo Especial recomendado (2), Alitas (3), Azulito agotado (2). Cubana y otros productos no tienen variantes.

Se conserva transacción, bloqueo de concurrencia y restricción a desarrollo. El seed busca por negocio, categoría, producto y nombre; rechaza productos ambiguos antes de añadir variantes. Una segunda ejecución no duplica registros ni altera ediciones manuales.

### Verificación de FASE 4 — 7 de septiembre de 2026

Antes de editar: 51 pruebas y build aprobados; health, public-menu y public-category respondían 200. Después: npm test pasa 100 pruebas (38 principales y 62 subpruebas), cero fallos; npm run build correcto. Sin dependencias nuevas. PGlite verifica SQL real, aislamiento, orden numérico, precisión, exclusión de variantes inactivas, errores y rollback del seed. jsdom verifica enlaces, estados, imagen/fallback, descripciones completas, variantes, regreso, cancelación y título.

Neon real: migraciones sin pendientes, seed ejecutado dos veces, 11 variantes (1 inactiva) sin duplicación. health/public-menu/public-category continúan 200; public-product devuelve 200 para los 14 productos, con las variantes esperadas y sin la inactiva. Se obtuvieron los IDs reales de las APIs anteriores. Netlify Dev existente en 8890 se reutilizó sin detener otros procesos.

Revisión visual en 320, 375, 390, 430, 768, 1024 y 1440 px: sin scroll horizontal, precios dentro del viewport y contenedor limitado en escritorio. Se revisan nombres y descripción largos, precio máximo, agotados, con/sin variantes, imagen/fallback, carga y errores. Fixture exclusivo de desarrollo: /tests/fixtures/product.html?state=success; escenarios images, broken, long, sold-out, no-variants, loading, not-found, category-not-found, business-not-found y error. Error permite recuperar con Reintentar. Fixtures fuera del build público.

La comprobación inicial de loading en jsdom se corrigió para leer el atributo HTML mediante getAttribute; no requirió cambios de comportamiento en la aplicación. No se detectaron defectos visuales pendientes. La revisión del bundle no encontró DATABASE_URL, URLs PostgreSQL, host Neon ni datos ficticios del fixture.

El despliegue público y fotografías definitivas permanecen fuera de este alcance.

## Ajuste visual del detalle — 8 de septiembre de 2026

Ajuste de composición, sin nueva fase ni cambios de API, base, seed, rutas o lógica. El hero comienza en el borde superior, ocupa el ancho del contenedor y mide entre 280 y 380 px. El enlace circular de regreso queda sobre la foto, con área de 44 px, nombre accesible y foco visible.

El panel se superpone 36 px y tiene radios superiores de 34 px. El fondo cálido pasa de una transparencia sutil al color sólido en los primeros 72 px, con backdrop-filter y prefijo WebKit de 18 px. Sin soporte, conserva el fondo sólido. El contenido mantiene scroll normal. Precio base y nombre de categoría siguen disponibles para lectores de pantalla, pero no recargan la cabecera visual.

Se revisaron 320, 375, 390, 430, 768 y 1024 px con fotografía: sin desbordamiento, y ancho máximo de 800 px. También se comprobaron fallback, imagen rota, texto largo, precio máximo, estados y skeleton. npm test: 100 aprobadas, cero fallos. npm run build: correcto.

Fixture fotográfico de revisión: /tests/fixtures/product.html?state=photo. Usa una [fotografía de Pavel Danilyuk en Pexels](https://www.pexels.com/photo/beer-bottle-on-top-of-a-beer-glass-5858169/); requiere conexión y permanece fuera del build público. Es material de prueba, no una fotografía asignada a los productos en Neon. El fixture SVG local sigue disponible con state=images.

## Ajuste visual de portada pública — 8 de septiembre de 2026

La portada /:slug usa un frame máximo de 880 px sin padding alrededor del hero. En móvil, la foto comienza en (0, 0), cubre el ancho disponible y mide 230–320 px; object-fit: cover y object-position: center. Una capa sobre la portada desvanece gradualmente la imagen hacia var(--background), también en el fallback. El logo de 68 px queda superpuesto a la transición y la identidad tiene espacios más compactos.

Categorías: margen móvil de 12 px, separación de 10 px, altura mínima de 120–146 px (150 px en escritorio), radios de 14 px, nombres centrados y números decorativos ocultos. Los nombres excepcionalmente largos pueden aumentar la altura para conservar su lectura. Las fotos cubren toda la tarjeta y el degradado protege el texto. Se mantiene la cuadrícula de dos columnas desde 768 px.

Los estilos están delimitados por .public-menu-page y no cambian la apariencia del listado o detalle. No se modificaron APIs, datos, seed ni migraciones. Pruebas: 100 aprobadas, build correcto. Revisión visual en 320, 375, 390, 430, 768 y 1024 px, con fotografía y fallbacks; sin desbordamiento horizontal.

Fixture local: /tests/fixtures/menu.html?state=photo utiliza tests/fixtures/beer-photo.jpg (Pavel Danilyuk, Pexels, foto 5858169; fuente enlazada en el ajuste anterior). Portada y categorías usan el archivo local exclusivamente en desarrollo. Ninguna URL fotográfica se añadió a React de producción o Neon. Los escenarios success y long permiten revisar imágenes ausentes y textos extensos.

## FASE 5: autenticación y panel privado

Las rutas administrativas se declaran antes de `/:slug`, por lo que `/admin` nunca se interpreta como un negocio público. `/admin/login` muestra el formulario accesible de correo y contraseña; `/admin` usa `ProtectedRoute`, restaura la sesión con `GET /api/auth/me` y evita mostrar el panel antes de verificarla. El panel muestra OWNER, negocio, categorías, productos, disponibles, agotados y recomendados, además de enlaces reales para abrir el menú público y cerrar sesión. No hay controles de CRUD ni opciones futuras simuladas.

### Sesión y seguridad

Las contraseñas se procesan con `bcryptjs` (coste 12). Para crear un OWNER se exige un mínimo de ocho caracteres, al menos una letra y un número, y se rechazan valores que bcrypt truncaría. El login normaliza el correo con `trim().toLowerCase()`, usa SQL parametrizado y devuelve la misma respuesta `401 INVALID_CREDENTIALS` para usuario inexistente, contraseña incorrecta, usuario inactivo o negocio inactivo.

La sesión es un JWT HS256 firmado con `jose`, limitado a `sub`, `business_id`, `role`, `iat` y `exp`, con duración de ocho horas. Se entrega únicamente en la cookie `menu_session`: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=28800` y `Secure` fuera de Netlify Dev por HTTP. El token no aparece en JSON y no se guarda en `localStorage` ni `sessionStorage`.

Cada endpoint privado verifica firma, expiración, issuer, audience y claims; después vuelve a consultar PostgreSQL para comprobar que el usuario existe, sigue activo, conserva el mismo `business_id`, tiene rol `OWNER` y pertenece a un negocio activo. No existe un secreto predeterminado: un `AUTH_SECRET` ausente o menor de 32 caracteres produce un error de servicio sanitizado.

Las operaciones POST rechazan orígenes cruzados cuando el navegador envía `Origin` o `Sec-Fetch-Site`. Para esta fase, APIs same-origin más `SameSite=Lax` son la defensa CSRF deliberada; no se añade infraestructura CSRF adicional. Un rate limit en memoria no sería confiable en Functions serverless y queda como hardening futuro con infraestructura compartida.

### API privada

| Método y ruta | Resultado |
| --- | --- |
| `POST /api/auth/login` | Valida credenciales, crea la cookie y devuelve solo identidad pública de usuario y negocio. |
| `GET /api/auth/me` | Reconstruye la sesión desde la cookie y revalida usuario y negocio en PostgreSQL. |
| `POST /api/auth/logout` | Expira la cookie de forma idempotente, incluso sin una sesión válida. |
| `GET /api/admin/overview` | Requiere OWNER y devuelve negocio más conteos aislados por empresa. |

`GET /api/admin/overview` no acepta `business_id` como fuente de autorización. El servidor obtiene el ID desde el usuario revalidado y todas las consultas de resumen incluyen `WHERE business_id = $1`. Un parámetro `business_id` enviado por el cliente se ignora.

### Crear el OWNER inicial

La migración `002_unique_user_email_case_insensitive.sql` agrega un índice único global sobre `lower(email)` sin borrar ni modificar filas. Si ya hubiera correos duplicados por mayúsculas/minúsculas, la migración falla y revierte para que puedan revisarse manualmente. `001_initial_schema.sql` permanece intacta.

Después de migrar, define temporalmente `OWNER_NAME`, `OWNER_EMAIL`, `OWNER_PASSWORD` y `OWNER_BUSINESS_SLUG` en el entorno privado y ejecuta:

```sh
npm run user:create-owner
```

El script busca un negocio activo por slug, valida la política, genera el hash y crea un OWNER sin imprimir contraseña ni hash. Si el correo ya existe, informa `Owner already exists` y no sobrescribe datos. Elimina las variables `OWNER_*` del entorno cuando termine el aprovisionamiento.

### Validación de FASE 5

Ejecutar `npm test` y `npm run build`. La suite cubre métodos, validación, credenciales indistinguibles, usuarios y negocios inactivos, roles, cookies, JWT, expiración, revocación contra DB, BIGINT, campos seguros, logout, conteos, aislamiento entre empresas, creación idempotente del OWNER, rutas, restauración tras refresh, errores, estados de carga y ausencia de almacenamiento web del token.

Para aceptación conectada, ejecutar dos veces `npm run db:migrate`, aprovisionar el OWNER y arrancar Netlify Dev. Verificar login, `auth/me`, overview, refresh y logout, además de `health`, `public-menu`, `public-category` y `public-product`. El fixture exclusivo de desarrollo `/tests/fixtures/admin.html?state=dashboard` permite revisar los tamaños 320, 375, 390, 430, 768, 1024 y 1440 px; también admite `login`, `login-error`, `login-loading`, `empty`, `long`, `session-loading`, `overview-loading` y `error`.

## FASE 6: administración del menú

El OWNER dispone de `/admin/menu`, con pestañas de Categorías y Productos. Puede buscar y filtrar productos, cambiar Disponible/Agotado con una acción rápida, abrir formularios de edición y ordenar elementos con controles Subir/Bajar. Los formularios traducen los campos técnicos a “Visible en el menú”, “Disponible”, “Recomendado” y “Mostrar presentación”; nunca piden IDs ni orden numérico.

### Publicación y disponibilidad

La migración `003_add_products_active.sql` agrega `products.active BOOLEAN NOT NULL DEFAULT TRUE`. Los productos existentes quedan publicados. `active=false` significa que el producto está oculto y las APIs públicas no lo devuelven. `available=false` significa que sigue publicado, pero aparece como Agotado. Son estados independientes.

No se añadió otro índice: `products_menu_idx` ya comienza por `business_id, category_id` y reduce correctamente el conjunto antes de filtrar `active`; duplicarlo para este volumen habría sido redundante. Las migraciones 001 y 002 permanecen intactas.

### API administrativa

| Endpoint | Uso |
| --- | --- |
| `GET/POST/PATCH /api/admin/categories` | Lista, crea y edita categorías activas o inactivas. |
| `POST /api/admin/categories/reorder` | Reordena la lista completa de categorías de la empresa. |
| `GET/POST/PATCH /api/admin/products` | Lista todos los productos, crea y edita estados, precio y categoría. |
| `GET /api/admin/product` | Obtiene producto y todas sus presentaciones, incluidas las ocultas. |
| `POST /api/admin/products/reorder` | Reordena productos dentro de una categoría. |
| `POST/PATCH /api/admin/variants` | Crea y edita presentaciones. |
| `POST /api/admin/variants/reorder` | Reordena presentaciones dentro de un producto. |

Todos reutilizan `requireOwner`. El `business_id` procede de la sesión revalidada y cada lectura o escritura incluye la empresa. Las categorías recibidas se comprueban contra esa empresa; los productos y presentaciones ajenos responden como inexistentes. Los reordenamientos son sentencias SQL atómicas y solo se ejecutan cuando la lista completa coincide con los elementos del negocio y padre esperados.

Los cuerpos JSON tienen allowlists exactas. Se rechazan `business_id`, `id`, timestamps y campos desconocidos. Los nombres se recortan y limitan; la descripción admite hasta 1000 caracteres como texto plano. Los precios se validan como cadenas decimales, sin convertir a float: máximo diez enteros y dos decimales, sin negativos, exponentes, NaN ni Infinity.

### Desarrollo local

`npm run dev` conserva Vite por separado. Para frontend, Functions y Neon juntos:

```sh
npm run dev:netlify
```

El script `scripts/netlify-dev.js` se ejecuta con `--env-file-if-exists=.env`, llama la CLI local mediante Node y arranca Vite en un puerto interno estricto. En Windows evita depender del lanzador npm global y no contiene valores de secretos. Se puede cambiar el puerto exterior con `npm run dev:netlify -- --port 8890`.

### Verificación visual

El fixture `/tests/fixtures/admin.html` añade los estados `menu-categories`, `menu-products`, `category-form` y `product-form`, además de los estados de FASE 5. Sirve para revisar listas, filtros, toggles y presentaciones sin modificar Neon.

## FASE 7: marca, imágenes y promociones

La migración `004_business_branding_and_media.sql` añade `theme_color` y los `public_id` de Cloudinary sin modificar las migraciones previas. `/admin/mi-negocio` permite editar nombre, descripción, dirección, teléfono y color; el slug se muestra como inmutable. `/admin/promociones` administra título, descripción, precio opcional, vigencia, estado, orden e imagen.

Las imágenes usan tres pasos privados: `POST /api/admin/media/sign`, subida directa firmada a Cloudinary y `POST /api/admin/media/complete`. El servidor selecciona carpeta e identificador, verifica propiedad, tipo, formato, tamaño máximo de 5 MB y recurso real antes de guardar `secure_url`. `POST /api/admin/media/remove` no acepta un `public_id` del navegador. Al reemplazar o retirar una imagen, la referencia de base se actualiza antes de destruir el recurso anterior. Logo, portada, categorías, productos y promociones comparten este flujo.

El menú público devuelve `theme_color` y solo promociones activas dentro de su intervalo. La interfaz usa un tema oscuro global y limita el color de marca a `#RRGGBB`; un valor ausente o inválido cae en `#9250D8`. Solo URLs reconocidas de `res.cloudinary.com/image/upload` reciben `f_auto,q_auto` y dimensiones de presentación.

Para aceptar imágenes reales hay que configurar las tres variables Cloudinary y probar subir, reemplazar y quitar una imagen desde Netlify Dev. Sin ellas, el endpoint de firma responde `503 MEDIA_UNAVAILABLE`; el resto del panel continúa operativo.

## FASE 8: código QR del negocio

La ruta protegida `/admin/qr` obtiene sus datos desde `GET /api/admin/qr`. El endpoint reutiliza `requireOwner`: no acepta URL, slug ni `business_id` del navegador. Construye el enlace como `PUBLIC_SITE_URL + / + slug` usando el negocio revalidado de la sesión y devuelve únicamente URL pública, slug, nombre, logo, color y el indicador `is_local_url`.

`PUBLIC_SITE_URL` debe ser HTTP(S), no puede contener credenciales, query ni fragmento y se normaliza sin slash final. Direcciones localhost, loopback y redes privadas IPv4 se permiten para pruebas, pero el panel advierte que no deben imprimirse como QR definitivo. Si falta o es inválida, el endpoint responde `503 PUBLIC_URL_UNAVAILABLE` sin revelar la configuración.

El frontend genera el QR con `qrcode` y corrección de errores H. Usa módulos `#111111`, fondo blanco y quiet zone de cuatro módulos. La vista previa es SVG y el logo, cuando existe y carga correctamente, ocupa aproximadamente 18% del centro sobre un respaldo blanco. La descarga genera un PNG blanco de 1024×1024 llamado `qr-{slug}.png`; contiene únicamente el QR y su logo central. Si el logo falla por red o CORS, ofrece el mismo QR válido sin logo y lo informa. No se guarda el QR en PostgreSQL ni se sube a Cloudinary.

Antes de imprimir en cantidad, configurar en Netlify una `PUBLIC_SITE_URL` estable, desplegar, escanear tanto el preview como el PNG descargado con y sin logo y confirmar que abren `/:slug`. Si posteriormente cambia completamente el dominio, los códigos impresos seguirán apuntando al dominio anterior. Esta fase no implementa redirecciones, tracking ni QR dinámicos externos y no añade migraciones de base de datos.

## FASE 9: seguridad y aislamiento multiempresa

Las mutaciones autenticadas validan centralmente `Origin` o `Referer`. En producción solo se acepta el origen exacto de `PUBLIC_SITE_URL` y un encabezado ausente se rechaza; en desarrollo únicamente se admiten localhost, loopback e IP privadas de red local. Las APIs propias continúan siendo same-origin y no publican CORS. La cookie sigue siendo `HttpOnly`, `SameSite=Lax`, `Path=/` y `Secure` en producción.

El login usa un límite distribuido de ocho fallos en 15 minutos, compartido por las Functions mediante PostgreSQL. La migración `006_login_rate_limits.sql` almacena solo HMAC SHA-256 de correo e IP, nunca los valores originales, reinicia la ventana de forma automática y elimina registros obsoletos. No se usa un contador en memoria que pierda eficacia entre instancias serverless.

Las cargas Cloudinary conservan el flujo firmado y ahora `complete` vuelve a verificar la firma emitida, su timestamp con vigencia máxima de diez minutos, carpeta, `public_id`, recurso real, formato, HTTPS, límite de 5 MB, ancho/alto máximos de 12 000 px y 40 megapíxeles. El navegador nunca decide qué recurso anterior borrar.

Netlify aplica CSP sin `unsafe-eval`, bloqueo de iframe, `nosniff`, política de referer, permisos deshabilitados y aislamiento de ventana. `style-src 'unsafe-inline'` se conserva de forma deliberada porque el color de marca validado se aplica mediante estilos React; no permite scripts inline. Las imágenes de contenido nuevo se limitan a Cloudinary y la subida directa solo conecta con `api.cloudinary.com`.

### Security / Production checklist

- Configurar en Netlify, sin exponer valores: `DATABASE_URL`, `AUTH_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `PUBLIC_SITE_URL` y `NODE_ENV`.
- Usar `NODE_ENV=production`, una `PUBLIC_SITE_URL` HTTPS canónica y HTTPS de Netlify/dominio personalizado.
- Mantener `AUTH_SECRET` con al menos 32 caracteres y rotarlo si se sospecha exposición; la rotación invalida sesiones existentes.
- Aplicar todas las migraciones antes del despliegue y usar una `DATABASE_URL` exclusiva de la aplicación con TLS obligatorio.
- Confirmar login, logout, expiración, rutas protegidas y una prueba OWNER A contra recursos de Empresa B.
- Probar una carga, finalización y eliminación Cloudinary reales; el API secret solo pertenece al entorno de Functions.
- Verificar los headers publicados con el deploy definitivo y escanear el QR contra la URL final.
- Ejecutar `npm test`, `npm run build`, `npm run db:migrate`, `npm audit --omit=dev` y revisar por separado el audit de herramientas de desarrollo.

La suite `tests/phase9-security.test.js` cubre CSRF, rate limiting persistente, firma expirada/manipulada, bombas de dimensiones, mass assignment, reorders y acceso cruzado a categorías, productos, variantes, promociones, negocio, media y QR. Las respuestas administrativas usan `no-store`, métodos explícitos y errores sanitizados; listas y reorders se limitan a 1000 elementos para evitar respuestas o payloads absurdos sin introducir paginación prematura. React trata el contenido editable como texto; no existe `dangerouslySetInnerHTML`, JWT en almacenamiento web ni sourcemaps de producción.
