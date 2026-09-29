# Control BTC

Aplicación web para llevar el control de **compras y retiros de Bitcoin**: ganancias
por compra y globales, saldo, resumen de retiros, precio en tiempo real, alertas y
proyección de ganancias según el valor de BTC.

**Tus datos se guardan solo en tu navegador.** No hay cuentas, ni servidor, ni nadie
que pueda verlos. Tampoco se sincronizan entre dispositivos: para eso están los
botones de exportar y restaurar respaldo.

---

## Empezar

Necesitas **Node.js 18 o superior**.

```bash
npm install
npm run dev
```

Abre <http://localhost:5173>.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga en caliente |
| `npm run build` | Compila a producción en `dist/` |
| `npm run preview` | Sirve el `dist/` ya compilado |
| `npm run bot` | Bot de Telegram para alertas 24/7 (ver [`bot/README.md`](bot/README.md)) |

## Al abrirla por primera vez

Puedes elegir entre tres caminos:

- **Ya tengo bitcoin en una wallet** — indicas cuánto BTC tienes y cuánto invertiste
  en total, y se crea una compra de apertura. Es la forma más rápida de arrancar con
  el saldo correcto sin meter todo el historial.
- **Importar un respaldo** — restauras un `.json` exportado desde otra instalación.
- **Empezar de cero** — vas registrando cada compra a medida que las haces.

## Qué hace

- **Compras y retiros** con cálculo en ambos sentidos: escribes dos de los tres
  campos (BTC, total en USD, precio unitario) y el tercero se calcula solo.
- **Dashboard** con valor generado, ganancia realizada y no realizada, ROI y
  desglose por compra.
- **Proyección**: simulador de precio con curva de ganancia y escenarios rápidos.
- **Alertas de precio** dentro de la app, y un bot de Telegram opcional para que
  te avise aunque tengas todo cerrado.
- **Respaldos** en `.json`, para migrar de dispositivo o guardar copia.
- **Instalable** como app en el teléfono (PWA), funciona sin conexión.

Las ganancias usan **costo promedio ponderado**; el punto de equilibrio es ese costo
promedio.

**Precio en tiempo real.** Llega por el WebSocket público de Coinbase (se muestra como
mucho una actualización cada 2 s) y, como respaldo, se consulta por REST cada 30 s
cuando el WebSocket no trae nada: primero Coinbase y, si falla, CoinGecko (que
bloquea algunas redes móviles con un 403). Nada de esto necesita API key. Cada petición tiene un límite de 8 s y el
WebSocket se reconecta solo. Si pasan más de 90 s sin lecturas, el indicador cambia
de *En vivo* a *Desactualizado*. Puedes escribir el precio a mano tocando el número:
queda fijo en *Manual* hasta que toques el botón de refrescar.

## Publicar en GitHub Pages

`vite.config.js` usa `base: "./"`, así que el build funciona en cualquier subcarpeta.
El workflow de [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) compila
y publica en cada push a `main`. Solo hay que activarlo una vez en
**Settings → Pages → Source: GitHub Actions**.

Para instalarla en el teléfono, abre la URL publicada y usa *Agregar a pantalla de
inicio*.

## Estructura

```
├── index.html              # HTML base y metadatos PWA
├── vite.config.js
├── public/                 # manifest, service worker e iconos
├── scripts/iconos.mjs      # genera los iconos PNG (sin dependencias)
├── bot/                    # bot de Telegram para alertas 24/7
└── src/
    ├── main.jsx            # punto de entrada y registro del service worker
    └── App.jsx             # toda la aplicación
```

## Aviso

No es asesoría financiera. El precio de BTC es impredecible y las proyecciones son
simulaciones, no pronósticos. Revisa tus propios números antes de tomar decisiones.

## Licencia

MIT
