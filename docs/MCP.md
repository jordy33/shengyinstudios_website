# Shengyin Studios — API de analíticas para el bot

Documentación de acceso a las métricas de la landing (`link.shengyinstudios.site`).
Todo lo que el bot necesita para medir qué contenido funciona y decidir el siguiente.

---

## 0. Arquitectura de dominios

**Un solo proceso (puerto 7008) sirve tres dominios.** El túnel de Cloudflare manda
todo al mismo puerto, y la app distingue por el header `Host`.

| Dominio | Qué sirve | Para quién |
|---|---|---|
| **`www.shengyinstudios.site`** | Landing completa (logo + botones + About) | Quien te busca a propósito |
| **`link.shengyinstudios.site`** | Solo logo + botones | **El link en bio** |
| `shengyinstudios.site` | *(raíz — ver nota)* | — |

### Por qué dos frontales

```
link.  →  alguien viene de un short y quiere escuchar YA
          (mínima fricción: logo y cinco botones)

www.   →  alguien quiere saber quién eres
          (además de los botones: qué es el sello)
```

**Ambos leen el mismo `/api/links`**, así que nunca pueden discrepar sobre qué
plataformas están activas.

### Cómo se distingue en el código

```javascript
function hostOf(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .toLowerCase().split(':')[0];
}

app.get('/', (req, res) => {
  const host = hostOf(req);
  if (host.startsWith('link.')) {
    return res.sendFile(path.join(ROOT, 'public', 'index.html'));   // botones
  }
  return res.sendFile(path.join(ROOT, 'public', 'home.html'));     // landing
});
```

> **Nota:** el dominio raíz (`shengyinstudios.site` sin `www`) no respondía al
> momento de escribir esto. Si se necesita, hay que apuntarlo al túnel en Cloudflare
> o crear un redirect a `www`.

### Todas las superficies son alcanzables desde cualquier dominio

El enrutamiento por host **solo afecta a `/`**. El MCP, la API y el dashboard
responden igual desde los tres dominios. Este documento usa `link.` por brevedad.

---

## 1. Autenticación

Hay **dos superficies** con tokens distintos. No son intercambiables.

### 1.1 MCP — para consultar la base de datos

Único token, obligatorio. **Todas** las peticiones al MCP lo requieren; sin él la
respuesta es `401`.

> **El token no está en este documento ni en el repositorio.** Es un secreto.
>
> Vive en dos lugares:
>
> | Dónde | Para qué |
> |---|---|
> | `/etc/supervisor/conf.d/shengyin.conf` en el servidor | Lo que usa la app |
> | El gestor de contraseñas / notas privadas del dueño | Respaldo |
>
> Se genera con `openssl rand -hex 32`. El procedimiento para rotarlo está en
> `server/deploy/README.md`. Si el archivo de supervisor pierde el token,
> **el MCP se cierra solo** (fail closed) en lugar de quedar abierto.

Se acepta de tres formas. **Usa la primera.**

| Método | Cabecera / URL | Cuándo |
|---|---|---|
| **Bearer** (recomendado) | `Authorization: Bearer <MCP_TOKEN>` | Estándar, no queda en logs de URL |
| Header propio | `X-MCP-Token: <token>` | Scripts simples |
| Query string | `?token=<token>` | Solo para clientes que no pueden mandar cabeceras |

> El token se compara en tiempo constante. Si lo rotas, hay que actualizar
> `MCP_TOKEN` en `/etc/supervisor/conf.d/shengyin.conf` y reiniciar el proceso.

### 1.2 REST — `/api/stats` y `/stats`

Estas rutas están **abiertas** (sin token). Solo devuelven agregados, no SQL
libre. Si en el futuro se cierran, se controla con la variable `STATS_TOKEN`,
independiente de `MCP_TOKEN`.

---

## 2. MCP — el acceso recomendado

### 2.1 Endpoints

```
https://link.shengyinstudios.site/mcp     ← Streamable HTTP (usa este)
https://link.shengyinstudios.site/sse     ← SSE (compatibilidad, deprecado)
https://link.shengyinstudios.site/messages ← mensajes del SSE
```

`/mcp` es el estándar actual. `/sse` existe solo para clientes antiguos; el
transporte SSE está deprecado en el SDK y desaparece en la próxima versión mayor.

### 2.2 Configuración del cliente

```json
{
  "mcpServers": {
    "shengyin": {
      "url": "https://link.shengyinstudios.site/mcp",
      "headers": {
        "Authorization": "Bearer <MCP_TOKEN>"
      }
    }
  }
}
```

