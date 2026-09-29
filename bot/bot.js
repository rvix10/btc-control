/**
 * Bot de Telegram para alertas de precio de BTC.
 *
 * Corre fuera del navegador, así que vigila el precio 24/7 aunque la app esté cerrada.
 * Sin dependencias: usa fetch nativo (Node 18+) y long polling (no necesita URL pública).
 *
 *   TELEGRAM_TOKEN=123:abc node bot/bot.js
 *
 * El estado (chats y alertas) se guarda en bot/estado.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ESTADO = path.join(DIR, "estado.json");

/* Carga bot/.env si existe, para no tener que exportar el token en cada terminal.
   Las variables ya presentes en el entorno tienen prioridad. */
function cargarEnv(archivo) {
  try {
    for (const linea of fs.readFileSync(archivo, "utf8").split(/\r?\n/)) {
      const t = linea.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const clave = t.slice(0, i).trim();
      let valor = t.slice(i + 1).trim();
      if (/^(".*"|'.*')$/s.test(valor)) valor = valor.slice(1, -1);
      if (!(clave in process.env)) process.env[clave] = valor;
    }
  } catch {} // no existe: seguimos con el entorno tal cual
}
cargarEnv(path.join(DIR, ".env"));

const TOKEN = process.env.TELEGRAM_TOKEN;
const INTERVALO = Number(process.env.INTERVALO_SEG || 60) * 1000;
const API = `https://api.telegram.org/bot${TOKEN}`;

if (!TOKEN) {
  console.error("Falta TELEGRAM_TOKEN.");
  console.error("Crea bot/.env con:  TELEGRAM_TOKEN=tu-token-de-BotFather");
  console.error("(o expórtalo como variable de entorno antes de arrancar)");
  process.exit(1);
}

/* ---------- estado ---------- */
const vacio = { chats: [], alerts: [], lastPrice: 0, offset: 0 };
let estado = vacio;
try {
  if (fs.existsSync(ESTADO)) estado = { ...vacio, ...JSON.parse(fs.readFileSync(ESTADO, "utf8")) };
} catch (e) {
  console.error("estado.json ilegible, arranco de cero:", e.message);
}
const guardar = () => {
  try { fs.writeFileSync(ESTADO, JSON.stringify(estado, null, 2)); }
  catch (e) { console.error("no pude guardar estado:", e.message); }
};

/* ---------- formato ---------- */
const usd = (n) => "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd0 = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
const pct = (n) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;
const uid = () => Math.random().toString(36).slice(2, 8);

/* misma semántica que la app: dispara al CRUZAR el umbral, no por estar del otro lado */
const cruzo = (a, antes, ahora) =>
  a.tipo === "sube" ? antes < a.precio && ahora >= a.precio
                    : antes > a.precio && ahora <= a.precio;

