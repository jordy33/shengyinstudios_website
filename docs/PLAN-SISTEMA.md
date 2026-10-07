# Plan Shengyin Studios — Receta del Sistema

> **Qué es este documento:** la receta completa, paso a paso, del lanzamiento y su
> sistema de distribución. Incluye **lo ya hecho**, lo pendiente y el orden exacto.
>
> **Estado:** para revisión. No ejecutar hasta aprobación.

---

## 0. La identidad del proyecto (dato corregido)

| Campo | Valor |
|---|---|
| **Sello Discográfico** (Record Label) | **Shengyin Studios** |
| **Artista Principal** | **Jorge Aurelio Macias** |
| Handle / marca | `@ShengyinStudios` |
| Género | Latin fusion · acoustic |
| Concepto | 声 (shēng) = voz · 音 (yīn) = melodía |

### Por qué esta separación importa

```
  Jorge Aurelio Macias   →  EL ARTISTA (quien firma la obra)
  Shengyin Studios       →  EL SELLO (quien la avala)
```

**El sello es la garantía de calidad.** Como un sello editorial: el autor es la persona,
el sello es quien respalda que lo publicado está bien hecho.

**Y esto conecta con la tesis del proyecto:** el diferenciador no es el género ni el
estilo. Es que **todo lo que sale bajo Shengyin Studios está depurado** — nada de destajo.

> ⚠️ **Corrección importante:** en versiones previas de este plan se propuso usar
> "Shengyin Studios" como Artista Principal. **Es incorrecto.** Va como Sello; el
> Artista Principal es Jorge Aurelio Macias.

---

## 1. El principio rector

### El arte se hace a mano. La mecánica se automatiza.

```
  ARTE Y VIDEO          →  MANUAL (Gemini / Seedance / criterio propio)
        ↓
  PRIMEROS CLIPS        →  A MANO, para validar el formato
        ↓
  UNA VEZ PROBADO       →  se automatiza la MECÁNICA, no la creatividad
```

**Por qué:** en "Unicornio" el video se armó con *slices*. Funcionó **una vez**, pero no
es mecánica repetible — cada corte fue una decisión artística.

**El bot no genera arte. El bot distribuye, mide y reporta.**

### Y lo que importa es el disparador

El diseño no gira en torno a "cómo hago el video". Gira en torno a **qué evento inicia
qué acción**:

```
  Tú: "publica el hook-03 de Unicornio en YouTube"
         ↓
  Bot: valida → publica → registra → mide → reporta
```

---

## 2. LA RECETA — Paso 1: Lo ya hecho ✅

### 2.1 Asegurar los canales

| # | Paso | Estado |
|---|---|---|
| 1.1 | Reservar `@ShengyinStudios` en YouTube | ✅ |
| 1.2 | Reservar `@ShengyinStudios` en TikTok | ✅ |
| 1.3 | Reservar `@ShengyinStudios` en Instagram | ✅ |
| 1.4 | Verificar que sea Brand Account en YouTube | ✅ confirmado |

### 2.2 Vestir los perfiles

| Plataforma | Foto | Bio | Link |
|---|---|---|---|
| **YouTube** | ✅ logo 800×800 | ✅ descripción + banner 2560×1440 | ✅ clicable |
| **TikTok** | ✅ logo 200×200 | ✅ | ⛔ requiere 1,000 seguidores |
| **Instagram** | ✅ logo 320×320 | ✅ | ✅ con UTMs de IG |

### 2.3 Seguridad de la cuenta

| # | Paso | Estado |
|---|---|---|
| 1.5 | Correo del negocio `shengyinstudios@gmail.com` | ✅ |
| 1.6 | 2FA (Authenticator + número) | ✅ |
| 1.7 | Perfil de Chrome aislado del personal | ✅ |

### 2.4 Infraestructura de medición

| # | Componente | Estado |
|---|---|---|
| 1.8 | **Dominio propio** `shengyinstudios.site` | ✅ comprado |
| 1.9 | **Landing** `www.shengyinstudios.site` | ✅ con logo, botones y About |
| 1.10 | **Link en bio** `link.shengyinstudios.site` | ✅ logo + botones |
| 1.11 | Base de datos de clics | ✅ MySQL |
| 1.12 | MCP para consulta | ✅ `/mcp` con token |
| 1.13 | Dashboard | ✅ `/stats` |
| 1.14 | Navegador automatizable (CDP) | ✅ `drive.js` probado |