### 2.3 Herramientas

#### `get_stats`

Agregados principales. **Empieza por aquí** — una llamada cubre lo habitual.

| Parámetro | Tipo | Descripción |
|---|---|---|
| `days` | entero 1–365, opcional | Ventana hacia atrás. Por defecto `30`. |

Devuelve:

```json
{
  "generated_at": "2026-10-05T01:36:00.000Z",
  "window_days": 30,
  "totals":     { "clicks": 0, "visitors": 0, "active_days": 0 },
  "all_time":   { "clicks": 0, "active_days": 0, "first_day": null, "last_day": null },
  "by_link":    [{ "link_id": "youtube", "clicks": 12, "visitors": 9 }],
  "by_referrer":[{ "referrer": "tiktok", "clicks": 30, "visitors": 22 }],
  "by_content": [{ "source": "tiktok", "content": "hook-01", "clicks": 18, "visitors": 15 }],
  "by_day":     [{ "day": "2026-10-05", "clicks": 7, "visitors": 6 }],
  "by_country": [{ "country": "MX", "clicks": 20 }],
  "by_device":  [{ "device": "mobile", "clicks": 41 }]
}
```

#### `describe_schema`

Columnas reales de la tabla, leídas de `information_schema`, más las notas de uso.

| Parámetro | Tipo | Descripción |
|---|---|---|
| `table` | string, opcional | Por defecto `clicks`. |

Úsala antes de escribir SQL si no estás seguro de un nombre de columna.

#### `query`

**SQL libre de solo lectura.** Para todo lo que `get_stats` no cubre.

| Parámetro | Tipo | Descripción |
|---|---|---|
| `sql` | string, requerido | Un `SELECT` o `WITH … SELECT`. Sin punto y coma final. |
| `params` | array opcional | Valores para los `?` de la consulta. |

Devuelve `{ row_count, truncated, max_rows, rows }`.

**Límites impuestos por el servidor:**

- Solo `SELECT` / `WITH`. Se rechaza cualquier otra cosa.
- **Una sola sentencia.** Los comentarios se eliminan antes de validar, así que
  no se puede esconder un `;` en un `--` ni en un `/* */`.
- Palabras prohibidas: `insert`, `update`, `delete`, `drop`, `truncate`, `alter`,
  `create`, `replace`, `grant`, `revoke`, `rename`, `load_file`, `into outfile`,
  `into dumpfile`, `lock tables`, `call`, `handler`, `set global`, `shutdown`, `kill`.
- Timeout de **10 segundos** por consulta (`MAX_EXECUTION_TIME`).
- Máximo **500 filas**. Si se corta, `truncated: true` y `row_count` trae el total real.

---

## 3. Esquema de datos

Una sola tabla: **`clicks`** — un registro por clic en la landing.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | BIGINT | Identificador incremental |
| `link_id` | VARCHAR(64) | Plataforma destino: `spotify`, `apple`, `youtube`, `tiktok`, `instagram` |
| `ts` | DATETIME(3) | Momento exacto del clic, **en UTC** |
| `day` | DATE | Día del clic (UTC) — usa esta para agrupar por fecha |
| `referrer` | VARCHAR(64) | Red social de origen, ya clasificada: `tiktok`, `instagram`, `youtube`, `facebook`, `google`, `x`, `directo` |
| `utm_source` | VARCHAR(64) | `?utm_source` del link |
| `utm_medium` | VARCHAR(64) | `?utm_medium` del link |
| `utm_campaign` | VARCHAR(64) | `?utm_campaign` del link |
| **`utm_content`** | VARCHAR(128) | `?utm_content` — **identifica el short concreto** (`hook-01`). Es la columna clave para atribución |
| `country` | CHAR(8) | País ISO-2 desde el header de Cloudflare (`MX`) |
| `device` | VARCHAR(16) | `mobile`, `tablet` o `desktop` |
| `visitor` | CHAR(16) | Hash diario del visitante, sin IP. Para contar únicos |

### Notas de interpretación

- **`visitors` siempre es `COUNT(DISTINCT visitor)`.** El hash rota cada día, así
  que un visitante que vuelve otro día cuenta de nuevo. Es "únicos por día", no
  "usuarios únicos".
- **Filtra por ventana con:** `WHERE day >= CURDATE() - INTERVAL 30 DAY`
- **No hay IPs ni datos personales.** El hash se calcula con `sha256(salt|ip|día)`
  y la IP se descarta inmediatamente.

---

## 4. Cómo se etiqueta un short

El link que va en la bio o en la descripción lleva UTM. Ejemplo para el short `hook-01`:

