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

## 2. Guardar el token

Copia `bot/.env.example` a **`bot/.env`** y pon tu token dentro:

```
TELEGRAM_TOKEN=8123456789:AAF...
```

`bot/.env` está en `.gitignore`, así que nunca se sube al repositorio. Es la forma
recomendada: escribes el token una vez en un archivo local y no vuelve a aparecer
en la línea de comandos ni en el historial de la terminal.

> Como alternativa puedes exportarlo como variable de entorno
> (`$env:TELEGRAM_TOKEN = "..."` en PowerShell); si existe, tiene prioridad sobre
> el archivo.

## 3. Arrancarlo

```bash
npm run bot
```

Deberías ver `Bot @tu_bot arriba. Intervalo 60s.`

## 4. Vincularlo contigo

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

**Arranque automático en Windows.** Una tarea programada que lo levante al iniciar
sesión. Sobrevive a reinicios, pero sigue dependiendo de que la PC esté encendida.

Como el bot resuelve `.env` y `estado.json` relativos a su propio archivo, no hace
falta configurar directorio de inicio: basta la ruta absoluta a `bot.js`.

Para que no aparezca una ventana de consola, conviene lanzarlo con un `.vbs` que
ejecute Node en modo oculto y redirija la salida a `bot\bot.log`. Registro de la
tarea desde PowerShell:

```powershell
$vbs = "C:\ruta\al\proyecto\bot\iniciar.vbs"
$me  = "$env:USERDOMAIN\$env:USERNAME"
$action    = New-ScheduledTaskAction -Execute "wscript.exe" -Argument ('"' + $vbs + '"')
$trigger   = New-ScheduledTaskTrigger -AtLogOn -User $me
$settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
             -RestartInterval (New-TimeSpan -Minutes 1) -RestartCount 3 `
             -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $me -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName "Bot BTC" -Action $action -Trigger $trigger `
                       -Settings $settings -Principal $principal -Force
```

Comandos útiles: `schtasks /run /tn "Bot BTC"`, `schtasks /end /tn "Bot BTC"`,
`schtasks /query /tn "Bot BTC"`, `schtasks /delete /tn "Bot BTC" /f`.

> **Solo una instancia por token.** Telegram rechaza un segundo proceso escuchando
> con el mismo token (error 409). Antes de arrancar la tarea, cierra el bot que
> tengas corriendo en una terminal.

**Hospedado.** Cualquier servicio que corra un proceso Node permanente (Fly.io,
Railway, Render, una VPS mínima, o una Raspberry Pi en casa). Es la única opción
que vigila de verdad 24/7. El bot usa *long polling*, así que **no necesita URL
pública ni webhook** — funciona detrás de cualquier NAT.
