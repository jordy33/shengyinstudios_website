# deploy/

Configuración de **supervisor** para mantener el proceso vivo en el servidor.

---

## El archivo real no va al repo

`shengyin.conf` contiene la contraseña de MySQL y el token del MCP **en texto
plano**, porque supervisor los pasa como variables de entorno. Está en
`.gitignore` — **solo se versiona `shengyin.conf.example`**.

El repo dice *qué* variables hacen falta; el servidor tiene los valores.

---

## Instalación en el servidor

```bash
# 1. Copiar la plantilla
sudo cp /home/systemd/shengyin/deploy/shengyin.conf.example \
        /etc/supervisor/conf.d/shengyin.conf

# 2. Llenar los valores reales
sudo nano /etc/supervisor/conf.d/shengyin.conf

# 3. Registrar y arrancar
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl status shengyin
```

---

## Operación

```bash
sudo supervisorctl status shengyin     # ¿está corriendo?
sudo supervisorctl restart shengyin    # tras un cambio de código
sudo supervisorctl stop shengyin
sudo supervisorctl start shengyin

tail -50 /var/log/shengyin.out.log     # salida
tail -50 /var/log/shengyin.err.log     # errores
```

---

## Variables

| Variable | Valor típico | Notas |
|---|---|---|
| `NODE_ENV` | `production` | |
| `PORT` | `7008` | Cloudflare apunta aquí |
| `DB_HOST` | `127.0.0.1` | |
| `DB_PORT` | `3306` | |
| `DB_USER` | *(real)* | **No va al repo** |
| `DB_PASSWORD` | *(real)* | **No va al repo** |
| `DB_NAME` | `shengyingstudios` | |
| `MCP_TOKEN` | `openssl rand -hex 32` | **No va al repo.** Si falta, el MCP se cierra |

---

## Rotar el token del MCP

```bash
NEW=$(openssl rand -hex 32)
sudo sed -i "s/MCP_TOKEN=\"[^\"]*\"/MCP_TOKEN=\"$NEW\"/" \
  /etc/supervisor/conf.d/shengyin.conf
sudo supervisorctl restart shengyin
echo "Nuevo token: $NEW"
```

Después hay que actualizar el token donde lo use el bot.

---

## Nota sobre nginx

**Esta app no usa nginx.** El túnel de Cloudflare habla directo con el puerto
7008. En este servidor hay otros sitios en producción que sí dependen de nginx;
no tocar su configuración.