```
https://link.shengyinstudios.site/?utm_source=tiktok&utm_content=hook-01
```

- `utm_source` → de qué red viene (y el `referrer` lo confirma)
- `utm_content` → **qué video específico** (esto es lo que cierra la atribución)

Cambia `utm_content` en cada publicación. El bot puede entonces preguntar:

```sql
SELECT utm_content AS video, COUNT(*) AS clicks,
       COUNT(DISTINCT country) AS paises, COUNT(DISTINCT visitor) AS unicos
FROM clicks
WHERE utm_content IS NOT NULL AND day >= CURDATE() - INTERVAL 7 DAY
GROUP BY utm_content
ORDER BY clicks DESC
```

Esa consulta responde: **¿qué short funcionó mejor esta semana?**

---

## 5. Llamadas de ejemplo

### 5.1 Handshake e inventario de herramientas

```bash
TOKEN=<MCP_TOKEN>
URL=https://link.shengyinstudios.site/mcp

curl -s -X POST "$URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

### 5.2 Consulta SQL

```bash
curl -s -X POST "$URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"query","arguments":{"sql":"SELECT link_id, COUNT(*) AS clicks FROM clicks GROUP BY link_id ORDER BY clicks DESC"}}}'
```

### 5.3 Resumen de 7 días

```bash
curl -s -X POST "$URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_stats","arguments":{"days":7}}}'
```

### 5.4 Respuesta

Las respuestas llegan como **Server-Sent Events**, aunque pidas JSON:

```
event: message
data: {"result":{"content":[{"type":"text","text":"{\"row_count\":1,...}"}]},"jsonrpc":"2.0","id":2}
```

Hay que tomar la línea que empieza con `data: `, quitarle ese prefijo y parsear
el JSON. Un cliente MCP lo hace solo; si llamas a mano con `curl`, hay que hacerlo.

---

## 6. Alternativa sin MCP

Si el bot prefiere REST simple, sin handshake MCP:

| Ruta | Auth | Devuelve |
|---|---|---|
| `GET /api/stats?days=30` | ninguna | Los mismos agregados que `get_stats` |
| `GET /api/links` | ninguna | Catálogo de links y si están activos |
| `GET /healthz` | ninguna | Estado del servicio y rutas MCP |

```bash
curl -s "https://link.shengyinstudios.site/api/stats?days=30"
```

**Limitación:** `/api/stats` solo entrega agregados fijos. Para preguntas
arbitrarias (cruces país × video, series temporales de un short concreto) hay
que usar el MCP.

---

## 7. Errores comunes

| Respuesta | Causa | Solución |
|---|---|---|
| `401 unauthorized: missing or invalid MCP token` | Token ausente o incorrecto | Revisa `Authorization: Bearer …` |
| `503 MCP disabled: no MCP_TOKEN configured` | El servidor no tiene token | Falta `MCP_TOKEN` en el conf de supervisor |
| `Parse error: Invalid JSON` | Faltó la cabecera `Accept` o el body llegó mal | Manda `Accept: application/json, text/event-stream` |
| `only SELECT / WITH queries are allowed` | Intentaste escribir | El MCP es de solo lectura, por diseño |
| `only a single statement is allowed` | Dos sentencias separadas por `;` | Manda una sola consulta |
| `405 Method not allowed` | `GET`/`DELETE` sobre `/mcp` sin sesión | Usa `POST` para las llamadas |

---

## 8. Operación del servidor

```bash
# Estado del proceso
sudo supervisorctl status shengyin

# Reiniciar tras cambiar el token o el código
sudo supervisorctl restart shengyin

# Logs
tail -50 /var/log/shengyin.out.log
tail -50 /var/log/shengyin.err.log
```

**Rotar el MCP_TOKEN:**

```bash
NEW=$(openssl rand -hex 32)
sudo sed -i "s/MCP_TOKEN=\"[^\"]*\"/MCP_TOKEN=\"$NEW\"/" /etc/supervisor/conf.d/shengyin.conf
sudo supervisorctl restart shengyin
echo "Nuevo token: $NEW"
```

---

## 9. Resumen para el bot

```
MCP:    https://link.shengyinstudios.site/mcp
Auth:   Authorization: Bearer <MCP_TOKEN>
Tools:  get_stats · describe_schema · query (SQL libre, solo lectura)
Tabla:  clicks  (atribución por utm_content)
Flujo:  etiquetar short con ?utm_source=X&utm_content=ID
        → publicar
        → leer by_content o consultar por utm_content
        → repetir lo que funcione
```