> **Arquitectura:** un solo proceso en el puerto 7008 sirve los tres dominios,
> distinguidos por el header `Host`. Detalle en `MCP.md` §0.

### 2.5 Identidad visual del sello

| # | Componente | Estado |
|---|---|---|
| 1.15 | Logo (anillo + tipografía) | ✅ SVG vectorial |
| 1.16 | Perfiles en las 3 plataformas | ✅ |
| 1.17 | **Página de Facebook** | ✅ con cover y logo |
| 1.18 | **Cover** (el arco dorado) | ✅ generado con Gemini |

> El fundamento del cover —por qué un arco y no una escena— está en
> `COVER-FACEBOOK.md`.

### 2.6 Material de la canción 1

| Activo | Estado |
|---|---|
| Audio máster | ✅ |
| Stems (Logic) | ✅ |
| Partitura (MuseScore `.mscz`) | ✅ |
| Letra | ✅ `lyrics.txt` |
| **Video 16:9** | ✅ 3:03, karaoke + limpio |
| **Ilustraciones** | ✅ 16 imágenes 1920×1080 |
| **SRT de la letra** | ✅ 28 bloques sincronizados |
| Personaje y guion | ✅ `personaje.md`, `escenas.md` |
| Shorts 9:16 | ❌ **no existen** |

---

## 3. LA RECETA — Paso 2: Configurar la distribuidora 🔶

**Aquí estamos.**

### 3.1 Datos para DistroKid

| Campo | Valor |
|---|---|
| **Sello Discográfico** | `Shengyin Studios` |
| **Artista Principal** | `Jorge Aurelio Macias` |
| Canción | `El unicornio del segundo piso` |
| Idioma | Español |
| Fecha de lanzamiento | Hoy (el plan básico no permite programar) |

> **Nota:** el campo "Record Label" solo es editable en Musician Plus. En el plan básico
> quedará `DistroKid.com` en los **créditos técnicos ocultos** — que casi nadie ve.
> El Artista Principal (lo que el público sí ve) es editable siempre.

### 3.2 Decisión pendiente

| Opción | Costo | Qué permite |
|---|---|---|
| **Plan básico** | ~$24/año | Distribuir; sello queda como DistroKid en créditos |
| Musician Plus | ~$43/año | Sello editable + fecha programada |

**Recomendación:** plan básico. La diferencia es cosmética (créditos ocultos) y la fecha
programada no aporta sin audiencia.

### 3.3 Extras opcionales

| Extra | Costo | ¿Ahora? |
|---|---|---|
| Social Media Pack | $4.95/año + 20% anuncios | No urgente (sin audiencia no hay usos) |

> **Aclaración necesaria:** Social Media Pack **no protege contra covers**. Detecta
> **grabaciones** por huella digital, no composiciones. Sirve para cobrar cuando alguien
> use tu máster. No es una defensa.

---

## 4. LA RECETA — Paso 3: Publicar y sincronizar letras

### 4.1 Subir a DistroKid

| # | Paso | Requiere |
|---|---|---|
| 3.1 | Subir el WAV máster | — |
| 3.2 | Portada (3000×3000) | ✅ ya existe |
| 3.3 | Llenar metadata (sello + artista) | decisión §3.2 |
| 3.4 | Publicar | pago |

**Resultado:** en 2-3 días la canción está en 150+ plataformas y **obtienes el ISRC.**

### 4.2 Letras sincronizadas (Musixmatch Pro)

**El ISRC es el ancla.** Sin él, Musixmatch no puede amarrar la canción.

| # | Paso | Herramienta |
|---|---|---|
| 3.5 | Verificar perfil de artista | Link de Spotify/Apple |
| 3.6 | Esperar importación del catálogo (1-2 días) | automático |
| 3.7 | Pegar el texto plano de la letra | `lyrics.txt` ✅ existe |
| 3.8 | **Sincronizar línea por línea** | Manual |
| 3.9 | Verificar en Spotify/Apple | — |

