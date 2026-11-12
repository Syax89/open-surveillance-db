/**
 * api — ES translation. Parity-checked against the English pilot
 * bundle (../../api.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../api";

export const es: Translation<typeof en> = {
  navigation: "Navegación principal",
  homeAria: "Inicio de OpenSurveillanceDB",
  title: "API pública",
  intro:
    "Todas las cámaras de la base de datos están disponibles a través de una API pública. La lectura no requiere clave ni registro: los endpoints de abajo son tuyos bajo la Open Database Licence. Los colaboradores verificados también pueden escribir a través de la API con claves privadas.",
  apiNote:
    "Sin clave por diseño para la lectura: el directorio se puede consumir sin fricciones. La escritura es posible a través de la API, pero solo con una clave privada emitida a una cuenta verificada. Las respuestas son JSON (salvo las teselas y las exportaciones) y las coordenadas se redondean a ~10 m.",
  endpointsTitle: "Endpoints de lectura",
  endpointsIntro:
    "Todos los endpoints de lectura aceptan GET y devuelven JSON (salvo las teselas y las exportaciones). Los parámetros de ruta aparecen entre {llaves}; todo lo demás es un parámetro de query string.",
  endpointMethod: "Método",
  endpointPath: "Ruta",
  endpointDescription: "Descripción",
  endpointExample: "Pruébalo",
  queryParams: "Parámetros de consulta",
  endpointParamsNone: "Ninguno: el id de la ficha es el único dato de entrada.",
  endpointParamsList:
    "limit (tamaño de página, máx. 2000) · offset (inicio de página) · kind (Fixed dome, Bullet, PTZ, Traffic / licence plate reader, Other / unknown) · freshness (7d, 30d, 90d) · sort (useful, recent, confirmations).",
  endpointParamsBbox:
    "bbox=west,south,east,north (separados por comas) · kind · freshness · count=false. Devuelve las cámaras públicas dentro de la vista: es lo que usa el mapa interactivo. count=false omite el COUNT del conjunto completo y responde total: null (el cliente avanza con nextOffset). Con format=geojson se aplican los mismos filtros kind y freshness, el recuadro puede cubrir como máximo 50 grados cuadrados (los recuadros mayores responden 400) y la FeatureCollection contiene como máximo 10.000 features; si hay más coincidencias, incluye truncated: true (acerca el zoom para ver el resto).",
  endpointParamsExport:
    "format=geojson o format=csv (por defecto geojson). Sin paginación: la exportación es el conjunto de datos completo. Las exportaciones tienen límites de frecuencia más estrictos.",
  endpointParamsRecord:
    "Solo la ruta. Devuelve 404 cuando la ficha no está vigente públicamente.",
  endpointParamsSearch:
    "q (texto libre, comparado con títulos, direcciones y tipos). Los resultados se ordenan por relevancia.",
  endpointParamsNearby:
    "latitude · longitude (grados decimales, obligatorios) · radius (metros, por defecto 100, máx. 5000). Ordenados por distancia.",
  endpointParamsRevisions:
    "cameraId (obligatorio). Devuelve el historial público de cambios de una ficha, del más antiguo al más reciente.",
  endpointParamsGeocode:
    "q (nombre del lugar, obligatorio). Autocompletado de lugares a través de un proxy a OpenStreetMap Nominatim, con caché en el servidor.",
  endpointParamsReverse:
    "lat · lng (obligatorios, grados decimales). Devuelve la dirección más cercana, almacenada en caché tras la primera consulta.",
  endpointParamsTiles:
    "z (zoom 0-19) · x · y (coordenadas de tesela). Teselas ráster servidas mediante proxy desde OpenStreetMap.",
  endpoints: {
    list: { method: "GET", path: "/api/cameras", example: "/api/cameras?kind=Fixed%20dome&limit=20", description: "Lista JSON paginada de todas las cámaras públicas. El punto de entrada principal: filtra por tipo o actualidad, ordena y recorre el conjunto de datos por páginas. Añade count=false para omitir el COUNT del conjunto completo (responde total: null y avanza con nextOffset)." },
    bbox: { method: "GET", path: "/api/cameras?bbox=…", example: "/api/cameras?bbox=8.5,47.3,8.6,47.5", description: "Todas las cámaras públicas dentro de una vista del mapa, en GeoJSON. Es el endpoint al que llama el mapa interactivo cuando desplazas o haces zoom." },
    exportGeojson: { method: "GET", path: "/api/cameras?format=geojson", example: "/api/cameras?format=geojson", description: "El conjunto de datos completo en GeoJSON: una sola petición, sin paginación. Ideal para herramientas SIG y análisis de datos." },
    exportCsv: { method: "GET", path: "/api/cameras?format=csv", example: "/api/cameras?format=csv", description: "El conjunto de datos completo en CSV, listo para hojas de cálculo. El mismo contenido que la exportación GeoJSON, en formato tabular." },
    record: { method: "GET", path: "/api/cameras/{id}", example: "/api/cameras/1", description: "Una ficha de cámara por id numérico, con todo su detalle público: ubicación, dirección, estado de verificación e historial de cambios." },
    search: { method: "GET", path: "/api/cameras/search?q=…", example: "/api/cameras/search?q=zurich", description: "Búsqueda de texto en títulos, direcciones y tipos. Una forma rápida de encontrar una cámara concreta sin recorrer el mapa." },
    nearby: { method: "GET", path: "/api/cameras/nearby?latitude=&longitude=", example: "/api/cameras/nearby?latitude=47.41&longitude=8.57&radius=200", description: "Cámaras cerca de una posición, ordenadas por distancia. Es la comprobación de duplicados que usa el formulario de reporte." },
    revisions: { method: "GET", path: "/api/cameras/revisions?cameraId=", example: "/api/cameras/revisions?cameraId=1", description: "Historial público de cambios de una ficha: qué cambió, cuándo y quién (anónimo o colaborador)." },
    geocode: { method: "GET", path: "/api/geocode?q=…", example: "/api/geocode?q=zurich+hb", description: "Autocompletado de lugares para cuadros de búsqueda, a través de un proxy a OpenStreetMap Nominatim. Los resultados se guardan en caché, así que las consultas repetidas nunca llegan al servicio de origen." },
    geocodeReverse: { method: "GET", path: "/api/geocode/reverse?lat=&lng=", example: "/api/geocode/reverse?lat=47.4123&lng=8.5709", description: "Dirección más cercana a una posición: la misma consulta que rellena el campo de dirección en el formulario de reporte." },
    tiles: { method: "GET", path: "/api/tiles/{z}/{x}/{y}.png", example: "/api/tiles/14/8570/5694.png", description: "Teselas ráster de OpenStreetMap, servidas mediante proxy y con caché. Úsalas para crear tu propio mapa sobre los datos de las cámaras." },
  },
  // API keys (epic api-keys, T19 + t_10e3585e): the write API. The read
  // endpoints above stay keyless — private keys unlock WRITE access only.
  keysTitle: "Claves de API",
  keysIntro:
    "Los colaboradores verificados pueden crear claves privadas para escribir desde scripts y herramientas: enviar reportes y correcciones, confirmar cámaras, editar fichas y realizar acciones de la comunidad. Las claves se crean en tu cuenta, se muestran una sola vez al crearlas, caducan a los 365 días por defecto y se pueden revocar en cualquier momento; cada cuenta puede tener hasta 5 claves activas.",
  keysNote:
    "Las claves privadas dan acceso de escritura a la API: trátalas como una contraseña. No las compartas nunca, no las subas nunca a repositorios públicos y no las registres nunca en logs. Una clave filtrada permite a cualquiera escribir en tu nombre: revócala y crea una nueva.",
  authHeaderTitle: "Autenticación",
  authHeaderIntro:
    "Envía la clave en la cabecera Authorization de la petición. Una clave sigue siendo válida hasta que caduca o hasta que la revocas desde tu cuenta. No pongas nunca la clave en la query string: las credenciales en las URL se filtran a los logs de proxy y de acceso y a las cabeceras Referer, y la API las rechaza con un 400.",
  authHeaderExample:
    'curl -X POST /api/cameras -H "Authorization: Bearer osdb_…" -H "Content-Type: application/json" -d \'{ "title": "…" }\'',
  keysCreateCta: "Crea tus claves de API desde tu cuenta.",
  writeEndpointsTitle: "Endpoints de escritura",
  writeEndpointsIntro:
    "Estos endpoints modifican datos públicos y requieren una cuenta verificada. Autentícate con una clave privada en la cabecera Authorization; cada endpoint necesita el scope indicado en su tarjeta.",
  scopeRequiredLabel: "Requiere el scope",
  writeEndpoints: {
    cameras: { method: "POST", path: "/api/cameras", scope: "submit", description: "Publica un nuevo reporte de cámara." },
    corrections: { method: "POST", path: "/api/corrections", scope: "submit", description: "Envía una corrección o una solicitud de eliminación." },
    confirmation: { method: "PUT / DELETE", path: "/api/cameras/{id}/confirmation", scope: "confirm", description: "Activa o desactiva la confirmación de la comunidad de una cámara." },
    actions: { method: "PUT / DELETE", path: "/api/cameras/{id}/actions", scope: "action", description: "Realiza o retira una acción de la comunidad: útil, ya no está, problema, privacidad." },
    edit: { method: "PATCH", path: "/api/cameras/{id}", scope: "edit", description: "Actualiza los datos de una cámara: ediciones del autor y solicitudes de edición." },
  },
  scopesTitle: "Permisos",
  scopesIntro:
    "Cada clave tiene un alcance: tú eliges lo que puede hacer y puedes revocarla en cualquier momento desde tu cuenta.",
  scopes: {
    submit: { name: "Enviar", grants: "Publicar reportes de cámaras y correcciones.", endpoints: "POST /api/cameras · POST /api/corrections" },
    confirm: { name: "Confirmar", grants: "Marcar cámaras como confirmadas.", endpoints: "PUT/DELETE /api/cameras/{id}/confirmation" },
    edit: { name: "Editar", grants: "Actualizar los datos de las cámaras (ediciones del autor y solicitudes de edición).", endpoints: "PATCH /api/cameras/{id}" },
    action: { name: "Acciones de la comunidad", grants: "Realizar acciones de la comunidad: útil, ya no está, problema, privacidad.", endpoints: "PUT/DELETE /api/cameras/{id}/actions" },
  },
  lifecycleTitle: "Ciclo de vida de las claves",
  lifecycleIntro:
    "Las claves se gestionan desde tu cuenta. La clave completa se muestra exactamente una vez, al crearla: cópiala enseguida, porque nunca se guarda en nuestros servidores.",
  lifecycle: {
    create: { name: "Crear", body: "Las claves se crean en tu cuenta, en Claves de API. La caducidad predeterminada es de 365 días; al crearla puedes restringir los permisos, pero nunca ampliarlos después." },
    reveal: { name: "Se muestra una vez", body: "La clave completa solo aparece en el diálogo de creación. Después, la cuenta muestra únicamente un prefijo corto (osdb_…)." },
    expire: { name: "Caducidad", body: "Una clave deja de funcionar en su fecha de caducidad (365 días desde la creación por defecto). Las claves caducadas responden 401 a cualquier escritura." },
    revoke: { name: "Revocar", body: "La revocación es inmediata: los scripts que usen la clave empiezan a fallar con 401 al instante." },
    cap: { name: "Límite", body: "Hasta 5 claves activas por cuenta. Al alcanzar el límite se responde 409: revoca una clave para hacer sitio." },
  },
  securityTitle: "Seguridad",
  securityIntro: "Las claves de API son credenciales de tu cuenta: trátalas como contraseñas.",
  security: {
    queryString: { name: "Nunca en las URL", body: "Las claves van solo en la cabecera Authorization. Una clave en la query string (parámetros api_key, apikey o key) se rechaza con 400 en las peticiones de escritura antes de procesar nada: las credenciales en las URL se filtran a los logs de proxy y de acceso y a las cabeceras Referer." },
    logging: { name: "No registres ni compartas las claves", body: "No imprimas las claves, no las guardes en archivos subidos a repositorios públicos ni las pegues en reportes de errores o mensajes de chat. Si una clave se filtra, revócala y crea una nueva." },
    storage: { name: "Solo el hash en reposo", body: "Solo se guarda una huella SHA-256 de la clave. La clave completa existe en una única respuesta, la de creación, y no se puede recuperar." },
  },
  errorsTitle: "Respuestas de error",
  errorsIntro:
    "Las peticiones de escritura fallan con un código de estado claro y una única forma de respuesta canónica. Los endpoints de lectura siguen devolviendo 404 para las fichas que no están vigentes públicamente.",
  errors: {
    "400": "Petición mal formada: un campo ausente o no válido, o credenciales en la query string.",
    "401": "Clave ausente, no válida, caducada o revocada.",
    "403": "La clave es válida pero no incluye el permiso necesario.",
    "404": "Ficha no encontrada: la API nunca revela si un identificador existe.",
    "409": "Límite alcanzado: demasiadas claves activas (máx. 5) o un estado en conflicto.",
    "429": "Límite de frecuencia superado, por clave y por dirección IP.",
    "503": "Servicio no disponible temporalmente.",
  },
  keysLimitsTitle: "Límites de frecuencia por clave",
  keysLimitsIntro:
    "Cada clave tiene su propio límite, además de los límites por IP indicados arriba: un solo script no puede agotar el margen compartido de todos los demás usuarios desde la misma dirección.",
  limitsTitle: "Límites de frecuencia",
  limitsIntro:
    "Cada endpoint está limitado por usuario (dirección IP) en una ventana de 60 segundos. Los límites protegen el servicio y a los proveedores de origen (OpenStreetMap): generosos para el uso interactivo, estrictos para los scrapers.",
  limits: {
    read: { name: "Lista, bbox, ficha, búsqueda", requests: "300 peticiones / minuto" },
    export: { name: "Exportaciones CSV / GeoJSON", requests: "10 peticiones / minuto" },
    nearby: { name: "Cercanas (comprobación de duplicados)", requests: "30 peticiones / minuto" },
    revisions: { name: "Historial de cambios", requests: "30 peticiones / minuto" },
    geocode: { name: "Geocodificación (directa + inversa)", requests: "30 peticiones / minuto" },
    tiles: { name: "Teselas del mapa", requests: "1200 peticiones / minuto" },
  },
  licenseTitle: "Licencia y atribución",
  licenseBody:
    "La base de datos y sus exportaciones se publican bajo la Open Database Licence (ODbL) 1.0: puedes compartir y adaptar los datos siempre que cites la fuente y publiques cualquier base de datos derivada bajo la misma licencia.",
  attribution: "Datos y teselas del mapa © colaboradores de OpenStreetMap, con licencia ODbL.",
  backToHome: "Volver al inicio",
};
