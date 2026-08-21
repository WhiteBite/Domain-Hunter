# Domain Hunter — Verificador masivo de disponibilidad de dominios y generador de nombres

**Español** | [English](README.md) | [Русский](README.ru.md) | [中文](README.zh.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-gold.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/WhiteBite/Domain-Hunter?style=social)](https://github.com/WhiteBite/Domain-Hunter/stargazers)
[![Deploy](https://github.com/WhiteBite/Domain-Hunter/actions/workflows/deploy.yml/badge.svg)](https://github.com/WhiteBite/Domain-Hunter/actions/workflows/deploy.yml)

Verificador gratuito y de código abierto de disponibilidad de dominios en masa y generador de nombres que se ejecuta completamente en tu navegador. Comprueba miles de dominios frente a más de 148 registros TLD mediante RDAP (la alternativa moderna al buscador WHOIS), compara precios entre registradores y brainstormea nombres disponibles con cinco generadores integrados. Sin servidores, sin claves API, sin rastreo.

**[▶ Demo en vivo](https://whitebite.github.io/Domain-Hunter/)** — funciona al instante, no hay nada que instalar.

> **Este es un producto terminado que puedes usar ahora mismo.** Abre <https://whitebite.github.io/Domain-Hunter/> y empieza a comprobar dominios o generar nombres de inmediato. Sin instalación, sin registro, sin claves API, sin rastreo. Toda la aplicación se compila en un único archivo HTML (`dist/index.html`) que también funciona sin conexión desde `file://`. Descárgalo, compártelo, ejecútalo donde quieras.

![Domain Hunter comprobando cinco nombres de marca en 15 TLD — resultados en streaming con badges de estado, precios de primer año y renovación, exportación CSV](docs/screenshot-en-check.png)

Domain Hunter llama directamente a los puntos de terminación **RDAP** de los registros desde el navegador (Verisign, Google Registry, Identity Digital, CentralNic, Radix…) para decirte qué dominios están disponibles. Genera ideas de nombres con marca usando cinco generadores integrados, muestra **precios en vivo de registradores** con el coste total de propiedad a 3 años y exporta todo a CSV, TSV o Markdown. Es una alternativa respetuosa con la privacidad a los servicios de búsqueda WHOIS y las APIs de dominio pagas como WhoisXML o DomainTools: toda la aplicación se compila en un solo archivo HTML autocontenido que también funciona desde `file://`.

## Cómo comprobar la disponibilidad de dominios en masa

Pega hasta 3 000 nombres de dominio, selecciona los TLD que te interesan y pulsa iniciar. Los resultados fluyen en vivo hacia una tabla ordenable con badges de estado, columnas de precios y enlaces de compra por dominio. Las ejecuciones interrumpidas pueden reanudarse después.

- **148 zonas TLD curadas** en 18 infraestructuras de registro (`com net io ai dev app xyz me co uk de nl fr ch so ly tech site online store cloud` y más). Los nuevos gTLD se descubren automáticamente mediante el bootstrap RDAP de IANA en vivo. Los resultados fluyen en vivo hacia una tabla ordenable con badges de estado, columnas de precios y enlaces de compra por dominio. Las ejecuciones interrumpidas pueden reanudarse después. El historial de ejecución con restauración en un clic mantiene tu última búsqueda lista tras recargar.
- **Resultados honestos en tres estados** — `available`, `probably_available` o `unknown`. Para ccTLD de baja confianza, un 404 se corrobora con DNS-over-HTTPS (Cloudflare + Google DNS) antes de que algo sea declarado disponible. Domain Hunter nunca adivina.
- **Fallback del agregador RDAP de Cloudflare** — cuando la consulta RDAP principal falla, se consulta una vez `rdap.cloudflare.com/domain/{domain}` como fallback de transporte y como cruce de contraste para zonas de baja confianza. Un dominio ocupado nunca debe reportarse como libre.
- **Cortesía con los registros** — limitación de tasa AIMD por infraestructura (se respeta el estricto ~1 rps de Google Registry), retroceso automático en HTTP 429 con `Retry-After` y caché de resultados en `localStorage`.

## Cómo comparar precios de dominios entre registradores

La **pestaña Precios** muestra una matriz de precios TLD × registrador con la celda más barata resaltada, banderas de trampa promocional (renovación ≥ 5× primer año) y un CSV exportable. La tabla de resultados incluye una fila de detalle con **comparación completa de precios de registradores** y enlaces de compra/búsqueda clicables para cada dominio disponible.

- **Precios en vivo** de Porkbun y Cloudflare a costo, más instantáneas semanales de Dynadot, Spaceship, ValueDomain, reg.ru y Beget obtenidas vía regctl.sh.
- **Cupones, detección de trampas promocionales** y ordenación por TCO a 3 años. Precios mostrados en USD, RUB o EUR.
- **Enlaces de compra conscientes de cobertura** apuntan al registrador más barato que tenga una plantilla de enlace profundo, no meramente al precio más bajo en la tabla.

## Cómo encontrar ideas de nombres de dominio disponibles

Cinco generadores producen candidatos que puedes comprobar inmediatamente:

1. **Combinador** — raíces × afijos (prefijo, sufijo, ambos)
2. **Mezclador de sílabas** — neologismos con puntuación de pronunciabilidad procedentes de bancos de sílabas derivados de CMUdict
3. **Conjuntos temáticos de palabras** — categorías curadas (tecnología, naturaleza, mitología, colores, constelaciones)
4. **TLD-hacks** — `family` → `fami.ly` estilo splits usando TLDs hackeables
5. **Mutaciones de palabras** — intercambios de vocales, cambios de consonantes, truncamiento, sufijos

Cada candidato se acumula en una bandeja persistente que sobrevive a los cambios de pestaña y muestra el número proyectado de comprobaciones antes de ejecutarlas.

## Dominios caducados a precio de registro

La **pestaña Drops** escanea dominios caducados/expirados e informa de aquellos que aún están disponibles al precio estándar de registro, sin recargas de mercado secundario. Marca cualquier dominio con una estrella para añadirlo a tu lista de vigilancia; la aplicación vuelve a comprobar silenciosamente los dominios favoritos al cargar y señala los cambios de liberados u ocupados.

## Redes sociales

La **pestaña Social** comprueba la disponibilidad de nombres de usuario en plataformas principales (Twitter/X, GitHub, Instagram, YouTube, TikTok, Twitch, Reddit, Telegram) para que puedas asegurar un handle consistente en todas partes.

## Exportar, compartir y organizar

- **Descarga CSV** — archivo compatible con Excel con BOM y comillas adecuadas
- **Copiar como CSV / Markdown / TSV** — formatos de portapapeles para pegar en hojas de cálculo, documentos o Notion
- **Acciones masivas para dominios disponibles** — copia la lista de todos los dominios disponibles, márcalos todos como favoritos a la vez o exporta un CSV solo de disponibles
- **Enlaces de compartición** — `#s=` codifica consulta + zonas e inicia automáticamente la ejecución al abrir
- **Favoritos con lista de vigilancia** — marca cualquier dominio con una estrella en una mini-lista persistente; aparecen badges de liberados/ocupados al recargar
- **Historial de ejecuciones** — las ejecuciones completadas recientes se guardan localmente; haz clic para restaurar toda la búsqueda (consulta, zonas, resultados) en un toque
- **Restaurar última búsqueda** — tras recargar la página, la aplicación restaura tu entrada y selección de zona anteriores para que puedas reanudar al instante
- **Comprobaciones sociales con token de GitHub** — la pestaña Social admite autenticación opcional por flujo de dispositivo de GitHub para búsquedas de nombre de usuario a mayor velocidad
- **Badges de favicon de registradores** — las celdas de precios muestran logotipos de registradores junto a los precios para un escaneo visual rápido

## Atajos de teclado

| Atajo | Acción |
|---|---|
| `/` | Enfocar el cuadro de búsqueda de resultados |
| `Ctrl` + `Enter` | Iniciar la comprobación desde el campo de entrada |
| `Escape` | Cerrar popovers y menús |

## Temas

Temas premium oscuros y claros con transiciones suaves, detección de preferencia del sistema y un interruptor manual en la cabecera. Todos los elementos de la interfaz siguen ratios de contraste WCAG AA.

## Interfaz multilingüe

Disponible en **8 idiomas**: inglés, ruso, español, alemán, portugués, chino, japonés y francés. Cambia desde el menú de idiomas de la cabecera.

![Domain Hunter generadores de nombres en tema oscuro: combinatorio, mezclador de sílabas, conjuntos de palabras temáticas, TLD-hacks y mutaciones](docs/screenshot-en-generators.png)

## Inicio rápido

La compilación es un único archivo HTML autocontenido: ábrelo y funciona:

- **Usa la versión alojada:** <https://whitebite.github.io/Domain-Hunter/>
- **Ejecutar localmente:** abre [`dist/index.html`](dist/index.html) directamente desde el disco (`file://` es totalmente compatible).
- **Compilar desde el código fuente:**

```bash
npm install
npm run build     # produce dist/index.html — un archivo, todo integrado
npm run dev       # servidor de desarrollo Vite
```

Sin backend, sin variables de entorno, sin claves API, nunca.

## Despliega tu propia copia

**GitHub Pages** (lo más fácil):

1. Haz un fork de este repositorio.
2. Settings → Pages → Source: **GitHub Actions** (el workflow `deploy.yml` incluido compila y publica automáticamente en cada push a `main`).
3. Tu copia estará en línea en `https://<tu>.github.io/Domain-Hunter/`.

**Cloudflare Pages:** importa el repositorio, comando de compilación `npm run build`, directorio de salida `dist`.

**Cualquier host estático o disco:** sirve o abre `dist/index.html`. Todas las rutas son relativas (`base: './'`), así que funciona bajo cualquier sub-ruta.

## Guías

Artículos paso a paso publicados junto con la aplicación:

- [Cómo comprobar la disponibilidad de dominios en masa](https://whitebite.github.io/Domain-Hunter/how-to-check-domain-availability-in-bulk.html) — método RDAP, comprobación masiva paso a paso, advertencias de confianza y límite de tasa
- [Ideas de nombres de dominio que realmente están disponibles](https://whitebite.github.io/Domain-Hunter/domain-name-ideas-that-are-actually-available.html) — cinco técnicas de naming: combinatoria, sílabas, hacks TLD, mutaciones, temas

## RDAP vs WHOIS

WHOIS devuelve texto no estructurado: un muro de párrafos legibles por humanos que es difícil de parsear programáticamente y lento de automatizar a escala. RDAP (Registration Data Access Protocol, estandarizado como [RFC 9083](https://www.rfc-editor.org/rfc/rfc9083)) es su sucesor JSON: estructurado, legible por máquina y diseñado para consumo API. Cada punto de terminación que usa Domain Hunter envía cabeceras CORS permisivas, así que tu navegador llama a los registros directamente sin ningún proxy. Eso hace que la comprobación masiva sea rápida, amigable con los límites de tasa y gratuita.

## ¿Para quién es?

- **Inversores en dominios y drop-catchers** — monitorea una lista de vigilancia de cientos de nombres en más de 148 TLD, rastrea dominios caducados/expirados y exporta cambios de liberados u ocupados en CSV.
- **Naming de marcas** — cinco generadores (combinatorio, mezclador de sílabas, conjuntos temáticos, TLD-hacks, mutaciones) producen candidatos que puedes comprobar inmediatamente.
- **Desarrolladores** — compilación MIT en un solo archivo, embebible, sin backend, sin dependencias. Haz un fork, despliégalo, amplíalo.
- **Usuarios preocupados por la privacidad** — sin cuentas, sin registros, sin analíticas. Todo se ejecuta localmente en tu navegador.

## Cómo funciona

1. El navegador habla **directamente a los puntos de terminación RDAP de los registros** — todos los puntos de terminación usados por Domain Hunter tienen CORS abierto, así que no se requiere servidor ni proxy.
2. **HTTP 200 → ocupado**, **404 → no está en el registro** (luego se aplican las reglas de confianza: los gTLD de alta confianza reportan `available`; los ccTLD de baja confianza se doble-comprueban vía DNS-over-HTTPS y se reportan como `probably_available`).
3. **429 / 5xx → reintento con retroceso**; ante fallos persistentes de red o CORS se intenta una vez el agregador RDAP de Cloudflare, luego asume el control la corroboración DoH.
4. Los resultados se almacenan en caché localmente con un TTL configurable; volver a comprobar es un clic y un interruptor de «ignorar caché» fuerza consultas frescas.

## Zonas compatibles

148 zonas curadas agrupadas por infraestructura de registro: Verisign (`com net cc tv`), Google Registry (`dev app page new day how ing meme zip mov foo dad phd prof esq nexus rsvp soy boo channel`), Identity Digital (`io ai me sh ac pro info live world email studio agency` y 54 más), CentralNic (`xyz lol icu cyou bond sbs cfd art` y 21 más), Radix (`tech site online fun space store website press host uno pw`), Uniregistry (`cloud link top win bid loan men`), puntos de terminación ccTLD stealth (`de co us uk nl fr ch ru so ly pl`) y NASK Polonia (`pl`). El bootstrap IANA en vivo añade gTLD recién delegados automáticamente.

¿Echas en falta una zona? Es impulsado por datos: basta con añadir una entrada en `src/config/tlds.json`, no hacen falta modificaciones de código.

## Domain Hunter frente a alternativas

| | Domain Hunter | Buscadores de registradores | `whois` CLI | APIs pagas (WhoisXML, DomainTools) |
|---|---|---|---|---|
| Precio | Gratis, MIT | Gratis (te encierra en un registrador) | Gratis | Desde ~$19/mes |
| Comprobación masiva | 3 000 nombres × 148+ TLD | Uno a uno | Se requiere scripting | Sí, medido |
| Servidores / claves API | **Ninguna — se ejecuta en el navegador** | N/A | Instalación local | Clave API + facturación |
| Generadores de nombres | 5 integrados | Sugerencias básicas | Ninguno | Ninguno |
| Precios en vivo + TCO 3 años | Comparación multi-registrador | Solo sus propios precios | Ninguno | Tarifa extra |
| Formatos de exportación | CSV, TSV, Markdown, enlaces de compartición | Ninguno | Manual | Depende |
| Privacidad | Sin rastreo, solo local | Historial de búsqueda registrado | Privado | Registros de consultas |
| Calidad de ideas de nombres | 5 generadores (combinatorio, sílabas, temas, TLD-hacks, mutaciones) | Sugerencias básicas | Ninguno | Ninguno |

Elige una API paga si necesitas SLAs garantizados, feeds de precios de dominios premium o millones de comprobaciones al día. Elige Domain Hunter cuando quieras una forma rápida, gratuita y privada de hacer brainstorming y validar cientos de candidatos ahora mismo.

## FAQ

### ¿Cómo puede comprobar dominios sin servidor ni clave API?

Los registros exponen RDAP (Registration Data Access Protocol, el sucesor moderno de WHOIS) sobre HTTPS, y los puntos de terminación que usa Domain Hunter envían cabeceras CORS permisivas. Tu navegador los llama directamente, exactamente igual que llama a cualquier API pública. Un proxy Cloudflare Worker opcional proporcionado por el usuario puede hacerse cargo de los puntos de terminación testarudos.

### ¿Es preciso el estado "disponible"?

Para infraestructura gTLD con contrato ICANN (Verisign, Google, Identity Digital, …) un 404 RDAP es autoritativo. Para ccTLD con RDAP menos fiable, Domain Hunter corrobora con búsquedas NS de DNS vía DoH y reporta `probably_available` en lugar de sobreprometer. Un dominio aún puede ser registrado por otra persona unos segundos después: una comprobación es una instantánea, así que compra rápidamente.

### ¿Es legal y cortés comprobar dominios vía RDAP con los registros?

Sí. RDAP es la propia interfaz pública y legible por máquina de los registros (existe precisamente para reemplazar el WHOIS raspado). Domain Hunter espacia las peticiones por infraestructura, honra `Retry-After` y reduce la velocidad exponencialmente cuando se limita, por ejemplo Google Registry recibe como máximo ~1 petición/segundo. El límite global de concurrencia mantiene todo bajo control.

### ¿Qué es una trampa promocional y por qué importa el precio de renovación?

Algunos registradores anuncian un primer año a $0.99 pero cobran $25 por renovar. Domain Hunter marca estos como **trampas promocionales** cuando el precio de renovación es 5× o más el precio del primer año. Siempre revisa la columna de renovación y el TCO a 3 años, no solo el precio titular.

### ¿Soportáis IDN y ccTLD como .ru o .de?

Los nombres de dominio internacionalizados se convierten a punycode automáticamente. `de co us uk nl fr ch ru so ly pl` se soportan mediante puntos de terminación RDAP dedicados (`ru` está marcada como experimental debido a restricciones geográficas en su RDAP: el fallback opcional de proxy cubre estos casos).

### ¿Puede funcionar sin conexión o desde disco?

Sí. La compilación de producción es un único archivo `index.html` que funciona desde `file://` con cero peticiones de red. Los datos de precios caen en un instantáneo empaquetado; las comprobaciones de disponibilidad requieren una conexión de red para alcanzar los puntos de terminación RDAP.

### ¿Cómo se determina "disponible" para ccTLD?

Un 404 de ccTLD desencadena dos comprobaciones paralelas: una sonda NS DNS-over-HTTPS (Cloudflare + Google DNS) y, cuando está disponible, una consulta del agregador RDAP de Cloudflare. Si el agregador devuelve 200 el dominio se marca `taken` independientemente del resultado DoH. De lo contrario el resultado DoH permanece: NXDOMAIN → `probably_available`, NOERROR → `taken`, otro → `unknown`.

### ¿Dónde se almacenan mis datos?

En ninguna parte salvo en tu navegador. Configuración, caché, favoritos y conjuntos de palabras personalizados viven en `localStorage` bajo las claves `dh:v1:*`. No hay cuenta, no hay estado del lado del servidor y ningún tipo de analítica.

## Stack tecnológico

Svelte 5 + TypeScript (strict), Vite 7 y `vite-plugin-singlefile`: toda la aplicación (JS, CSS, fuentes, motor de comprobación Web Worker) se compila en **un único archivo HTML** que también funciona desde `file://`. Las pruebas usan Vitest para lógica pura y Playwright E2E (con red simulada) para UI; el CI despliega en GitHub Pages vía GitHub Actions.

## Contribuir

Se aceptan issues y PRs. Buenas primeras contribuciones: nuevas zonas curadas (edita `src/config/tlds.json`), nuevos conjuntos de palabras temáticas (`src/config/dictionaries/`), traducciones (`src/i18n/`). Consulta [AGENTS.md](AGENTS.md) para comandos de compilación/pruebas y convenciones del proyecto.

## Citación

Si haces referencia a Domain Hunter en trabajos académicos o técnicos, utiliza los metadatos en [`CITATION.cff`](CITATION.cff):

```bibtex
@software{domain_hunter_2026,
  author = {WhiteBite},
  title = {Domain Hunter — Bulk Domain Availability Checker & Name Generator},
  version = {2.0.0},
  year = {2026},
  url = {https://github.com/WhiteBite/Domain-Hunter},
  license = {MIT}
}
```

## Licencia

[MIT](LICENSE) — haz lo que quieras, se agradece la atribución.

---

[![Star History Chart](https://api.star-history.com/svg?repos=WhiteBite/Domain-Hunter&type=Date)](https://star-history.com/#WhiteBite/Domain-Hunter&Date)

Si Domain Hunter te ahorró tiempo, una ⭐ ayuda a que otros también lo encuentren.
