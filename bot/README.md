# Bot de Telegram — alertas de BTC 24/7

Vigila el precio de BTC fuera del navegador y te escribe por Telegram cuando cruza
un precio que tú definas. Complementa las alertas de la app, que solo funcionan con
la pestaña abierta.

Sin dependencias: solo Node 18 o superior.

---

## 1. Crear el bot

1. En Telegram busca **@BotFather** y mándale `/newbot`.
2. Te pide un nombre y un usuario (el usuario debe terminar en `bot`).
3. Te devuelve un **token** con esta pinta: `8123456789:AAF...`.

> El token es la contraseña del bot: quien lo tenga controla el bot. No lo subas a
> git ni lo pegues en un chat. Ya está cubierto por `.gitignore`.

## 2. Arrancarlo

Desde la carpeta del proyecto, en PowerShell:

```powershell
$env:TELEGRAM_TOKEN = "8123456789:AAF..."
npm run bot
```

En Git Bash:

```bash
TELEGRAM_TOKEN="8123456789:AAF..." npm run bot
```

Deberías ver `Bot @tu_bot arriba. Intervalo 60s.`

## 3. Vincularlo contigo

En Telegram, abre tu bot y mándale **`/start`**. Ahí queda registrado tu chat y ya
puede escribirte. Sin ese paso Telegram no permite que el bot inicie la conversación.

---

## Comandos

| Comando | Qué hace |
|---|---|
| `/precio` | Precio actual de BTC |
| `/sube 70000 vender la mitad` | Avisa cuando BTC **suba** a $70,000 (la nota es opcional) |
| `/baja 60000 comprar $50` | Avisa cuando BTC **baje** a $60,000 |
| `/lista` | Alertas activas, con la distancia al precio actual |
| `/borrar a1b2c3` | Borra una alerta por su id |
| `/borrar todo` | Borra todas las tuyas |
| `/ayuda` | Recordatorio de comandos |

La alerta se dispara al **cruzar** el precio —hace falta que la lectura anterior
estuviera del otro lado— y después se elimina sola. Si quieres que vuelva a vigilar
ese nivel, créala de nuevo.

## Configuración

| Variable | Por defecto | Para qué |
|---|---|---|
| `TELEGRAM_TOKEN` | *(obligatoria)* | Token de @BotFather |
| `INTERVALO_SEG` | `60` | Cada cuántos segundos consulta el precio |

No bajes mucho el intervalo: la API gratuita de CoinGecko limita a unas 10–30
llamadas por minuto y te puede bloquear temporalmente.

## Estado

Las alertas y los chats se guardan en `bot/estado.json`, que se crea solo y está
en `.gitignore`. Si lo borras, pierdes las alertas pero el bot sigue funcionando.

---

## Dejarlo corriendo siempre

El bot solo vigila mientras el proceso esté vivo. Opciones, de menos a más esfuerzo:

**Tu PC encendida.** Dejas la terminal abierta. Sirve para probar, pero si apagas
o reinicias, se cae.

**Arranque automático en Windows.** Programador de tareas → Crear tarea → disparador
"Al iniciar sesión" → acción: `node` con argumento `bot\bot.js` y directorio de
inicio el del proyecto. Añade `TELEGRAM_TOKEN` a las variables de entorno de tu
usuario para no tener que exportarlo cada vez. Sigue dependiendo de que la PC esté
encendida, pero sobrevive a reinicios.

**Hospedado.** Cualquier servicio que corra un proceso Node permanente (Fly.io,
Railway, Render, una VPS mínima, o una Raspberry Pi en casa). Es la única opción
que vigila de verdad 24/7. El bot usa *long polling*, así que **no necesita URL
pública ni webhook** — funciona detrás de cualquier NAT.
