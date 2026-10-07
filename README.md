# Shengyin Studios

Sitio web y API de analíticas de **Shengyin Studios**, sello discográfico independiente.

> 声 shēng · 音 yīn — voz y tono. Juntos, el fenómeno de cualquier sonido acústico
> que el oído humano puede percibir.

---

## Qué hay aquí

Un solo proceso Node sirve **tres dominios** y expone una **API de analíticas con MCP**
para que un agente pueda consultar las métricas.

```
                    Cloudflare Tunnel
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
shengyinstudios.site   www.shengyin...   link.shengyin...
        │                  │                  │
        └──────────────────┴──────────────────┘
                           ▼
                  Puerto 7008 (Node)
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   Landing (www)     Botones (link)     MCP + API
```

### Los tres dominios

| Dominio | Qué sirve | Para quién |
|---|---|---|
| `www.shengyinstudios.site` | Landing completa (logo, botones, About) | Quien busca el sello |
| `link.shengyinstudios.site` | Solo logo y botones | **El link en bio** |
| `shengyinstudios.site` | La landing | — |

Se distinguen por el header `Host`, no por puertos distintos. **Un proceso, tres puertas.**

### El MCP

Permite que un agente consulte la base de datos de clics con SQL libre de solo lectura.
Es lo que cierra el ciclo: publicar → medir → decidir el siguiente contenido.

| Herramienta | Qué hace |
|---|---|
| `get_stats` | Agregados por ventana de días |
| `describe_schema` | Columnas de la tabla |
| `query` | SELECT libre (con guardas) |

Detalle completo en [`docs/MCP.md`](docs/MCP.md).

---

## Estructura

```
.
├── server/
│   ├── src/
│   │   ├── server.js         Express: landing, API de clics, enrutamiento por host
│   │   ├── mcp.js            Herramientas del MCP (get_stats, describe_schema, query)
│   │   └── mcp-mount.js      Transportes: Streamable HTTP + SSE
│   ├── public/
│   │   ├── home.html         Landing (www)
│   │   ├── index.html        Botones (link)
│   │   ├── stats.html        Dashboard
│   │   ├── logo-web.svg      Logo vectorial transparente
│   │   └── cover.jpg         El arco (también usado como og:image)
│   └── deploy/
│       ├── shengyin.conf.example   Plantilla de supervisor (el real NO va al repo)
│       └── README.md
├── docs/
│   ├── PLAN-SISTEMA.md       La receta completa del proyecto
│   ├── MCP.md                API de analíticas y arquitectura de dominios
│   ├── INSTAGRAM.md          Guía de Instagram + API de Meta
│   └── COVER-FACEBOOK.md     El cover y su fundamento
└── tools/
    └── drive.js              Cliente CDP sin dependencias (automatización de navegador)
```

---

## Requisitos

- **Node.js 20+**
- **MySQL 8** con una base `shengyingstudios`
- Opcional: **supervisor** para mantener el proceso vivo

---

## Instalación

```bash
npm install
```

### Variables de entorno

El proceso lee su configuración del entorno. **Ninguna credencial va en el repo.**

| Variable | Por defecto | Notas |
|---|---|---|
| `PORT` | `7008` | |
| `DB_HOST` | `127.0.0.1` | |
| `DB_PORT` | `3306` | |
| `DB_USER` | — | **Requerido** |
| `DB_PASSWORD` | — | **Requerido** |
| `DB_NAME` | `shengyingstudios` | |
| `MCP_TOKEN` | *(vacío)* | **Si falta, el MCP se cierra** (fail closed) |
| `STATS_TOKEN` | *(vacío)* | Si falta, `/stats` y `/api/stats` quedan abiertos |

Generar un token nuevo:

```bash
openssl rand -hex 32
```

### Esquema

La tabla se crea sola al arrancar si no existe:

```sql
CREATE TABLE clicks (
  id           BIGINT UNSIGNED AUTO_INCREMENT,
  link_id      VARCHAR(64)  NOT NULL,
  ts           DATETIME(3)  NOT NULL,
  day          DATE         NOT NULL,
  referrer     VARCHAR(64)      NULL,
  utm_source   VARCHAR(64)      NULL,
  utm_medium   VARCHAR(64)      NULL,
  utm_campaign VARCHAR(64)      NULL,
  utm_content  VARCHAR(128)     NULL,
  country      CHAR(8)          NULL,
  device       VARCHAR(16)      NULL,
  visitor      CHAR(16)         NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## Correr

```bash
# desarrollo
npm run dev

# producción
npm start
```

### Con supervisor

```bash
# 1. Copiar la plantilla y llenar los valores reales
sudo cp deploy/shengyin.conf.example /etc/supervisor/conf.d/shengyin.conf
sudo nano /etc/supervisor/conf.d/shengyin.conf

# 2. Registrar y arrancar
sudo supervisorctl reread && sudo supervisorctl update
sudo supervisorctl status shengyin

# 3. Tras un cambio de código
sudo supervisorctl restart shengyin
```

---

## Rutas

| Ruta | Auth | Qué devuelve |
|---|---|---|
| `GET /` | — | Landing o botones, según el `Host` |
| `POST /api/click` | — | Registra un clic (lo llama la página) |
| `GET /api/links` | — | Catálogo de plataformas y su estado |
| `GET /api/stats?days=30` | `STATS_TOKEN` | Agregados en JSON |
| `GET /stats` | `STATS_TOKEN` | Dashboard |
| `GET /healthz` | — | Estado del servicio |
| `POST/GET /mcp` | `MCP_TOKEN` | **MCP — Streamable HTTP** |
| `GET /sse` + `POST /messages` | `MCP_TOKEN` | MCP — SSE (compatibilidad) |

---

## Cómo se mide

Cada botón de la landing tiene un `id` estable (`spotify`, `apple`, `youtube`,
`tiktok`, `instagram`). Al hacer clic, la página manda un evento con:

- **`referrer`** — la red de origen, ya clasificada
- **`utm_content`** — **qué video específico** trajo el clic
- **`country`** y **`device`**
- **`visitor`** — hash diario del visitante, **sin guardar la IP**

El link que va en cada bio lleva su UTM:

```
https://link.shengyinstudios.site/?utm_source=tiktok&utm_content=hook-01
```

Eso permite responder la única pregunta que importa: **¿qué contenido trae gente?**

---

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/PLAN-SISTEMA.md`](docs/PLAN-SISTEMA.md) | La receta completa: lo hecho, lo pendiente, el bot |
| [`docs/MCP.md`](docs/MCP.md) | Autenticación, herramientas, esquema, dominios |
| [`docs/INSTAGRAM.md`](docs/INSTAGRAM.md) | Configuración de Instagram y la API de Meta |
| [`docs/COVER-FACEBOOK.md`](docs/COVER-FACEBOOK.md) | Por qué el cover es un arco |

---

## Estado

- ✅ Dominio, tres sitios, medición y MCP en producción
- ✅ Perfiles en YouTube, TikTok, Instagram y Facebook
- 🔶 Pendiente: publicar el primer lanzamiento en DistroKid
- ⏳ Pendiente: el bot que publica y mide

---

## Licencia

Privado. Todos los derechos reservados.
