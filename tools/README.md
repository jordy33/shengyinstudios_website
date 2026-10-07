# tools/

Utilidades para automatizar el navegador. Se usaron para configurar los perfiles
del sello (YouTube, TikTok, Instagram, Facebook) sin depender de ninguna API.

---

## drive.js

Cliente del **Chrome DevTools Protocol** sin dependencias. Aprovecha el `WebSocket`
nativo de Node 22+, así que no necesita `npm install`.

### Requisito: Chrome con el puerto de depuración abierto

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9223 \
  --user-data-dir="$HOME/.chrome-shengyin"
```

> **Por qué un perfil dedicado:** Chrome 136+ **ignora** `--remote-debugging-port`
> cuando se usa el directorio de datos por defecto. Y un perfil aparte mantiene lo
> del negocio separado de lo personal.

### Comandos

```bash
node drive.js tabs                              # lista las pestañas abiertas
node drive.js goto <idx|new> <url>              # navega
node drive.js eval <idx> <js>                   # ejecuta JS en la pestaña
node drive.js click <idx> <selector>            # hace clic en un elemento
node drive.js type <idx> <selector> <texto>     # escribe (eventos sintéticos)
node drive.js type-real <idx> <selector> <txt>  # escribe con teclas REALES
node drive.js upload <idx> <selector> <archivo> # sube un archivo a un <input type=file>
node drive.js shot <idx> <salida.png>           # captura de pantalla
node drive.js wait <idx> <selector> [ms]        # espera a que exista un elemento
```

### Cuándo usar `type` y cuándo `type-real`

| Comando | Cuándo |
|---|---|
| `type` | Campos normales. Dispara `input` y `change` por JS |
| **`type-real`** | **Menús de autocompletar** (Facebook, Instagram) |

Los frameworks de React **ignoran los eventos sintéticos** en los widgets de
autocompletar, así que las sugerencias nunca aparecen. `type-real` usa
`Input.dispatchKeyEvent`, que el navegador trata como teclado humano.

### Subir archivos

`upload` usa `DOM.setFileInputFiles` — la única forma de asignar un archivo del
disco a un `<input type=file>`. JavaScript no puede hacerlo por seguridad del
navegador, pero el protocolo de depuración sí.

Así se subieron la foto de perfil, el banner y la portada de la Página.

```bash
node drive.js upload 0 'input[type=file]' ~/ruta/al/logo.png
```

---

## Notas

**Los índices de pestaña cambian** cuando se abre o cierra una. Entre comando y
comando conviene volver a correr `tabs` para confirmar cuál es cuál.

**Esto no reemplaza a las APIs oficiales.** Sirve para configuración puntual y
tareas que no tienen API. Para automatización continua (el bot que publica), el
camino correcto son las APIs — es más estable y no arriesga las cuentas.

**Límite conocido:** Instagram bloquea la edición de enlaces del perfil en
escritorio (`"Editing your links is only available on mobile"`). Es una
restricción del servidor, no de la interfaz — no se puede saltar desde aquí.
