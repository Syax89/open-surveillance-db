/**
 * Spanish legal content (es-ES).
 *
 * Mirror of the English pilot bundle (app/lib/legal/en.ts), pinned to the
 * same LegalContent type, so missing/extra keys fail `tsc` — parity per
 * ADR 0007.
 *
 * Web adaptation of the legal documents:
 *   - docs/TERMS_OF_USE.md          → terms
 *   - docs/legal/PRIVACY_NOTICE.md  → privacy
 *   - docs/OPEN_SOURCE.md           → licenses
 *
 * The repository copies of those documents remain the canonical source
 * of record; this file is the presentation layer for the public pages.
 * Inline markup: **bold** and [label](url) (see app/lib/legal/types.ts).
 */
import type { LegalContent } from "./types";

export const esLegal: LegalContent = {
  privacy: {
    eyebrow: "Legal · Privacidad",
    title: "Aviso de privacidad",
    intro:
      "Cómo trata OpenSurveillanceDB los datos personales, qué publicamos, qué no recopilamos nunca y cómo puedes ejercer tus derechos en virtud del RGPD.",
    versionNote:
      "Versión 0.9 — 12 de noviembre de 2026. Se reescribe el § 10, Cookies, para enumerar todas las cookies en uso (idioma, tema de color, sesión de acceso y protección CSRF), todas estrictamente necesarias, por lo que sigue sin haber banner de consentimiento; resincronizada con la PRIVACY_NOTICE canónica v0.16 (docs/legal/PRIVACY_NOTICE.md sigue siendo la versión canónica).",
    sections: [
      {
        heading: "1. Quiénes somos (responsable del tratamiento)",
        blocks: [
          {
            type: "paragraph",
            text: "**Responsable del tratamiento:** Simone Rondina (syax89) / OpenSurveillanceDB — Italia.",
          },
          {
            type: "paragraph",
            text: "**Contacto de privacidad:** [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) — un buzón dedicado — para cualquier pregunta, solicitud de los interesados o aviso. Primera respuesta en 48 horas; respuesta de fondo en 14 días.",
          },
        ],
      },
      {
        heading: "2. Qué hace el servicio",
        blocks: [
          {
            type: "paragraph",
            text: "OpenSurveillanceDB publica un mapa de interés público de la **infraestructura de videovigilancia pública y visible** (por ejemplo, cámaras instaladas en calles, plazas o el exterior de estaciones), que se publica de inmediato desde cuentas de colaborador verificadas y que la comunidad mantiene precisa mediante confirmaciones, avisos y umbrales automáticos (ADR 0021). Es un proyecto de transparencia cívica, no una plataforma comercial: sin publicidad comportamental, sin rastreo y sin venta de datos.",
          },
        ],
      },
      {
        heading: "3. Qué datos personales tratamos",
        blocks: [
          {
            type: "paragraph",
            text: "La siguiente tabla describe los datos personales que trata el Servicio, su origen, su finalidad y su base jurídica.",
          },
          {
            type: "table",
            caption: "Datos personales tratados por el Servicio",
            headers: ["Datos", "Origen", "Finalidad", "Base jurídica"],
            rows: [
              [
                "Contenido del reporte: ubicación, descripción, fabricante / fecha de observación opcionales, notas privadas",
                "Autor del reporte (interesado)",
                "Crear la ficha pública; acciones de precisión de la comunidad",
                "Art. 6(1)(f) RGPD",
              ],
              [
                "ID interno seudónimo del colaborador + marca de tiempo del envío",
                "Autor del reporte",
                "Prevención de abusos, procedencia",
                "Art. 6(1)(f) RGPD",
              ],
              [
                "Cuenta de colaborador (correo electrónico, nombre visible opcional, hash de la contraseña)",
                "Colaborador (registro voluntario)",
                "Inicio de sesión, atribución de los envíos, prevención de abusos",
                "Art. 6(1)(f) RGPD — minimización: alias opcional y seudónimo, contraseña con hash PBKDF2-SHA256, nunca expuesta en las respuestas de la API",
              ],
              [
                "Registros de sesión (token con hash, token CSRF, marcas de tiempo)",
                "El proyecto (inicio de sesión)",
                "Mantener la sesión del colaborador; protección CSRF",
                "Art. 6(1)(f) RGPD; token almacenado solo como SHA-256, caduca a los 30 días o al cerrar sesión",
              ],
              [
                "Solicitud de corrección / retirada (datos de contacto que facilita el solicitante, p. ej. correo electrónico)",
                "Solicitante",
                "Ejercicio de derechos, avisos de daños",
                "Art. 6(1)(c) RGPD (artículos 15–22) y 6(1)(f)",
              ],
              [
                "Acciones de la comunidad sobre las fichas (tipo de acción `like` / `confirm` / `gone` / `problem` / `privacy`, instantánea del peso, marca de tiempo)",
                "Colaborador (cuenta verificada)",
                "Precisión del conjunto de datos — moderación impulsada por la comunidad",
                "Art. 6(1)(f) RGPD; una acción por usuario y ficha (`UNIQUE(camera_id, contributor_id)`), instantánea del peso en el momento de la acción, **solo agregados en los datos públicos** — nunca atribuidas a ningún perfil (ADR 0021 §3/§13)",
              ],
              [
                "Atributos de identidad OIDC (proveedor, id del sujeto, nombre visible, indicador de verificación — nunca el correo electrónico)",
                "GitHub / Google (proveedor de identidad — solo si eliges ese método)",
                "Inicio de sesión opcional del colaborador; vinculación de la cuenta al colaborador",
                "Art. 6(1)(f) RGPD; no se importa el correo electrónico; el proveedor observa el inicio de sesión y la IP (§ 5/§ 6)",
              ],
              [
                "Entradas de auditoría de moderación (decisión, código de motivo, marca de tiempo, seudónimo del revisor)",
                "El proyecto",
                "Rendición de cuentas; recursos históricos cerrados por migración (ADR 0021 §7)",
                "Art. 6(1)(f) RGPD; nunca públicas (solo informes de transparencia agregados)",
              ],
              [
                "Fichas publicadas",
                "Reportes publicados / fuentes públicas oficiales",
                "El conjunto de datos público (ODbL 1.0)",
                "Art. 6(1)(f) / 6(1)(e) RGPD",
              ],
            ],
          },
          {
            type: "note",
            text: "**Fichas procedentes de fuentes públicas oficiales:** cuando una ficha se republica a partir de una fuente pública oficial, los datos no se han obtenido del interesado. Categorías de fuentes: registros públicos y portales de transparencia de las administraciones públicas (por ejemplo, en Italia, los conjuntos de datos del D.Lgs. 33/2013), documentos publicados por autoridades públicas y otras fuentes oficiales de acceso público. Estas fichas se comprueban una a una conforme al régimen jurídico propio de la fuente.",
          },
          {
            type: "note",
            text: "**Historial público de eventos por ficha (ADR 0021 § 7):** cada cambio de estado de la comunidad (publicada, confirmada, marcada como útil, señalada como ya no presente, oculta, eliminada, restaurada) queda registrado en un **historial público del ciclo de vida sin ninguna atribución**: ni ids de colaboradores, ni correos electrónicos, ni datos derivados de la IP en las filas públicas. Es un control de transparencia del responsable, no una nueva recopilación de datos personales (solo agregados).",
          },
          {
            type: "note",
            text: "**Comunicación voluntaria:** facilitar datos para un reporte es **voluntario**; no es un requisito legal ni contractual. La única consecuencia de no facilitarlos es que el reporte no puede tramitarse. No existe obligación de facilitar datos ni penalización alguna por no hacerlo.",
          },
          {
            type: "note",
            text: "**Categorías especiales (art. 9 RGPD):** no se recopila ninguna de forma intencionada. Las fichas son **solo metadatos de texto**: la función de pruebas fotográficas se eliminó (2026-08-08, tabla `photos` eliminada por la migración 0043), por lo que no existe ninguna subida de contenido multimedia. El texto de un reporte que contenga datos personales de forma incidental (p. ej. un nombre o una matrícula en la descripción) infringe las normas de contenido y se gestiona mediante la moderación de la comunidad y las correcciones.",
          },
          {
            type: "note",
            text: "**Menores:** el servicio está dirigido a personas adultas. En Italia, enviar un reporte requiere la edad de consentimiento para los servicios de la sociedad de la información (14 años, art. 2-quinquies D.Lgs. 196/2003); otras jurisdicciones aplican sus propios umbrales de edad.",
          },
        ],
      },
      {
        heading: "4. Qué NO recopilamos ni publicamos",
        blocks: [
          {
            type: "list",
            items: [
              "**Ni vídeo, ni retransmisiones en directo, ni credenciales, ni información de red, ni interfaces de control**: el proyecto documenta la *existencia* de la infraestructura de videovigilancia visible, nunca lo que capta ni cómo acceder a ella.",
              "**Ni cámaras de viviendas privadas** ni cámaras orientadas hacia interiores privados.",
              "**Ni nombres de personas, ni rostros, ni matrículas de vehículos, ni detalles operativos precisos.**",
              "**Ninguna coordenada con una precisión superior al nivel de zona:** las ubicaciones publicadas se redondean a **~4 decimales (~10 m)**; la ubicación exacta permanece en la base de datos y nunca se publica.",
              "**Sin publicidad comportamental, sin rastreo, sin venta de datos** y sin bibliotecas de analítica.",
              "Los reportes de cuentas verificadas se publican de inmediato y forman parte del conjunto de datos público desde el momento de su envío. El contenido que infringe las normas lo retira la comunidad o una emergencia legal, y el contenido retirado nunca se vuelve a publicar.",
            ],
          },
        ],
      },
      {
        heading: "5. Destinatarios y transferencias",
        blocks: [
          {
            type: "list",
            items: [
              "**Cloudflare, Inc.** — alojamiento y base de datos (Workers + D1). Encargado del tratamiento (art. 28) en virtud del Cloudflare Data Processing Addendum (DPA v6.3, junio de 2025), que incorpora las **cláusulas contractuales tipo de la UE (2021/914)**; Cloudflare está certificada en el **Marco de Privacidad de Datos UE-EE. UU.**. D1 está configurada con residencia en la UE.",
              "**OpenStreetMap Foundation (Nominatim — nominatim.openstreetmap.org, encargado PR6).** Geocodificación para el flujo de reporte y las páginas de las fichas: búsqueda directa por nombre de lugar (`GET /api/geocode`, hasta 5 sugerencias) e inversa de coordenadas→dirección (`GET /api/geocode/reverse`, autocompletado del formulario de reporte). Solo se envía la propia consulta —cadenas de texto libre de lugar/dirección y coordenadas redondeadas a ~4 decimales (~11 m)—; la respuesta (dirección mostrada) se almacena en la caché de D1 (`geocode_reverse_cache`). **Sin datos personales, sin datos de cuenta, sin elaboración de perfiles; los datos del solicitante nunca se envían ni se registran.** El uso respeta la política de Nominatim: máximo **1 petición/s**, User-Agent identificativo, caché primero.",
              "**GitHub, Inc. / Google LLC (proveedores de identidad OIDC — opcionales, solo si eliges ese método).** Son **responsables independientes de sus propios servicios de autenticación** (al iniciar sesión se aplican sus políticas de privacidad); no se les envía ningún dato de OpenSurveillanceDB: solo recibimos los atributos de identidad enumerados en el § 3 (proveedor, id del sujeto, nombre visible, indicador de verificación; nunca el correo electrónico). El proveedor observa el inicio de sesión y tu IP. Nunca se publican ni se registran.",
              "**La propia publicación:** las fichas publicadas pasan a formar parte de un conjunto de datos público bajo licencia ODbL 1.0 y pueden descargarse o exportarse (JSON/CSV/GeoJSON). Las copias ya descargadas no pueden recuperarse; las fichas retiradas se excluyen de las exportaciones futuras.",
              "Ningún otro destinatario; sin publicidad comportamental; sin bibliotecas de analítica.",
            ],
          },
        ],
      },
      {
        heading: "6. Transferencias internacionales de datos",
        blocks: [
          {
            type: "list",
            items: [
              "**Cloudflare:** transferencias cubiertas por el DPA de Cloudflare, que incorpora las **cláusulas contractuales tipo de la UE (2021/914)**; medidas complementarias evaluadas para el tratamiento en EE. UU. (cifrado en tránsito, residencia en la UE para D1).",
              "**Inicio de sesión OIDC (GitHub/Google, si eliges ese método):** los atributos de identidad (proveedor, id del sujeto, nombre visible, indicador de verificación) se intercambian con los servicios del proveedor al iniciar sesión; el flujo se rige por las condiciones y la política de privacidad del proveedor.",
            ],
          },
        ],
      },
      {
        heading: "7. Conservación",
        blocks: [
          {
            type: "paragraph",
            text: "Los reportes se publican de inmediato y siguen siendo públicos mientras la comunidad los siga confirmando; las fichas retiradas por la comunidad o por una emergencia legal se excluyen de los datos públicos y siguen el calendario de conservación del repositorio (docs/legal/RETENTION_SCHEDULE.md). Solicitudes de corrección y entradas de auditoría: 2 años. Registros operativos: hasta 12 meses (agregados). Copias de seguridad: rotadas por el proveedor (hasta 30 días de recuperación a un momento determinado).",
          },
          {
            type: "paragraph",
            text: "Las reglas detalladas figuran en el calendario de conservación del repositorio (docs/legal/RETENTION_SCHEDULE.md), entre ellas: datos de la comunidad (R14) — las acciones de la comunidad siguen a la cuenta (activa → supresión; las acciones realizadas sobre otras fichas se eliminan junto con el colaborador, ADR 0021 § 13, y el historial público del ciclo de vida conserva solo agregados); datos de los métodos de autenticación (R15, ADR 0020) — tokens de verificación de correo 24 horas, tokens de restablecimiento 3 horas (de un solo uso, eliminados al usarse); passkeys y códigos de recuperación mientras la cuenta está activa, eliminados definitivamente al suprimir la cuenta — no queda nada que vincule la cuenta a un proveedor o a un dispositivo; contadores de inicios de sesión fallidos (R16), registro del límite de registros por IP (R17) y registro de correos transaccionales (R18) depurados por el cron de conservación; fichas de demostración (R12) purgadas por el cron de conservación fuera del entorno de desarrollo.",
          },
          {
            type: "paragraph",
            text: "Las reglas de eliminación y caducidad se aplican automáticamente mediante la depuración diaria de conservación (programada en `worker/index.ts`, todos los días a las 03:00 UTC — RETENTION_SCHEDULE.md § 3): el cron elimina las filas caducadas (R12/R16/R17/R18), elimina definitivamente los envíos heredados `pending` 90 días después del envío (**R19**) y las fichas heredadas `rejected` 30 días después de la decisión (**R20**; ambas se omiten mientras haya un recurso abierto o una retención legal activa), archiva las entradas de auditoría al cumplirse 2 años (R4/R5/R9) y nunca modifica el estado del ciclo de vida de las fichas publicadas (modelo comunitario, ADR 0021 § 2.2).",
          },
        ],
      },
      {
        heading: "8. Tus derechos (artículos 15–22 del RGPD)",
        blocks: [
          {
            type: "paragraph",
            text: "Puedes solicitar, de forma gratuita:",
          },
          {
            type: "list",
            items: [
              "**Acceso** (art. 15) — confirmación y copia de tus datos.",
              "**Rectificación** (art. 16) — corrección de datos inexactos.",
              "**Supresión** (art. 17) — eliminación, con sujeción a las excepciones del art. 17(3) y al calendario de conservación.",
              "**Limitación** (art. 18) y **oposición** (art. 21).",
              "**Portabilidad** (art. 20) — cuando sea técnicamente aplicable.",
              "No se toman decisiones automatizadas, incluida la elaboración de perfiles (art. 22).",
            ],
          },
          {
            type: "paragraph",
            text: "**Cómo ejercerlos:** escribe a [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org). Para proteger a los interesados, podemos pedirte que verifiques tu identidad, de forma proporcionada a la solicitud.",
          },
          {
            type: "paragraph",
            text: "**Plazos:** respondemos en el plazo de **1 mes** (art. 12(3)); este plazo puede prorrogarse otros 2 meses como máximo en el caso de solicitudes complejas, previo aviso. Si denegamos la solicitud, te explicamos el motivo y te recordamos tu derecho a presentar una reclamación.",
          },
          {
            type: "paragraph",
            text: "**Reclamaciones:** puedes presentar una reclamación ante la autoridad de control competente; en Italia, el [Garante per la protezione dei dati personali](https://www.garanteprivacy.it).",
          },
        ],
      },
      {
        heading: "9. Contacto y supervisión",
        blocks: [
          {
            type: "paragraph",
            text: "Contacto de privacidad: [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) — primera respuesta en 48 horas; respuesta de fondo en 14 días.",
          },
          {
            type: "paragraph",
            text: "Este aviso se revisa al menos una vez al año o ante cualquier cambio significativo; el historial de versiones se conserva en el repositorio.",
          },
        ],
      },
      {
        heading: "10. Cookies",
        blocks: [
          {
            type: "paragraph",
            text: "OpenSurveillanceDB solo utiliza las cookies que se indican a continuación. Todas son estrictamente necesarias o funcionales: no contienen identificadores de rastreo, nunca se comparten con terceros y no se usan para analítica, publicidad ni elaboración de perfiles. Por eso no se muestra ningún banner de consentimiento.",
          },
          {
            type: "table",
            caption: "Cookies que establece OpenSurveillanceDB",
            headers: ["Cookie", "Finalidad", "Cuándo se establece", "Duración", "Propiedades"],
            rows: [
              ["**opensurveillancedb-locale**", "Recuerda el idioma de tu interfaz (en, it, fr, de, es o pt). También se lee cuando pides un correo de verificación o de restablecimiento de contraseña, para que el mensaje te llegue en inglés y en tu idioma.", "Cuando eliges un idioma en el menú de idiomas o abres un enlace de idioma (/api/locale)", "1 año", "SameSite=Lax, path=/"],
              ["**opensurveillancedb-theme**", "Recuerda el tema de color claro u oscuro que has elegido (light / dark). Sin ella, el sitio sigue la configuración de tu sistema.", "Cuando usas el selector de tema", "1 año", "SameSite=Lax, path=/"],
              ["**osdb_session**", "Mantiene tu sesión iniciada: contiene un token de sesión aleatorio (nuestros servidores solo guardan su hash).", "Cuando inicias sesión o creas una cuenta; se elimina al cerrar sesión", "Duración del inicio de sesión (30 días por defecto) o hasta que cierres sesión", "HttpOnly, Secure, SameSite=Strict, path=/"],
              ["**osdb_csrf**", "Protege las acciones que realizas con la sesión iniciada contra la falsificación de solicitudes entre sitios (CSRF): contiene un token aleatorio propio de la sesión que la página devuelve con cada cambio.", "Junto con osdb_session; se elimina al cerrar sesión", "Igual que osdb_session", "Secure, SameSite=Strict, path=/; legible por los propios scripts del sitio, por diseño"],
            ],
          },
          {
            type: "list",
            items: [
              "**Contenido:** ninguna de estas cookies contiene tu nombre, tu dirección de correo electrónico ni ningún otro dato personal; las dos cookies de sesión contienen tokens aleatorios que no significan nada fuera de este sitio.",
              "**Base jurídica:** art. 122 D.Lgs. 196/2003 (que transpone el art. 5(3) de la Directiva 2002/58/CE, modificada por la Directiva 2009/136/CE): **no** se requiere consentimiento para las cookies estrictamente necesarias para prestar un servicio solicitado expresamente por el usuario, por lo que no se muestra ningún banner de consentimiento.",
              "**Cómo gestionarlas:** puedes eliminarlas en cualquier momento desde la configuración de tu navegador. Sin la cookie de idioma, la interfaz utiliza el idioma piloto (inglés); sin la de tema, sigue la configuración de tu sistema; si eliminas las cookies de sesión, se cierra tu sesión.",
            ],
          },
          {
            type: "paragraph",
            text: "La preferencia de idioma también se replica en el `localStorage` de tu navegador para la sincronización entre pestañas. `localStorage` es una tecnología de almacenamiento del navegador, no una cookie, y nunca se transmite a nuestros servidores.",
          },
          {
            type: "note",
            text: "**Compromiso:** si cualquier función futura introduce cookies que no sean estrictamente necesarias (analítica, publicidad, elaboración de perfiles), te pediremos tu consentimiento expreso mediante un banner **antes** de instalarlas, de conformidad con el art. 122 D.Lgs. 196/2003.",
          },
        ],
      },
    ],
  },

  terms: {
    eyebrow: "Legal · Condiciones de uso",
    title: "Condiciones de uso",
    intro:
      "Estas condiciones regulan el uso de OpenSurveillanceDB, la base de datos abierta y mantenida por la comunidad sobre la infraestructura de videovigilancia pública visible. Se aplican a la aplicación web, la API pública, las exportaciones de datos y los servicios relacionados (\"el Servicio\").",
    versionNote:
      "Versión 0.5 — 8 de agosto de 2026. Alineación con el estado actual (lista para plantilla): resincronizada con los TERMS_OF_USE canónicos v0.8 (docs/TERMS_OF_USE.md sigue siendo la versión canónica). § 3.7, información sobre la autenticación (verificación del correo para el acceso de escritura, passkeys, OIDC — ADR 0020, controlado en el servidor); § 5, publicación inmediata y acciones de la comunidad; § 6, correcciones privadas y poder de emergencia legal; pruebas fotográficas eliminadas (2026-08-08).",
    sections: [
      {
        heading: "1. Quiénes somos",
        blocks: [
          {
            type: "paragraph",
            text: "**Responsable / operador:** Simone Rondina (syax89) / OpenSurveillanceDB — Italia.",
          },
          {
            type: "paragraph",
            text: "**Contacto:** [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) — un buzón dedicado — para cualquier pregunta, corrección, eliminación o solicitud de privacidad. Plazos de respuesta: primera respuesta en 48 horas; decisión de fondo en 14 días.",
          },
        ],
      },
      {
        heading: "2. Qué cubren estas condiciones",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "OpenSurveillanceDB es un **proyecto de transparencia cívica sin ánimo de lucro y gobernado por la comunidad** que documenta la **infraestructura de videovigilancia pública visible** (por ejemplo, cámaras instaladas en calles, plazas o el exterior de estaciones). Su uso es gratuito: sin anuncios, sin elaboración de perfiles de comportamiento y sin venta de datos.",
              "Al utilizar el Servicio aceptas estas condiciones. Si **envías un reporte**, aceptas además las obligaciones de envío de la sección 5.",
              "El Servicio no ofrece imágenes de vídeo, herramientas de rastreo, acceso a cámaras privadas ni consejos para eludir la videovigilancia legal.",
            ],
          },
        ],
      },
      {
        heading: "3. Uso permitido del Servicio",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "**Consulta:** consultar el mapa, el directorio de fichas y las páginas de cada ficha; buscar en el conjunto de datos público y leerlo.",
              "**Exportaciones:** descargar los datos públicos mediante las exportaciones JSON/CSV/GeoJSON y la API pública, y reutilizarlos, con sujeción a la licencia ODbL 1.0 (sección 7) y a los límites contra abusos de la sección 4.",
              "**Reportes:** enviar observaciones de infraestructura de videovigilancia pública visible. Un reporte de una cuenta verificada se **publica de inmediato** y forma parte del conjunto de datos público desde su envío (sección 5).",
              "**Fines lícitos:** los datos pueden utilizarse para investigación, periodismo, activismo cívico y cualquier fin compatible con estas condiciones y con la licencia ODbL 1.0. Consultar los datos públicos nunca requiere una cuenta. Enviar un reporte o una corrección requiere una cuenta de colaborador verificada (sección 3.5; ADR 0020), y cada envío se le atribuye mediante un **ID interno seudónimo**; nunca se exige el nombre real.",
              "**Métodos de autenticación (multimétodo, ADR 0020).** Las cuentas de colaborador admiten **tres métodos**, a tu elección: **(a) correo electrónico + contraseña** — el método básico, con **verificación del correo obligatoria para el acceso de escritura** (enlace de un solo uso, 24 h; hasta que lo verifiques, tu sesión es de solo lectura); **(b) passkeys (WebAuthn)** — opcional, sin contraseña; **(c) OIDC a través de GitHub o Google** — opcional, previa activación por tu parte. Las reglas:",
            ],
          },
          {
            type: "list",
            items: [
              "**Verificación del correo electrónico.** Tras registrarte, debes verificar la dirección de correo antes de poder enviar, editar o verificar fichas; hasta entonces, tu sesión es de solo lectura. Los correos de verificación y de restablecimiento de contraseña se envían a través de Cloudflare Email Routing sin contenido de rastreo. Una dirección de correo = una cuenta; mantenla accesible por si pierdes la contraseña.",
              "**Passkeys.** Si registras una passkey, el sitio almacena solo material de clave pública; la clave privada permanece en tu dispositivo. **Nota sobre los proveedores:** las passkeys *sincronizadas* se copian, si así lo eliges, en la nube del proveedor del sistema operativo (Apple/Google/Microsoft): el proveedor sabe que tienes una cuenta aquí, el sitio no comparte nada con él y tú controlas la sincronización. Guarda en un lugar seguro los 10 códigos de recuperación que se emiten al registrarla; sin ellos, perder el dispositivo puede suponer perder el acceso mediante passkey (la vía de correo + contraseña sigue disponible).",
              "**OIDC a través de GitHub/Google — información sobre el rastreo.** Iniciar sesión con GitHub o Google significa que **GitHub o Google observa que inicias sesión en este Servicio, así como tu dirección IP**, en cada inicio de sesión; al iniciar sesión se aplican las condiciones y la política de privacidad del propio proveedor. **No importamos tu correo electrónico** del proveedor (solo el id del sujeto, el nombre visible y el indicador de verificación) y nunca fusionamos cuentas automáticamente por coincidencia de correo: un conflicto requiere una fusión manual y verificada. Este método es **opcional y está informado** (matriz de riesgos en la página de inicio de sesión); los botones solo se muestran cuando el operador ha activado el proveedor (credenciales configuradas en este despliegue).",
              "Puedes añadir, cambiar o eliminar métodos desde la página de tu cuenta en cualquier momento; al eliminar tu cuenta se eliminan los datos de todos los métodos (aviso de privacidad § 7 R15, § 8).",
            ],
          },
        ],
      },
      {
        heading: "4. Qué no puedes hacer",
        blocks: [
          {
            type: "paragraph",
            text: "**Contenido prohibido.** Las exclusiones de las normas de publicación se aplican a todo lo que envíes, incluidos los reportes y las notas. En particular, no envíes:",
          },
          {
            type: "list",
            items: [
              "cámaras residenciales o privadas, incluidos los videoporteros y las cámaras orientadas hacia una vivienda privada;",
              "vídeo en directo, URL de streaming, credenciales, información de red o interfaces de control;",
              "campo de visión detallado o capacidades operativas que puedan suponer un riesgo para la seguridad;",
              "instalaciones o ubicaciones sensibles cuya publicación pueda aumentar sustancialmente el riesgo;",
              "acusaciones no verificables sobre personas u organizaciones;",
              "contenido que no tengas derecho a compartir.",
            ],
          },
          {
            type: "paragraph",
            text: "**Ningún dato personal innecesario.** Los reportes y las notas no deben contener datos personales que no sirvan a la ficha pública (minimización de datos).",
          },
          {
            type: "paragraph",
            text: "**Ningún abuso.** No superes los límites de frecuencia aplicables, no extraigas datos del Servicio más allá de un uso personal razonable, no intentes acceder a fichas no públicas (fichas retiradas, solicitudes de corrección) y no eludas los controles de acceso ni utilices el Servicio para acosar o facilitar daños.",
          },
          {
            type: "paragraph",
            text: "**Ninguna reventa comercial del propio Servicio.** La reutilización de los *datos* bajo la ODbL 1.0 (incluida la reutilización comercial) sigue estando permitida; esta cláusula se refiere a revender el Servicio como producto.",
          },
        ],
      },
      {
        heading: "5. Reportes y publicación",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "**Publicación inmediata.** Un reporte de un colaborador verificado se publica de inmediato: entra en el conjunto de datos público en cuanto se envía. No hay cola de revisión ni espera. La comunidad mantiene preciso el directorio: las fichas se confirman, se señalan como ya no presentes, se marcan como útiles o se retiran mediante umbrales automáticos (ADR 0021). Una ficha puede ocultarse o eliminarse en cualquier momento si recibe suficientes señales de la comunidad o por una decisión de emergencia legal; las fichas retiradas siguen siendo accesibles mediante enlace directo, con un aviso y un historial público de eventos, y pueden restaurarse con suficientes confirmaciones.",
              "**Qué conservas y qué concedes.** Conservas los derechos que tengas sobre el contenido que envías. Al enviarlo, concedes al proyecto una licencia no exclusiva, mundial y gratuita para almacenar, revisar y publicar el reporte como parte de la base de datos abierta, puesta a disposición bajo **ODbL 1.0**, con atribución a los colaboradores conforme al aviso de la ODbL. La publicación se produce en el momento del envío, no tras un paso de aprobación.",
              "**Tus garantías.** Al enviar confirmas que: el contenido es exacto según tu leal saber y entender; tienes derecho a compartirlo; cumple la sección 4; y tienes la edad mínima para usar el Servicio en tu jurisdicción (en Italia, 14 años).",
              "**Precisión comunitaria.** Las fichas republicadas a partir de fuentes públicas oficiales siguen su propio régimen jurídico, comprobado ficha por ficha; los reportes de la comunidad se mantienen precisos mediante las confirmaciones y los avisos de la comunidad según los umbrales automáticos, no cotejándolos con registros oficiales.",
            ],
          },
        ],
      },
      {
        heading: "6. Acciones de la comunidad, correcciones y emergencias legales",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "**Acciones de la comunidad.** Cualquier cuenta verificada puede marcar una ficha como útil, confirmar que sigue presente, señalar que ya no lo está o plantear un problema o una preocupación de privacidad. Una cuenta, una acción activa por ficha. Unos umbrales automáticos —incluido un umbral de privacidad deliberadamente bajo— deciden cuándo se oculta o elimina una ficha; cada cambio de estado queda registrado en el historial público de la ficha sin atribución a ningún perfil.",
              "**Correcciones.** Cualquier persona puede solicitar una corrección o una eliminación mediante el formulario privado de corrección (página de inicio, sección \"Señalar un problema / corrección\") o en [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org). Las solicitudes son privadas, las revisa una persona y nunca modifican el mapa automáticamente. Plazos de respuesta: primera respuesta en **48 horas**, respuesta de fondo en **14 días**; las ocultaciones por emergencia legal son inmediatas.",
              "**Emergencias legales.** El único poder de escritura humano que queda es la ocultación o eliminación por emergencia legal por parte del administrador, que se utiliza cuando la ley lo exige y se revisa a posteriori. Los administradores no pueden restaurar ni volver a mostrar fichas de forma unilateral: el consenso de la comunidad de la sección 5 es la única vía de reversión.",
              "Los derechos de los interesados (acceso, rectificación, supresión, limitación, oposición, portabilidad) se describen en el [aviso de privacidad](/privacy) y se ejercen a través del mismo contacto.",
            ],
          },
        ],
      },
      {
        heading: "7. Licencias",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "**Datos:** la base de datos pública y sus exportaciones están bajo licencia **[ODbL 1.0](https://opendatacommons.org/licenses/odbl/)**: se permite la reutilización, también con fines comerciales, siempre que atribuyas la base de datos y, si creas una base de datos derivada, la compartas bajo ODbL 1.0. Las exportaciones incluyen el aviso de la ODbL. Las fichas ilustrativas de demostración forman parte de la base de datos licenciada.",
              "**Software:** el código fuente de la aplicación está bajo licencia **[AGPL-3.0-or-later](https://www.gnu.org/licenses/agpl-3.0.html)**.",
              "**Documentación:** la documentación del proyecto se propone bajo [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).",
              "**OpenStreetMap:** los datos del fondo del mapa se utilizan conforme a las condiciones de OSM/ODbL; se aplican los requisitos de atribución de OSM.",
            ],
          },
        ],
      },
      {
        heading: "8. Exención de responsabilidad sobre la exactitud",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "OpenSurveillanceDB es un **conjunto de datos cívico mantenido por la comunidad, no un registro oficial ni una declaración de hechos jurídicos.** Las fichas pueden ser incompletas, estar desactualizadas o ser inexactas pese al mantenimiento de la comunidad; la publicación es inmediata, no conservadora.",
              "No te bases en el conjunto de datos para decisiones oficiales o críticas para la seguridad. Contrástalo con fuentes oficiales (por ejemplo, la administración pública competente) antes de actuar en consecuencia. El Servicio solo ofrece información sobre infraestructura visible: no es un directorio de todas las cámaras, y la ausencia de una ficha no demuestra nada.",
              "Las fichas procedentes de fuentes oficiales indican su fuente y su fecha de verificación; las fichas de la comunidad no ofrecen esa garantía.",
              "Las coordenadas publicadas se redondean a **~4 decimales (~10 m)**, una precisión a nivel de zona. La ubicación exacta nunca se publica y permanece en la base de datos.",
            ],
          },
        ],
      },
      {
        heading: "9. Privacidad",
        blocks: [
          {
            type: "paragraph",
            text: "Tu uso del Servicio se rige por el [aviso de privacidad](/privacy). Puntos clave: sin rastreo ni publicidad comportamental; los reportes son públicos en cuanto se publican y las solicitudes privadas de corrección siguen siendo privadas; puedes ejercer tus derechos del RGPD a través de [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) dentro de los plazos legales (art. 12(3) RGPD).",
          },
        ],
      },
      {
        heading: "10. Disponibilidad y limitación de responsabilidad",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "El Servicio se ofrece **\"tal cual\" y \"según disponibilidad\"**, sin garantías de exactitud, integridad, disponibilidad ni idoneidad para un fin determinado.",
              "En la máxima medida permitida por la ley, el proyecto y sus colaboradores **no son responsables** de ningún daño —incluidas las pérdidas indirectas, incidentales o consecuentes— derivado del uso del Servicio o de sus datos, o de la confianza depositada en ellos. En particular, el proyecto no es responsable de las decisiones tomadas sobre la base del conjunto de datos.",
              "Nada de lo dispuesto en estas condiciones excluye ni limita la responsabilidad que no pueda excluirse ni limitarse por ley (por ejemplo, fraude, muerte o lesiones personales causadas por negligencia, o derechos imperativos de protección de los consumidores).",
              "El Servicio no está pensado para usos de emergencia o críticos para la seguridad; no sustituye a los canales de información oficiales.",
            ],
          },
        ],
      },
      {
        heading: "11. Suspensión y eliminación",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "Podemos suspender o limitar el acceso, o eliminar contenido, cuando sea necesario para hacer cumplir estas condiciones, para proteger a los usuarios o a los interesados, o en aplicación de las normas de publicación, procurando informar a la persona afectada cuando sea proporcionado y posible.",
              "Los colaboradores pueden solicitar la eliminación de sus reportes a través de [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org); las fichas publicadas siguen siendo públicas mientras la comunidad las siga confirmando, y siguen las vías de corrección y retirada de la sección 6.",
            ],
          },
        ],
      },
      {
        heading: "12. Legislación aplicable y jurisdicción",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "Estas condiciones se rigen por el **Derecho de la UE y, cuando proceda, por el Derecho italiano**; en particular, por el RGPD y el D.Lgs. 196/2003 (Codice Privacy, modificado por el D.Lgs. 101/2018).",
              "**Litigios:** son competentes los tribunales del lugar donde está establecido el responsable (Italia), **sin perjuicio** del derecho de los consumidores residentes en la UE a ejercitar acciones ante los tribunales de su propio país de residencia y de la protección que les otorgan sus disposiciones nacionales imperativas.",
              "**Reclamaciones:** puedes presentar una reclamación ante la autoridad de control competente; en Italia, el [Garante per la protezione dei dati personali](https://www.garanteprivacy.it).",
            ],
          },
        ],
      },
      {
        heading: "13. Cambios en estas condiciones",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "Estas condiciones están versionadas y se guardan en el repositorio. Los **cambios sustanciales** (finalidad, licencias, publicación de datos, gobernanza) requieren una propuesta pública documentada y un periodo razonable de comentarios.",
              "Los cambios no sustanciales entran en vigor con su publicación, acompañada de un aviso. El uso continuado del Servicio tras la fecha de entrada en vigor implica su aceptación; cuando la ley exija consentimiento, este se obtendrá por separado.",
            ],
          },
        ],
      },
      {
        heading: "14. Contacto",
        blocks: [
          {
            type: "list",
            items: [
              "**Privacidad, correcciones, derechos:** [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) (buzón dedicado).",
              "Las emergencias legales y las denuncias de abuso utilizan el mismo canal (ocultación inmediata).",
            ],
          },
        ],
      },
    ],
  },

  licenses: {
    eyebrow: "Legal · Licencias",
    title: "Licencias",
    intro:
      "Bajo qué licencias se distribuyen el software, la documentación y los datos de OpenSurveillanceDB, y qué implica eso para su reutilización.",
    versionNote:
      "Actualizado el 31 de julio de 2026 (decisión sobre la licencia de los datos — ADR 0008) y el 5 de agosto de 2026 (conjuntos de datos públicos importados). La copia del repositorio (docs/OPEN_SOURCE.md) sigue siendo la versión canónica.",
    sections: [
      {
        heading: "1. Software",
        blocks: [
          {
            type: "paragraph",
            text: "El código fuente de la aplicación está bajo licencia **AGPL-3.0-or-later**. Esto garantiza que las versiones modificadas que se ofrezcan como servicio en red sigan a disposición de la comunidad. Consulta el archivo [LICENSE](https://github.com/Syax89/open-surveillance-db/blob/main/LICENSE).",
          },
        ],
      },
      {
        heading: "2. Documentación",
        blocks: [
          {
            type: "paragraph",
            text: "Salvo que un documento indique lo contrario, la documentación del proyecto se propone bajo [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Los colaboradores conservan el reconocimiento de sus contribuciones a través del historial habitual del repositorio.",
          },
        ],
      },
      {
        heading: "3. Base de datos y exportaciones",
        blocks: [
          {
            type: "paragraph",
            text: "La base de datos pública y todos los formatos de exportación están bajo licencia **[ODbL 1.0](https://opendatacommons.org/licenses/odbl/)**, con avisos claros de atribución y de compartir igual (decisión del 31 de julio de 2026, [ADR 0008](https://github.com/Syax89/open-surveillance-db/blob/main/docs/decisions/0008-data-licence-precision-retention-contact.md)). Se permite la reutilización, también con fines comerciales, siempre que atribuyas la base de datos y, si creas una base de datos derivada, la compartas bajo ODbL 1.0.",
          },
          {
            type: "note",
            text: "Las fuentes importadas conservan su propia licencia y atribución; la licencia ODbL se aplica a la compilación propia del proyecto (véase la sección 6).",
          },
        ],
      },
      {
        heading: "4. Datos de OpenStreetMap",
        blocks: [
          {
            type: "paragraph",
            text: "Los datos de OpenStreetMap están disponibles bajo la [Open Database License](https://www.openstreetmap.org/copyright). Utilizar un fondo de mapa de OSM no convierte automáticamente cada ficha del proyecto en una contribución a OSM. Si se importan datos de OSM, se derivan de ellos o se combinan en una base de datos derivada, el proyecto debe documentar esa relación, proporcionar la atribución requerida y cumplir las obligaciones de la ODbL.",
          },
        ],
      },
      {
        heading: "5. Compromiso de los colaboradores",
        blocks: [
          {
            type: "paragraph",
            text: "Los colaboradores solo deben enviar material que tengan derecho a compartir. Conceden al proyecto los derechos necesarios para publicar el código, la documentación y los datos aceptados bajo la licencia del proyecto correspondiente. ",
          },
        ],
      },
      {
        heading: "6. Conjuntos de datos públicos importados",
        blocks: [
          {
            type: "paragraph",
            text: "El proyecto puede integrar conjuntos de datos públicos publicados por administraciones públicas y proyectos de datos abiertos (por ejemplo, inventarios municipales de cámaras o los elementos de videovigilancia de OpenStreetMap). Cada fuente integrada conserva su propia licencia y atribución: la licencia de la base de datos indicada arriba se aplica a la compilación propia del proyecto y nunca sustituye a la licencia de una fuente individual. La página [Fuentes de datos](/fonti) enumera cada conjunto de datos importado con su fuente, licencia, fecha de importación, número de fichas y el texto de atribución requerido.",
          },
          {
            type: "note",
            text: "Las fichas importadas de una fuente indican su procedencia en la página de la ficha. Están sujetas a la misma verificación comunitaria que cualquier otra ficha y nunca quedan exentas de revisión.",
          },
        ],
      },
    ],
  },

  accessibility: {
    eyebrow: "Información · Accesibilidad",
    title: "Declaración de accesibilidad",
    intro:
      "OpenSurveillanceDB es una base de datos cívica de interés público. Esta declaración describe nuestro compromiso con la accesibilidad, nuestra situación actual de cumplimiento y cómo puedes comunicar una barrera.",
    versionNote:
      "Versión 0.2 — 8 de agosto de 2026. En vigor (proyecto personal de código abierto). La copia del repositorio (docs/ACCESSIBILITY_STATEMENT.md) sigue siendo la versión canónica.",
    sections: [
      {
        heading: "1. Compromiso",
        blocks: [
          {
            type: "paragraph",
            text: "Los recorridos principales —consultar, buscar, enviar y corregir/eliminar— deben poder realizarse con teclado, con tecnologías de apoyo y en pantallas pequeñas, en el idioma piloto y en inglés. El objetivo del producto es **WCAG 2.2 AA** para el sitio web público, con pruebas manuales realizadas por personas con discapacidad antes de ampliar la fase piloto.",
          },
        ],
      },
      {
        heading: "2. Situación de cumplimiento",
        blocks: [
          {
            type: "paragraph",
            text: "**Parcialmente conforme.** El proyecto aplica una base de accesibilidad significativa y ejecuta **comprobaciones automáticas de accesibilidad (Lighthouse ≥ 0.95) en cada pull request**; sigue prevista una auditoría manual completa de conformidad con las WCAG 2.2 A/AA por parte de usuarios de tecnologías de apoyo. Las limitaciones conocidas se enumeran a continuación.",
          },
        ],
      },
      {
        heading: "3. Qué está ya implementado",
        blocks: [
          {
            type: "list",
            items: [
              "Un enlace para saltar al contenido y un destino de contenido principal en todas las páginas.",
              "Estados de foco de teclado visibles y un orden de foco lógico.",
              "Compatibilidad con `prefers-reduced-motion` (animaciones reducidas cuando se solicita).",
              "Un directorio de texto con búsqueda y páginas de detalle de las fichas que funcionan **sin interactuar con el mapa**; el mapa y el directorio presentan los mismos campos públicos.",
              "Selección de la ubicación del reporte mediante una solicitud explícita de ubicación del dispositivo (cuando se concede el permiso del navegador), un clic en el mapa **o** coordenadas manuales validadas; las alternativas del mapa y la introducción manual siguen disponibles.",
              "Una interfaz en inglés/italiano con una preferencia de idioma guardada localmente en el dispositivo; la elección del idioma no afecta a los datos de la API.",
              "Una guía bilingüe integrada en [/guide](/guide) que explica los estados de los datos y el flujo de publicación.",
              "La información de estado nunca se transmite solo mediante el color (se usan etiquetas de texto e iconos).",
            ],
          },
        ],
      },
      {
        heading: "4. Limitaciones conocidas",
        blocks: [
          {
            type: "list",
            items: [
              "**Las tareas del mapa pueden realizarse con teclado.** Los marcadores del mapa pueden recibir el foco y responden a Intro/Espacio (abrir/cerrar la ventana emergente); la alternativa de lista de texto permite consultar y buscar fichas sin el mapa.",
              "**Todavía no hay una auditoría manual de conformidad.** No se ha realizado una auditoría manual completa con lectores de pantalla, zoom al 200 %, comprobación del contraste y dispositivos de pantalla pequeña; las comprobaciones automáticas se ejecutan en cada pull request y la auditoría manual está prevista.",
              "**Algunos textos visibles para el usuario siguen definidos directamente** en los componentes mientras están en curso la externalización de los textos de la interfaz y la revisión del idioma piloto.",
              "**La página dedicada de comentarios (/feedback) aún no está disponible.** Las barreras se comunican a través de los canales de la sección 5.",
            ],
          },
        ],
      },
      {
        heading: "5. Cómo comunicar una barrera",
        blocks: [
          {
            type: "paragraph",
            text: "El proyecto ofrece **canales de comentarios sobre usabilidad no sensibles** para que cualquiera pueda comunicar una barrera de la interfaz **sin crear una cuenta y sin facilitar datos personales**. Los canales solo piden:",
          },
          {
            type: "list",
            items: [
              "el tipo de barrera (navegación/teclado, lector de pantalla, color/contraste, zoom/diseño, otra);",
              "una descripción en lenguaje sencillo de lo que ha ocurrido;",
              "opcionalmente, la URL de la página donde se ha producido la barrera;",
              "opcionalmente, una dirección de contacto, **solo si** quieres recibir respuesta (nunca obligatoria, nunca utilizada para nada más y eliminada una vez cerrado el intercambio).",
            ],
          },
          {
            type: "paragraph",
            text: "Comunica las barreras de accesibilidad a través de uno de estos canales:",
          },
          {
            type: "list",
            items: [
              "abre una issue en el repositorio del proyecto (solo contenido público y no sensible: no incluyas datos personales ni ubicaciones privadas);",
              "usa el [formulario de corrección](/) de la página pública para problemas relacionados con una ficha concreta;",
              "escribe al contacto de privacidad indicado en el [aviso de privacidad](/privacy): [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org).",
            ],
          },
          {
            type: "paragraph",
            text: "**Compromiso de respuesta:** los comentarios se gestionan con los mismos plazos que las solicitudes de corrección y de retirada: un acuse de recibo en **48 horas** y una respuesta de fondo en **14 días**, en el idioma del mensaje cuando sea posible.",
          },
        ],
      },
      {
        heading: "6. Calendario de revisión",
        blocks: [
          {
            type: "paragraph",
            text: "Esta declaración se revisa tras cada versión que modifique la interfaz o el comportamiento de accesibilidad; al menos una vez al trimestre una vez que el servicio esté en funcionamiento; y antes de cualquier lanzamiento público, registrando aquí los resultados finales de conformidad y las excepciones conocidas.",
          },
        ],
      },
    ],
  },
};