/* ---------- telegram ---------- */
async function tg(metodo, body) {
  const r = await fetch(`${API}/${metodo}`, {
    method: "POST",
    // getUpdates espera hasta 50 s (long polling); el resto no debería tardar tanto
    signal: AbortSignal.timeout(metodo === "getUpdates" ? 65000 : 15000),
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!d.ok) throw new Error(`${metodo}: ${d.description}`);
  return d.result;
}
const enviar = (chat_id, text) =>
  tg("sendMessage", { chat_id, text, parse_mode: "HTML", disable_web_page_preview: true })
    .catch((e) => console.error("sendMessage:", e.message));

const avisarATodos = (text) => Promise.all(estado.chats.map((c) => enviar(c, text)));

/* ---------- precio ---------- */
/* mismas fuentes que la app: Coinbase y, si falla, CoinGecko */
const FUENTES = [
  { nombre: "Coinbase", url: "https://api.coinbase.com/v2/prices/BTC-USD/spot", leer: (d) => parseFloat(d?.data?.amount) },
  { nombre: "CoinGecko", url: "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd", leer: (d) => d?.bitcoin?.usd },
];

async function precioBTC() {
  const errores = [];
  for (const f of FUENTES) {
    try {
      const r = await fetch(f.url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const p = Number(f.leer(await r.json()));
      if (p > 0) return p;
      throw new Error("respuesta sin precio");
    } catch (e) {
      errores.push(`${f.nombre}: ${e.message}`);
    }
  }
  throw new Error(errores.join(" · "));
}

/* ---------- comandos ---------- */
const AYUDA = `<b>Alertas de BTC</b>

/precio — precio actual
/sube 70000 [nota] — avisar cuando suba a ese precio
/baja 60000 [nota] — avisar cuando baje a ese precio
/lista — ver alertas activas
/borrar &lt;id&gt; — borrar una alerta
/borrar todo — borrar todas
/ayuda — este mensaje

La alerta se dispara al <b>cruzar</b> el precio y luego se elimina sola.`;

function crearAlerta(chatId, tipo, args) {
  const precio = parseFloat(String(args[0] || "").replace(/[^0-9.]/g, ""));
  if (!precio || precio <= 0) return `Precio inválido. Ejemplo: <code>/${tipo} 70000 comprar otros $50</code>`;
  const ref = estado.lastPrice;
  if (ref) {
    if (tipo === "sube" && precio <= ref) return `BTC ya está en ${usd0(ref)}. Para /sube el objetivo debe ser mayor.`;
    if (tipo === "baja" && precio >= ref) return `BTC ya está en ${usd0(ref)}. Para /baja el objetivo debe ser menor.`;
  }
  const nota = args.slice(1).join(" ").trim();
  const a = { id: uid(), chat: chatId, tipo, precio, nota, creada: Date.now() };
  estado.alerts.push(a);
  guardar();
  const dist = ref ? ` (${pct((precio - ref) / ref)} desde ${usd0(ref)})` : "";
  return `✅ Alerta <code>${a.id}</code> creada: avisar si BTC ${tipo === "sube" ? "sube a" : "baja a"} <b>${usd0(precio)}</b>${dist}${nota ? `\n📝 ${nota}` : ""}`;
}

function listar(chatId) {
  const mias = estado.alerts.filter((a) => a.chat === chatId);
  if (!mias.length) return "No tienes alertas activas. Créalas con /sube o /baja.";
  const ref = estado.lastPrice;
  const filas = mias
    .sort((a, b) => b.precio - a.precio)
    .map((a) => {
      const d = ref ? ` · ${pct((a.precio - ref) / ref)}` : "";
      return `<code>${a.id}</code> ${a.tipo === "sube" ? "▲" : "▼"} <b>${usd0(a.precio)}</b>${d}${a.nota ? ` — ${a.nota}` : ""}`;
    });
  return `<b>Alertas activas</b>${ref ? ` · BTC ${usd0(ref)}` : ""}\n\n${filas.join("\n")}`;
}

function borrar(chatId, arg) {
  if (!arg) return "Indica el id: <code>/borrar a1b2c3</code> — o <code>/borrar todo</code>";
  const antes = estado.alerts.length;
  estado.alerts = arg.toLowerCase() === "todo"
    ? estado.alerts.filter((a) => a.chat !== chatId)
    : estado.alerts.filter((a) => !(a.chat === chatId && a.id === arg));
  const n = antes - estado.alerts.length;
  guardar();
  return n ? `🗑️ ${n} alerta(s) borrada(s).` : "No encontré esa alerta.";
}

async function manejar(msg) {
  const chatId = msg.chat?.id;
  const texto = (msg.text || "").trim();
  if (!chatId || !texto.startsWith("/")) return;

  if (!estado.chats.includes(chatId)) { estado.chats.push(chatId); guardar(); }

  const [cmdRaw, ...args] = texto.split(/\s+/);
  const cmd = cmdRaw.split("@")[0].toLowerCase();

  if (cmd === "/start") return enviar(chatId, `👋 Listo. Vigilo BTC cada ${INTERVALO / 1000}s.\n\n${AYUDA}`);
  if (cmd === "/ayuda" || cmd === "/help") return enviar(chatId, AYUDA);
  if (cmd === "/precio") {
    try {
      const p = await precioBTC();
      estado.lastPrice = p; guardar();
      return enviar(chatId, `₿ BTC/USD: <b>${usd(p)}</b>`);
    } catch (e) { return enviar(chatId, `No pude consultar el precio: ${e.message}`); }
  }
  if (cmd === "/sube" || cmd === "/baja") return enviar(chatId, crearAlerta(chatId, cmd.slice(1), args));
  if (cmd === "/lista") return enviar(chatId, listar(chatId));
  if (cmd === "/borrar") return enviar(chatId, borrar(chatId, args[0]));
  return enviar(chatId, `No conozco <code>${cmd}</code>.\n\n${AYUDA}`);
}

/* ---------- bucles ---------- */
async function escuchar() {
  for (;;) {
    try {
      const ups = await tg("getUpdates", { offset: estado.offset, timeout: 50 });
      for (const u of ups) {
        estado.offset = u.update_id + 1;
        if (u.message) await manejar(u.message);
      }
      if (ups.length) guardar();
    } catch (e) {
      console.error("getUpdates:", e.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

async function vigilar() {
  for (;;) {
    try {
      const p = await precioBTC();
      const antes = estado.lastPrice;
      estado.lastPrice = p;

      if (antes) {
        const hits = estado.alerts.filter((a) => cruzo(a, antes, p));
        if (hits.length) {
          estado.alerts = estado.alerts.filter((a) => !hits.includes(a));
          for (const a of hits) {
            const flecha = a.tipo === "sube" ? "🔺" : "🔻";
            await enviar(a.chat,
              `${flecha} <b>BTC ${a.tipo === "sube" ? "subió" : "bajó"} a ${usd(p)}</b>\n` +
              `Objetivo: ${usd0(a.precio)}${a.nota ? `\n📝 ${a.nota}` : ""}`);
          }
        }
      }
      guardar();
    } catch (e) {
      console.error("vigilar:", e.message);
    }
    await new Promise((r) => setTimeout(r, INTERVALO));
  }
}

const me = await tg("getMe").catch((e) => { console.error("Token inválido:", e.message); process.exit(1); });
console.log(`Bot @${me.username} arriba. Intervalo ${INTERVALO / 1000}s. ${estado.alerts.length} alerta(s), ${estado.chats.length} chat(s).`);
if (estado.chats.length) avisarATodos("♻️ Bot reiniciado, sigo vigilando.");
vigilar();
escuchar();