> **Dato verificado:** la sincronización línea por línea es **GRATIS**. El AI Sync
> automático es de pago. La habilidad manual evita el costo.
>
> **Importante:** el SRT de YouTube **no se puede importar**. Hay que rehacer la
> sincronización dentro de Musixmatch.

### 4.3 Identificación sin ambigüedad

| Mecanismo | Función |
|---|---|
| Perfil verificado | Amarra la cuenta a la identidad real |
| **ISRC** | Identificador único mundial de la grabación |
| Duración exacta | Confirma la coincidencia |

Aunque existan 50 canciones con el mismo título, cada ISRC es único. **No hay confusión
posible con clones.**

---

## 5. LA RECETA — Paso 4: Publicar el video

| # | Paso | Depende de |
|---|---|---|
| 4.1 | Subir el video 16:9 a YouTube | DistroKid publicado |
| 4.2 | Título, descripción, tags | — |
| 4.3 | **Link con UTM** en la descripción | landing ✅ |
| 4.4 | Miniatura | por definir |

> **Por qué el video espera a DistroKid:** el video sin canción en plataformas no
> monetiza ni permite Content ID. El orden importa.

---

## 6. LA RECETA — Paso 5: El bot (lo que falta)

### 6.1 Qué hace

```
  1. DISPARADOR   Tú ordenas: "publica X en Y"
        ↓
  2. VALIDAR      ¿Archivo? ¿UTM? ¿Texto?
        ↓
  3. PUBLICAR     YouTube (API) · TikTok (inbox) · Instagram (?)
        ↓
  4. REGISTRAR    UTM único → landing → MySQL
        ↓
  5. MEDIR        MCP: clics por utm_content
        ↓
  6. REPORTAR     "hook-03 trajo 47 clics; hook-01 trajo 12"
```

### 6.2 Vías de publicación (verificadas)

| Plataforma | Vía | Restricción | Estado |
|---|---|---|---|
| **YouTube** | Data API v3 | Ninguna | ✅ **Automatizable hoy** |
| **TikTok** | API → **inbox/drafts** | Sin auditoría solo privado | ✅ Viable con aprobación manual |
| TikTok | API → Direct Post | **Requiere auditoría** | ⚠️ Largo plazo |
| Instagram | Graph API | Cuenta profesional + página FB | ⚠️ Por validar |
| Navegador CDP | `drive.js` | Frágil, contra ToS | 🔶 Solo respaldo |

> **El modo inbox encaja con el modelo:** bot prepara, humano aprueba en el teléfono.
> No es una limitación que sortear — es el flujo que queríamos.

### 6.3 Componentes por construir

| # | Componente | Dificultad | Orden |
|---|---|---|---|
| C1 | CLI del disparador | Baja | 1º |
| C2 | Publicador YouTube (API) | Media | 2º |
| C3 | Cola con UTM automático | Media | 3º |
| C4 | Reportero (consulta MCP) | Baja | 4º |
| C5 | Pipeline de shorts 9:16 | Media | 5º |
| C6 | Publicador TikTok (inbox) | Media | 6º |
| C7 | Publicador Instagram | Alta | 7º |

### 6.4 Sobre Postiz

[Postiz](https://github.com/gitroomhq/postiz-app) es un orquestador open source para 30+
plataformas, con [MCP propio](https://github.com/antoniolg/postiz-mcp).

**Consideración:** Postiz **no elimina** las restricciones de las APIs — las administra.
Si TikTok exige auditoría, Postiz tiene el mismo límite.

| | Publicadores propios | Postiz |
|---|---|---|
| Control | Total | Según el proyecto |
| Trabajo inicial | Alto | Bajo |
| Dependencia | Ninguna | Tercero (open source) |

---

## 7. Ecosistema cross-platform

```
  YouTube Shorts ──┐
  TikTok ──────────┼──→ Landing ──→ Spotify / Apple Music
  Instagram Reels ─┘        │              ▲
                            ▼              │
                     Medición (MySQL)      │
                            │              │
                            ▼              │
                    MCP: ¿qué funcionó? ───┘
                            │
                            └──→ decide el siguiente contenido
```

**Por qué el tráfico externo importa:** cuando mandas audiencia desde redes hacia
Spotify, el algoritmo detecta un pico de búsqueda externa y **eleva la canción** en
playlists algorítmicas (Discover Weekly, Radio).

---

## 8. La tesis: el estándar como diferenciador

| Destajo | Shengyin Studios |
|---|---|
| 1 click, prompt genérico | Partitura → `.abc` → stems → Logic |
| Sin estructura | Armonías y letras depuradas |
| Se salta a los 30 segundos | Se sostiene los 3 minutos |
| Se olvida | Se recuerda |

> **La calidad no es un atributo de una canción. Es un atributo del catálogo.**

Un clon puede producir *una* pieza decente. **No puede sostener el estándar en veinte.**
La réplica se delata a la tercera canción.

**Cómo se comunica:** no se declara, se cumple. El público lo da por hecho con el tiempo.

**Consecuencia para el bot:** debe publicar **poco y bien**.

---

## 9. Riesgos

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| R1 | Auditoría de TikTok para publicar en público | Alto | Usar modo inbox |
| R2 | Instagram exige cuenta profesional + página FB | Medio | Validar antes |
| R3 | Límite diario de publicaciones | Medio | Cadencia conservadora |
| R4 | Tokens OAuth expiran | Medio | Refresco desde el inicio |
| R5 | Detección de bots | Alto | **APIs oficiales, no navegador** |
| R6 | El bot diluye el estándar | Alto | **Curaduría humana obligatoria** |

> **R6 es el más importante.** El bot sostiene el estándar, no lo diluye.

---

## 10. Resumen: la receta en una vista

| Paso | Qué | Estado |
|---|---|---|
| **1** | Asegurar canales y vestir perfiles | ✅ **hecho** |
| **2** | Configurar DistroKid (sello + artista) | 🔶 **aquí estamos** |
| **3** | Publicar canción + sincronizar letras | ⏳ |
| **4** | Publicar video con UTM | ⏳ |
| **5** | Construir el bot | ⏳ |
| **6** | Shorts 9:16 | ⏳ |
| **7** | Escalar a las otras 3 canciones | ⏳ |

### Las otras 3 canciones

| Canción | Audio | Stems | Video | Estado |
|---|---|---|---|---|
| **El unicornio del segundo piso** | ✅ | ✅ | ✅ | lista para publicar |
| **Para Siempre Rosalinda** | ✅ | ✅ 6 | ❌ | falta video |
| **Clandestina** | ✅ | ✅ 6 | ❌ | falta video |
| **Alejandra el gran amor** | ✅ | ❓ | ❌ | falta video |

---

## 11. Fuera de alcance

| Tema | Razón |
|---|---|
| ❌ Generación automática de arte/video | El arte es manual, por decisión |
| ❌ Microdrama | Evaluar con datos reales |
| ❌ INDAUTOR / registro legal | No es el objetivo |
| ❌ El workflow compositivo | Ya está resuelto y dominado |

---

## 12. Decisiones pendientes

| # | Decisión | Opciones |
|---|---|---|
| 1 | ¿Plan básico o Musician Plus? | Básico (recomendado) / Plus |
| 2 | ¿Social Media Pack ahora? | No (recomendado) / sí |
| 3 | ¿Publicadores propios o Postiz? | Propios / Postiz / mixto |
| 4 | ¿Cómo se ejecuta el disparador? | CLI / Telegram / panel |
| 5 | ¿Cadencia de publicación? | Diaria / cada 2 días / semanal |
| 6 | ¿Dónde corre el bot? | Servidor / Mac |

---

## 13. La tesis del plan

> **El arte se hace a mano. La distribución se automatiza.**
>
> Jorge Aurelio Macias firma la obra. Shengyin Studios la avala. El bot se encarga de
> que llegue — pero **no de qué llega**.
>
> Un promo publicado una vez no sirve: la presencia premia la cadencia, y la cadencia
> hecha a mano no escala. Automatizar no significa producir más — significa **sostener
> el estándar sin depender de la memoria y el tiempo de una persona**.
>
> El disparador es tuyo. La ejecución es del bot. El estándar —nada de destajo, todo
> depurado— es lo que ninguno de los dos debe traicionar.

---

*Documento generado para revisión. Ninguna acción ejecutada.*
