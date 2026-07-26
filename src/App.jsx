import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid,
} from "recharts";
import {
  Bitcoin, Wallet, TrendingUp, TrendingDown, ArrowDownRight, ArrowUpRight,
  Plus, Trash2, RefreshCw, LayoutDashboard, ShoppingCart, Banknote, LineChart, Target,
  Pencil, Check, X, Upload, Download, RotateCcw, Bell, BellRing,
} from "lucide-react";

/* ---------- Paleta (estilo "libro mayor" / terminal) ---------- */
const C = {
  bg: "#0d0f14",
  bg2: "#12151d",
  card: "#161a24",
  cardHi: "#1b2030",
  line: "#252b39",
  text: "#e7e9f0",
  mut: "#8b93a7",
  mut2: "#5b6377",
  orange: "#f7931a",
  orangeDim: "#a9640f",
  green: "#37c26a",
  red: "#f6524f",
  blue: "#4d8bff",
};

/* ---------- Persistencia (window.storage en Claude, localStorage en local) ---------- */
const hasStore = typeof window !== "undefined" && window.storage;
const hasLS = typeof window !== "undefined" && (() => {
  try { window.localStorage.setItem("__t", "1"); window.localStorage.removeItem("__t"); return true; } catch { return false; }
})();
async function storeGet(key, fallback) {
  try {
    if (hasStore) { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : fallback; }
    if (hasLS) { const r = window.localStorage.getItem(key); return r ? JSON.parse(r) : fallback; }
    return fallback;
  } catch { return fallback; }
}
async function storeSet(key, value) {
  try {
    if (hasStore) { await window.storage.set(key, JSON.stringify(value)); return; }
    if (hasLS) { window.localStorage.setItem(key, JSON.stringify(value)); }
  } catch {}
}

/* ---------- Formato ---------- */
const usd = (n) =>
  (isFinite(n) ? n : 0).toLocaleString("es-SV", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd0 = (n) =>
  (isFinite(n) ? n : 0).toLocaleString("es-SV", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const btc = (n) => {
  if (!isFinite(n)) n = 0;
  return `₿ ${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 8 })}`;
};
const pct = (n) => `${n >= 0 ? "+" : ""}${(isFinite(n) ? n * 100 : 0).toFixed(2)}%`;
const today = () => new Date().toISOString().slice(0, 10);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const num = (v) => { const x = parseFloat(String(v).replace(",", ".")); return isFinite(x) ? x : 0; };
const d2 = (n) => (isFinite(n) ? (Math.round(n * 100) / 100).toString() : "");
const d8 = (n) => (isFinite(n) ? (Math.round(n * 1e8) / 1e8).toString() : "");

const mono = { fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace", fontVariantNumeric: "tabular-nums" };

/* ---------- Alertas de precio ---------- */
const TITULO = "Control BTC";
const canNotify = () => typeof window !== "undefined" && "Notification" in window;
const notifPerm = () => (canNotify() ? Notification.permission : "unsupported");

function notify(title, body) {
  try {
    if (canNotify() && Notification.permission === "granted") new Notification(title, { body, tag: "btc-" + uid() });
  } catch {}
}
/* beep sintetizado: sin archivos de audio que cargar */
function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "sine"; o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    o.start(); o.stop(ctx.currentTime + 0.45);
    setTimeout(() => ctx.close(), 700);
  } catch {}
}
/* una alerta se dispara solo al CRUZAR el objetivo, no por estar del otro lado */
const cruzo = (a, antes, ahora) =>
  a.tipo === "sube" ? antes < num(a.precio) && ahora >= num(a.precio)
                    : antes > num(a.precio) && ahora <= num(a.precio);

/* ---------- Importador (pegar lote: fecha, inversión, BTC) ---------- */
function parseFecha(s) {
  s = String(s).trim().split(/\s+/)[0]; // descarta la hora
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const p = s.split("/");
  if (p.length === 3) {
    let [d, mo, y] = p;
    if (y.length === 2) y = "20" + y;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}
function parseNum(s) {
  s = String(s).replace(/[^0-9.,-]/g, "");
  if (s.includes(".") && s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  return parseFloat(s) || 0;
}
function parseRows(text) {
  const out = [];
  String(text).split(/\r?\n/).forEach((line) => {
    line = line.trim();
    if (!line) return;
    if (/fecha/i.test(line) && /btc/i.test(line)) return; // salta encabezado
    let parts = line.split("\t");
    if (parts.length < 3) parts = line.split(/\s{2,}/);
    if (parts.length < 3) parts = line.split(/\s*[|;]\s*/);
    if (parts.length < 3) return;
    const fecha = parseFecha(parts[0]);
    const inv = parseNum(parts[1]);
    const b = parseNum(parts[2]);
    if (!fecha || inv <= 0 || b <= 0) return;
    out.push({ fecha, inv, btc: b, precio: inv / b });
  });
  return out;
}
/* Ejemplo genérico que se muestra como marcador en el importador. */
const EJEMPLO_IMPORT = [
  ["15/01/2026 10:30", "$100,00", "0,00152000"],
  ["03/02/2026 18:05", "50", "0,00074500"],
  ["27/02/2026", "200", "0,00291000"],
].map((r) => r.join("\t")).join("\n");

/* ================================================================= */
export default function App() {
  const [tab, setTab] = useState("dash");
  const [purchases, setPurchases] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [price, setPrice] = useState(0);
  const [priceStatus, setPriceStatus] = useState("idle"); // idle | loading | live | error | manual
  const [lastUpdated, setLastUpdated] = useState(0);
  const [tick, setTick] = useState(0); // -1 baja, 0 igual, 1 sube
  const [loaded, setLoaded] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [onboarded, setOnboarded] = useState(true); // hasta cargar, no parpadea la bienvenida
  const prevPrice = useRef(0);

  /* cargar */
  useEffect(() => {
    (async () => {
      const p = await storeGet("btc.purchases", []);
      const w = await storeGet("btc.withdrawals", []);
      const s = await storeGet("btc.settings", {});
      const al = await storeGet("btc.alerts", []);
      const ob = await storeGet("btc.onboarded", false);
      setPurchases(Array.isArray(p) ? p : []);
      setWithdrawals(Array.isArray(w) ? w : []);
      setAlerts(Array.isArray(al) ? al : []);
      // si ya hay datos, no tiene sentido la bienvenida aunque no exista la marca
      setOnboarded(Boolean(ob) || (Array.isArray(p) && p.length > 0) || (Array.isArray(w) && w.length > 0));
      if (s.price) setPrice(s.price);
      setLoaded(true);
      fetchPrice({ fallback: s.price });
    })();
  }, []);

  /* auto-actualización cada 30s (tiempo real) */
  useEffect(() => {
    const iv = setInterval(() => fetchPrice({ silent: true }), 30000);
    const onVis = () => {
      if (document.visibilityState === "visible") { document.title = TITULO; fetchPrice({ silent: true }); }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  /* evaluar alertas en cada lectura de precio */
  useEffect(() => {
    if (!loaded || !price) return;
    const antes = prevPrice.current;
    prevPrice.current = price;
    if (!antes) return; // primera lectura: solo sirve de referencia
    const hits = alerts.filter((a) => !a.firedAt && cruzo(a, antes, price));
    if (!hits.length) return;
    const ids = new Set(hits.map((a) => a.id));
    setAlerts((prev) => prev.map((a) => (ids.has(a.id) ? { ...a, firedAt: Date.now(), firedPrice: price } : a)));
    hits.forEach((a) => notify(
      `BTC ${a.tipo === "sube" ? "subió a" : "bajó a"} ${usd0(price)}`,
      a.nota || `Alerta: ${a.tipo === "sube" ? "≥" : "≤"} ${usd0(num(a.precio))}`,
    ));
    beep();
    if (document.visibilityState !== "visible") document.title = `🔔 ${usd0(price)} · ${TITULO}`;
  }, [price, loaded, alerts]);

  /* marcar como vistas al abrir la pestaña */
  useEffect(() => {
    if (tab !== "alertas") return;
    setAlerts((prev) => (prev.some((a) => a.firedAt && !a.visto) ? prev.map((a) => (a.firedAt ? { ...a, visto: true } : a)) : prev));
  }, [tab]);

  /* guardar */
  useEffect(() => { if (loaded) storeSet("btc.purchases", purchases); }, [purchases, loaded]);
  useEffect(() => { if (loaded) storeSet("btc.withdrawals", withdrawals); }, [withdrawals, loaded]);
  useEffect(() => { if (loaded) storeSet("btc.alerts", alerts); }, [alerts, loaded]);
  useEffect(() => { if (loaded) storeSet("btc.onboarded", onboarded); }, [onboarded, loaded]);
  useEffect(() => { if (loaded && price) storeSet("btc.settings", { price }); }, [price, loaded]);

  async function fetchPrice(opts = {}) {
    const { silent = false, fallback } = opts;
    if (!silent) setPriceStatus("loading");
    try {
      const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
      const d = await r.json();
      const p = d?.bitcoin?.usd;
      if (p) {
        setPrice((old) => { setTick(old ? (p > old ? 1 : p < old ? -1 : 0) : 0); return p; });
        setLastUpdated(Date.now());
        setPriceStatus("live");
        return;
      }
      throw new Error("no price");
    } catch {
      if (!silent) setPriceStatus(fallback ? "manual" : "error");
    }
  }

  /* ---------- Métricas globales (costo promedio ponderado) ---------- */
  const m = useMemo(() => {
    const btcComprado = purchases.reduce((a, p) => a + num(p.btc), 0);
    const invertido = purchases.reduce((a, p) => a + num(p.btc) * num(p.precio) + num(p.fee), 0);
    const costoProm = btcComprado > 0 ? invertido / btcComprado : 0;

    const btcRetirado = withdrawals.reduce((a, w) => a + num(w.btc), 0);
    const recibido = withdrawals.reduce((a, w) => a + num(w.btc) * num(w.precio) - num(w.fee), 0);
    const gananciaRealizada = withdrawals.reduce(
      (a, w) => a + (num(w.btc) * num(w.precio) - num(w.fee) - num(w.btc) * costoProm), 0);

    const saldoBTC = btcComprado - btcRetirado;
    const valorSaldo = saldoBTC * price;
    const costoSaldo = saldoBTC * costoProm;
    const gananciaNoRealizada = valorSaldo - costoSaldo;
    const gananciaTotal = gananciaRealizada + gananciaNoRealizada;
    const roi = invertido > 0 ? gananciaTotal / invertido : 0;
    const patrimonio = valorSaldo + recibido; // valor de lo que tienes + efectivo ya retirado

    return { btcComprado, invertido, costoProm, btcRetirado, recibido, gananciaRealizada,
      saldoBTC, valorSaldo, costoSaldo, gananciaNoRealizada, gananciaTotal, roi, patrimonio };
  }, [purchases, withdrawals, price]);

  const NAV = [
    { id: "dash", label: "Dashboard", icon: LayoutDashboard },
    { id: "compras", label: "Compras", icon: ShoppingCart },
    { id: "retiros", label: "Retiros", icon: Banknote },
    { id: "proy", label: "Proyección", icon: LineChart },
    { id: "alertas", label: "Alertas", icon: Bell },
  ];
  const sinVer = alerts.filter((a) => a.firedAt && !a.visto).length;
  const activas = alerts.filter((a) => !a.firedAt).length;

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100vh", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <style>{styleSheet}</style>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "18px 16px 60px" }}>

        {/* ---------- Header ---------- */}
        <header className="flex items-center justify-between" style={{ marginBottom: 18 }}>
          <div className="flex items-center" style={{ gap: 11 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: C.orange, display: "grid", placeItems: "center", boxShadow: `0 0 24px ${C.orangeDim}66` }}>
              <Bitcoin size={23} color="#111" strokeWidth={2.4} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: -0.2 }}>Control BTC</div>
              <div style={{ fontSize: 11.5, color: C.mut2, letterSpacing: 0.3, textTransform: "uppercase" }}>Libro de compras &amp; retiros</div>
            </div>
          </div>
          <PriceBadge price={price} status={priceStatus} tick={tick} lastUpdated={lastUpdated} onRefresh={() => fetchPrice({ fallback: price })} onSet={(v) => { setPrice(v); setPriceStatus("manual"); }} />
        </header>

        {!onboarded ? (
          <Bienvenida
            price={price}
            onEmpezar={() => { setOnboarded(true); setTab("compras"); }}
            onApertura={({ btc: b, total, fecha }) => {
              setPurchases([{ id: uid(), fecha: fecha || today(), btc: String(num(b)), precio: String(num(total) / num(b)), fee: "0" }]);
              setOnboarded(true);
              setTab("dash");
            }}
            onRestaurar={({ purchases: p, withdrawals: w, alerts: al, price: pr }) => {
              setPurchases(p); setWithdrawals(w); setAlerts(al);
              if (pr > 0) { setPrice(pr); setPriceStatus("manual"); fetchPrice({ silent: true }); }
              setOnboarded(true);
              setTab("dash");
            }}
          />
        ) : (
        <>
        {/* ---------- Nav ---------- */}
        <nav className="flex" style={{ gap: 6, background: C.bg2, padding: 5, borderRadius: 13, border: `1px solid ${C.line}`, marginBottom: 18, overflowX: "auto" }}>
          {NAV.map((n) => {
            const on = tab === n.id;
            const Icon = n.icon;
            return (
              <button key={n.id} onClick={() => setTab(n.id)} className="tab-btn"
                style={{ flex: "1 0 auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "9px 14px", borderRadius: 9,
                  background: on ? C.card : "transparent", color: on ? C.text : C.mut, fontWeight: on ? 650 : 500, fontSize: 13.5,
                  border: on ? `1px solid ${C.line}` : "1px solid transparent", cursor: "pointer", whiteSpace: "nowrap" }}>
                <Icon size={16} color={on ? C.orange : C.mut2} /> {n.label}
                {n.id === "alertas" && (sinVer > 0 || activas > 0) && (
                  <span style={{ ...mono, fontSize: 10.5, fontWeight: 700, borderRadius: 20, padding: "1px 6px",
                    background: sinVer > 0 ? C.red : C.line, color: sinVer > 0 ? "#fff" : C.mut }}>
                    {sinVer > 0 ? sinVer : activas}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <Backup purchases={purchases} withdrawals={withdrawals} alerts={alerts} price={price}
          onRestore={({ purchases: p, withdrawals: w, alerts: al, price: pr }) => {
            setPurchases(p);
            setWithdrawals(w);
            setAlerts(al);
            if (pr > 0) { setPrice(pr); setPriceStatus("manual"); fetchPrice({ silent: true }); }
          }} />

        {tab === "dash" && <Dashboard m={m} price={price} purchases={purchases} onGoTo={setTab} />}
        {tab === "compras" && <Compras purchases={purchases} setPurchases={setPurchases} price={price} costoProm={m.costoProm} />}
        {tab === "retiros" && <Retiros withdrawals={withdrawals} setWithdrawals={setWithdrawals} price={price} costoProm={m.costoProm} saldoBTC={m.saldoBTC} />}
        {tab === "proy" && <Proyeccion m={m} price={price} setPrice={setPrice} />}
        {tab === "alertas" && <Alertas alerts={alerts} setAlerts={setAlerts} price={price} m={m} />}
        </>
        )}
      </div>
    </div>
  );
}

/* ================= Respaldo (exportar / restaurar) ================= */
function Backup({ purchases, withdrawals, alerts, price, onRestore }) {
  const fileRef = useRef(null);
  const [msg, setMsg] = useState(null); // { text, error }

  const flash = (text, error = false) => {
    setMsg({ text, error });
    setTimeout(() => setMsg(null), 5000);
  };

  const exportar = () => {
    const data = {
      app: "btc-control",
      version: 1,
      exportadoEn: new Date().toISOString(),
      purchases,
      withdrawals,
      alerts,
      settings: { price },
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `btc-control-respaldo-${today()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    flash(`Respaldo descargado · ${purchases.length} compra(s), ${withdrawals.length} retiro(s)`);
  };

  const restaurar = async (file) => {
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      const p = Array.isArray(d?.purchases) ? d.purchases : null;
      const w = Array.isArray(d?.withdrawals) ? d.withdrawals : null;
      if (!p && !w) throw new Error("formato no reconocido");
      const np = (p || []).map((r) => ({ ...r, id: r.id || uid() }));
      const nw = (w || []).map((r) => ({ ...r, id: r.id || uid() }));
      const ok = window.confirm(
        `Se REEMPLAZARÁN tus datos actuales (${purchases.length} compra(s), ${withdrawals.length} retiro(s))\n` +
        `por los del respaldo (${np.length} compra(s), ${nw.length} retiro(s)).\n\n¿Continuar?`
      );
      if (!ok) return;
      const na = (Array.isArray(d?.alerts) ? d.alerts : []).map((r) => ({ ...r, id: r.id || uid() }));
      onRestore({ purchases: np, withdrawals: nw, alerts: na, price: num(d?.settings?.price) });
      flash(`Respaldo restaurado · ${np.length} compra(s), ${nw.length} retiro(s)`);
    } catch (e) {
      flash(`No se pudo leer el archivo (${e.message}). ¿Es un respaldo .json de Control BTC?`, true);
    }
  };

  return (
    <div className="flex items-center justify-between" style={{ marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
      <span style={{ fontSize: 11.5, color: msg ? (msg.error ? C.red : C.green) : C.mut2 }}>
        {msg ? msg.text : "Tus datos viven solo en este navegador. Descarga un respaldo de vez en cuando."}
      </span>
      <div className="flex" style={{ gap: 8 }}>
        <button onClick={exportar} style={btnGhost} title="Descargar un .json con compras, retiros y precio">
          <Download size={14} color={C.mut} /> Exportar respaldo
        </button>
        <button onClick={() => fileRef.current?.click()} style={btnGhost} title="Cargar un respaldo .json (reemplaza los datos actuales)">
          <RotateCcw size={14} color={C.mut} /> Restaurar respaldo
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: "none" }}
          onChange={(e) => { restaurar(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
    </div>
  );
}

/* ================= Badge de precio ================= */
function PriceBadge({ price, status, tick, lastUpdated, onRefresh, onSet }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState("");
  const label = { live: "En vivo", loading: "Cargando…", error: "Sin conexión", manual: "Manual", idle: "—" }[status] || "";
  const dot = { live: C.green, loading: C.orange, error: C.red, manual: C.blue, idle: C.mut2 }[status];
  const up = tick > 0, down = tick < 0;
  const tickColor = up ? C.green : down ? C.red : C.mut2;
  const hora = lastUpdated ? new Date(lastUpdated).toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : null;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "8px 11px", minWidth: 176 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 2 }}>
        <span style={{ fontSize: 10.5, color: C.mut2, textTransform: "uppercase", letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 5 }}>
          <span className={status === "live" ? "pulse" : ""} style={{ width: 6, height: 6, borderRadius: 6, background: dot, display: "inline-block" }} /> BTC/USD · {label}
        </span>
        <RefreshCw size={13} color={C.mut} style={{ cursor: "pointer" }} className={status === "loading" ? "spin" : ""} onClick={onRefresh} />
      </div>
      {edit ? (
        <div className="flex items-center" style={{ gap: 6 }}>
          <input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder={String(Math.round(price) || "")}
            onKeyDown={(e) => { if (e.key === "Enter") { onSet(num(v)); setEdit(false); setV(""); } }}
            style={{ ...mono, width: 92, background: C.bg2, border: `1px solid ${C.line}`, color: C.text, borderRadius: 7, padding: "3px 6px", fontSize: 15 }} />
          <button onClick={() => { onSet(num(v)); setEdit(false); setV(""); }} style={{ ...btnMini }}>OK</button>
        </div>
      ) : (
        <div className="flex items-center" style={{ gap: 6, cursor: "pointer" }} onClick={() => setEdit(true)} title="Editar precio manualmente">
          <span style={{ ...mono, fontSize: 19, fontWeight: 700, color: status === "live" && tick !== 0 ? tickColor : C.text }}>
            {price ? usd0(price) : "—"}
          </span>
          {status === "live" && tick !== 0 && <span style={{ color: tickColor, fontSize: 13, fontWeight: 700 }}>{up ? "▲" : "▼"}</span>}
        </div>
      )}
      {hora && !edit && (
        <div style={{ ...mono, fontSize: 9.5, color: C.mut2, marginTop: 1 }}>act. {hora}</div>
      )}
    </div>
  );
}

/* ================= DASHBOARD ================= */
function Dashboard({ m, price, purchases, onGoTo }) {
  const posT = m.gananciaTotal >= 0;
  const posR = m.gananciaRealizada >= 0;
  const posN = m.gananciaNoRealizada >= 0;

  if (purchases.length === 0) {
    return (
      <Empty icon={ShoppingCart} title="Aún no hay compras registradas"
        text="Registra tu primera compra de BTC para ver ganancias, saldo y proyección."
        cta="Registrar compra" onCta={() => onGoTo("compras")} />
    );
  }

  return (
    <div>
      {/* Patrimonio */}
      <div style={{ ...cardBox, padding: 20, marginBottom: 14, background: `linear-gradient(180deg, ${C.cardHi}, ${C.card})` }}>
        <div className="flex items-start justify-between" style={{ flexWrap: "wrap", gap: 14 }}>
          <div>
            <div style={{ fontSize: 11.5, color: C.mut2, textTransform: "uppercase", letterSpacing: 0.6 }}>Valor generado</div>
            <div style={{ ...mono, fontSize: 38, fontWeight: 700, lineHeight: 1.05, marginTop: 4 }}>{usd(m.patrimonio)}</div>
            <div style={{ fontSize: 12, color: C.mut2, marginTop: 5, maxWidth: 330, lineHeight: 1.45 }}>
              BTC que tienes + efectivo que ya retiraste. No es saldo disponible.
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11.5, color: C.mut2, textTransform: "uppercase", letterSpacing: 0.6 }}>Ganancia total</div>
            <div style={{ ...mono, fontSize: 30, fontWeight: 700, color: posT ? C.green : C.red, lineHeight: 1.05, marginTop: 4 }}>
              {posT ? "+" : ""}{usd(m.gananciaTotal)}
            </div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 6, fontSize: 12.5, color: posT ? C.green : C.red,
              background: (posT ? C.green : C.red) + "1a", padding: "3px 9px", borderRadius: 20, fontWeight: 600 }}>
              {posT ? <TrendingUp size={14} /> : <TrendingDown size={14} />} ROI {pct(m.roi)}
            </div>
          </div>
        </div>

        {/* Desglose del patrimonio */}
        <div className="grid-hero" style={{ marginTop: 18 }}>
          <HeroStat label="Valor del saldo" value={usd(m.valorSaldo)} sub={btc(m.saldoBTC)} accent={C.orange} />
          <HeroStat label="Retirado (efectivo)" value={usd(m.recibido)} sub="Ya salió a dólares" accent={C.blue} />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid-kpi" style={{ marginBottom: 14 }}>
        <Kpi label="Invertido" value={usd(m.invertido)} sub={`Costo prom. ${usd(m.costoProm)}/BTC`} />
        <Kpi label="Saldo en BTC" value={btc(m.saldoBTC)} sub={`Valor ${usd(m.valorSaldo)}`} accent={C.orange} />
        <Kpi label="Ganancia realizada" value={`${posR ? "+" : ""}${usd(m.gananciaRealizada)}`} sub="De retiros ya hechos" color={posR ? C.green : C.red} />
        <Kpi label="Ganancia no realizada" value={`${posN ? "+" : ""}${usd(m.gananciaNoRealizada)}`} sub="Del saldo a precio actual" color={posN ? C.green : C.red} />
      </div>

      {/* Composición */}
      <div style={{ ...cardBox, padding: 16, marginBottom: 14 }}>
        <SectionTitle icon={Wallet}>Composición del valor generado</SectionTitle>
        <Bar rows={[
          { label: "Costo del saldo (invertido vigente)", val: Math.max(m.costoSaldo, 0), color: C.mut2 },
          { label: "Ganancia no realizada", val: Math.max(m.gananciaNoRealizada, 0), color: C.orange },
          { label: "Efectivo retirado", val: Math.max(m.recibido, 0), color: C.blue },
        ]} />
      </div>

      {/* Ganancia por compra */}
      <div style={{ ...cardBox, padding: 16 }}>
        <SectionTitle icon={TrendingUp}>Ganancia por compra <span style={{ color: C.mut2, fontWeight: 500, fontSize: 12 }}>· evaluada a {usd(price)}</span></SectionTitle>
        <Ledger head={["Fecha", "BTC", "Precio compra", "Valor actual", "Ganancia", "%"]}>
          {[...purchases].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).map((p) => {
            const inv = num(p.btc) * num(p.precio) + num(p.fee);
            const val = num(p.btc) * price;
            const g = val - inv;
            const r = inv > 0 ? g / inv : 0;
            const pos = g >= 0;
            return (
              <tr key={p.id}>
                <td style={tdMut}>{p.fecha}</td>
                <td style={tdNum}>{num(p.btc).toFixed(8)}</td>
                <td style={tdNum}>{usd(num(p.precio))}</td>
                <td style={tdNum}>{usd(val)}</td>
                <td style={{ ...tdNum, color: pos ? C.green : C.red, fontWeight: 600 }}>{pos ? "+" : ""}{usd(g)}</td>
                <td style={{ ...tdNum, color: pos ? C.green : C.red }}>{pct(r)}</td>
              </tr>
            );
          })}
        </Ledger>
      </div>
    </div>
  );
}

/* ================= COMPRAS ================= */
function Compras({ purchases, setPurchases, price, costoProm }) {
  const [f, setF] = useState({ fecha: today(), btc: "", precio: "", total: "", fee: "" });
  const [last, setLast] = useState("total"); // qué campo manda: "precio" | "total"

  // valores efectivos (sincronizados)
  const bq = num(f.btc);
  const effPrecio = num(f.precio);
  const effTotal = num(f.total);
  const inversion = effTotal + num(f.fee);

  // handlers con cálculo en ambos sentidos
  const setBtc = (v) => setF((p) => {
    const n = { ...p, btc: v }; const b = num(v);
    if (b > 0) {
      if (last === "total" && num(p.total) > 0) n.precio = d2(num(p.total) / b);
      else if (num(p.precio) > 0) n.total = d2(b * num(p.precio));
    }
    return n;
  });
  const setPrecio = (v) => { setLast("precio"); setF((p) => {
    const n = { ...p, precio: v }; const b = num(p.btc);
    if (b > 0 && num(v) > 0) n.total = d2(b * num(v));
    return n;
  }); };
  const setTotal = (v) => { setLast("total"); setF((p) => {
    const n = { ...p, total: v }; const b = num(p.btc);
    if (b > 0 && num(v) > 0) n.precio = d2(num(v) / b);
    return n;
  }); };

  const add = () => {
    if (bq <= 0 || effPrecio <= 0) return;
    setPurchases((prev) => [...prev, { id: uid(), fecha: f.fecha || today(), btc: f.btc, precio: f.precio, fee: f.fee || "0" }]);
    setF({ fecha: today(), btc: "", precio: "", total: "", fee: "" });
    setLast("total");
  };
  const del = (id) => setPurchases((prev) => prev.filter((p) => p.id !== id));

  // edición de filas
  const [editId, setEditId] = useState(null);
  const [ed, setEd] = useState({});
  const [edLast, setEdLast] = useState("total"); // qué campo manda al editar
  const startEdit = (p) => {
    setEditId(p.id);
    setEd({ fecha: p.fecha, btc: p.btc, precio: p.precio, total: d2(num(p.btc) * num(p.precio)), fee: p.fee });
    setEdLast("total");
  };
  const cancelEdit = () => { setEditId(null); setEd({}); setEdLast("total"); };
  const saveEdit = () => {
    if (num(ed.btc) <= 0 || num(ed.precio) <= 0) return;
    setPurchases((prev) => prev.map((p) => (p.id === editId
      ? { ...p, fecha: ed.fecha || today(), btc: String(num(ed.btc)), precio: String(num(ed.precio)), fee: String(num(ed.fee) || 0) } : p)));
    cancelEdit();
  };

  // mismos cálculos que el formulario, aplicados a la fila en edición
  const edBtc = (v) => setEd((p) => {
    const n = { ...p, btc: v }; const b = num(v);
    if (b > 0) {
      if (edLast === "total" && num(p.total) > 0) n.precio = d2(num(p.total) / b);
      else if (num(p.precio) > 0) n.total = d2(b * num(p.precio));
    }
    return n;
  });
  const edPrecio = (v) => { setEdLast("precio"); setEd((p) => {
    const n = { ...p, precio: v }; const b = num(p.btc);
    if (b > 0 && num(v) > 0) n.total = d2(b * num(v));
    return n;
  }); };
  const edTotal = (v) => { setEdLast("total"); setEd((p) => {
    const n = { ...p, total: v }; const b = num(p.btc);
    if (b > 0 && num(v) > 0) n.precio = d2(num(v) / b);
    return n;
  }); };

  const ready = bq > 0 && effPrecio > 0;

  // importador de lote
  const [showImp, setShowImp] = useState(false);
  const [impText, setImpText] = useState("");
  const parsed = useMemo(() => parseRows(impText), [impText]);
  const impInv = parsed.reduce((a, r) => a + r.inv, 0);
  const impBtc = parsed.reduce((a, r) => a + r.btc, 0);
  const doImport = () => {
    if (parsed.length === 0) return;
    setPurchases((prev) => [...prev, ...parsed.map((r) => ({ id: uid(), fecha: r.fecha, btc: String(r.btc), precio: String(r.precio), fee: "0" }))]);
    setImpText("");
    setShowImp(false);
  };

  return (
    <div>
      <div style={{ ...cardBox, padding: 16, marginBottom: 14 }}>
        <SectionTitle icon={Plus}>Registrar compra</SectionTitle>
        <div className="grid-form">
          <Field label="Fecha"><input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} style={inp} /></Field>
          <Field label="Cantidad BTC"><input inputMode="decimal" placeholder="0.005" value={f.btc} onChange={(e) => setBtc(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} style={inp} /></Field>
          <Field label="Total de compra (USD)"><input inputMode="decimal" placeholder="100.00" value={f.total} onChange={(e) => setTotal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} style={{ ...inp, borderColor: last === "total" && effTotal > 0 ? C.orangeDim : C.line }} /></Field>
          <Field label="Precio por BTC (USD)"><input inputMode="decimal" placeholder={price ? String(Math.round(price)) : "0"} value={f.precio} onChange={(e) => setPrecio(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} style={{ ...inp, borderColor: last === "precio" && effPrecio > 0 ? C.orangeDim : C.line }} /></Field>
          <Field label="Comisión (USD)"><input inputMode="decimal" placeholder="0" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()} style={inp} /></Field>
        </div>

        {/* Resumen calculado en vivo */}
        <div style={{ marginTop: 12, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 11, padding: "11px 13px",
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }} className="calc-row">
          <Calc label="Cada BTC valía" value={ready ? usd(effPrecio) : "—"} hint={bq > 0 && effTotal > 0 ? `${d2(effTotal)} ÷ ${d8(bq)}` : "precio unitario"} />
          <Calc label="Valor de compra" value={ready ? usd(effTotal) : "—"} hint={`${d8(bq) || "0"} BTC`} accent />
          <Calc label="Inversión total" value={ready ? usd(inversion) : "—"} hint="+ comisión" />
        </div>

        <div className="flex items-center justify-between" style={{ marginTop: 12, flexWrap: "wrap", gap: 10 }}>
          <span style={{ fontSize: 12.5, color: C.mut }}>
            {ready && price > 0 && (
              <span style={{ color: effPrecio <= price ? C.green : C.red }}>
                {effPrecio <= price ? "▼ compraste por debajo" : "▲ compraste por encima"} del precio actual ({usd(price)})
              </span>
            )}
          </span>
          <button onClick={add} disabled={!ready} style={{ ...btnPrimary, opacity: ready ? 1 : 0.45, cursor: ready ? "pointer" : "not-allowed" }}><Plus size={16} /> Ingresar compra</button>
        </div>
        <div style={{ marginTop: 12, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
          <button onClick={() => setShowImp((s) => !s)} style={{ background: "transparent", border: `1px solid ${C.line}`, color: C.mut, borderRadius: 9, padding: "7px 13px", fontSize: 12.5, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 }}>
            <Upload size={14} color={C.mut} /> {showImp ? "Ocultar importador" : "Importar lote (pegar tabla)"}
          </button>
        </div>
      </div>

      {showImp && (
        <div style={{ ...cardBox, padding: 16, marginBottom: 14 }}>
          <SectionTitle icon={Upload}>Importar compras</SectionTitle>
          <p style={{ fontSize: 12, color: C.mut, marginTop: -6, marginBottom: 10, lineHeight: 1.5 }}>
            Una compra por línea: <b style={{ color: C.mut }}>fecha, inversión (USD), BTC</b> — separadas por tab, coma&nbsp;con&nbsp;punto&nbsp;y&nbsp;coma o varios espacios. Fechas en formato D/M/AAAA (la hora se ignora). El precio por BTC se calcula solo.
          </p>
          <textarea value={impText} onChange={(e) => setImpText(e.target.value)} spellCheck={false} placeholder={EJEMPLO_IMPORT}
            style={{ ...mono, width: "100%", minHeight: 160, background: C.bg2, border: `1px solid ${C.line}`, color: C.text, borderRadius: 10, padding: "10px 12px", fontSize: 12.5, outline: "none", resize: "vertical" }} />
          <div className="flex items-center justify-between" style={{ marginTop: 12, flexWrap: "wrap", gap: 10 }}>
            <span style={{ fontSize: 12.5, color: parsed.length ? C.mut : C.red }}>
              {parsed.length ? <>Se importarán <b style={{ color: C.text }}>{parsed.length}</b> compra(s) · Inversión <b style={{ ...mono, color: C.text }}>{usd(impInv)}</b> · <b style={{ ...mono, color: C.orange }}>{btc(impBtc)}</b></> : "Nada válido que importar todavía."}
            </span>
            <div className="flex" style={{ gap: 8 }}>
              <button onClick={() => setImpText("")} style={{ background: "transparent", border: `1px solid ${C.line}`, color: C.mut, borderRadius: 9, padding: "8px 13px", fontSize: 13, cursor: "pointer" }}>Vaciar</button>
              <button onClick={doImport} disabled={!parsed.length} style={{ ...btnPrimary, opacity: parsed.length ? 1 : 0.45, cursor: parsed.length ? "pointer" : "not-allowed" }}><Upload size={15} /> Importar {parsed.length || ""}</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ ...cardBox, padding: 16 }}>
        <SectionTitle icon={ShoppingCart}>Compras registradas <span style={{ color: C.mut2, fontWeight: 500, fontSize: 12 }}>· {purchases.length}</span></SectionTitle>
        {purchases.length === 0 ? <MiniEmpty text="Sin compras todavía." /> : (
          <Ledger head={["Fecha", "BTC", "Precio", "Valor compra", "Comisión", "Invertido", ""]} minWidth={620}>
            {[...purchases].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).map((p) => {
              if (editId === p.id) {
                const valE = num(ed.total);
                return (
                  <tr key={p.id} style={{ background: C.bg2 }}>
                    <td style={tdBase}><input type="date" value={ed.fecha} onChange={(e) => setEd({ ...ed, fecha: e.target.value })} style={tinp} /></td>
                    <td style={tdBase}><input inputMode="decimal" value={ed.btc} onChange={(e) => edBtc(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveEdit()} style={{ ...tinp, textAlign: "right" }} /></td>
                    <td style={tdBase}><input inputMode="decimal" value={ed.precio} onChange={(e) => edPrecio(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveEdit()} style={{ ...tinp, textAlign: "right", borderColor: edLast === "precio" ? C.orangeDim : C.line }} /></td>
                    <td style={tdBase}><input inputMode="decimal" value={ed.total} onChange={(e) => edTotal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveEdit()} style={{ ...tinp, textAlign: "right", borderColor: edLast === "total" ? C.orangeDim : C.line }} /></td>
                    <td style={tdBase}><input inputMode="decimal" value={ed.fee} onChange={(e) => setEd({ ...ed, fee: e.target.value })} onKeyDown={(e) => e.key === "Enter" && saveEdit()} style={{ ...tinp, textAlign: "right" }} /></td>
                    <td style={{ ...tdNum, fontWeight: 600 }}>{usd(valE + num(ed.fee))}</td>
                    <td style={{ ...tdBase, textAlign: "right", whiteSpace: "nowrap" }}>
                      <Check size={16} color={C.green} style={{ cursor: "pointer", marginRight: 10 }} onClick={saveEdit} />
                      <X size={16} color={C.mut2} style={{ cursor: "pointer" }} onClick={cancelEdit} />
                    </td>
                  </tr>
                );
              }
              const val = num(p.btc) * num(p.precio);
              return (
                <tr key={p.id}>
                  <td style={tdMut}>{p.fecha}</td>
                  <td style={tdNum}>{num(p.btc).toFixed(8)}</td>
                  <td style={tdNum}>{usd(num(p.precio))}</td>
                  <td style={{ ...tdNum, color: C.mut }}>{usd(val)}</td>
                  <td style={tdNum}>{usd(num(p.fee))}</td>
                  <td style={{ ...tdNum, fontWeight: 600 }}>{usd(val + num(p.fee))}</td>
                  <td style={{ ...tdBase, textAlign: "right", whiteSpace: "nowrap" }}>
                    <Pencil size={15} color={C.mut2} style={{ cursor: "pointer", marginRight: 10 }} className="edit" onClick={() => startEdit(p)} />
                    <Trash2 size={15} color={C.mut2} style={{ cursor: "pointer" }} className="del" onClick={() => del(p.id)} />
                  </td>
                </tr>
              );
            })}
          </Ledger>
        )}
      </div>
    </div>
  );
}

/* ================= RETIROS ================= */
function Retiros({ withdrawals, setWithdrawals, price, costoProm, saldoBTC }) {
  const [f, setF] = useState({ fecha: today(), btc: "", precio: "", total: "", fee: "" });
  const [last, setLast] = useState("total"); // qué campo manda: "precio" | "total"

  // valores efectivos (sincronizados)
  const bq = num(f.btc);
  const effPrecio = num(f.precio);
  const effTotal = num(f.total);          // bruto: BTC × precio, antes de comisión
  const recibe = effTotal - num(f.fee);   // neto que entra a tu bolsillo
  const gananciaPrev = recibe - bq * costoProm;
  const excede = bq > saldoBTC + 1e-9;
  const ready = bq > 0 && effPrecio > 0;

  // handlers con cálculo en ambos sentidos (BTC ↔ precio ↔ total)
  const setBtc = (v) => setF((p) => {
    const n = { ...p, btc: v }; const b = num(v);
    if (b > 0) {
      if (last === "total" && num(p.total) > 0) n.precio = d2(num(p.total) / b);
      else if (num(p.precio) > 0) n.total = d2(b * num(p.precio));
    }
    return n;
  });
  const setPrecio = (v) => { setLast("precio"); setF((p) => {
    const n = { ...p, precio: v }; const b = num(p.btc);
    if (b > 0 && num(v) > 0) n.total = d2(b * num(v));
    return n;
  }); };
  const setTotal = (v) => { setLast("total"); setF((p) => {
    const n = { ...p, total: v }; const b = num(p.btc);
    if (b > 0 && num(v) > 0) n.precio = d2(num(v) / b);
    return n;
  }); };

  const add = () => {
    if (bq <= 0 || effPrecio <= 0) return;
    setWithdrawals((prev) => [...prev, { id: uid(), fecha: f.fecha || today(), btc: f.btc, precio: f.precio, fee: f.fee || "0" }]);
    setF({ fecha: today(), btc: "", precio: "", total: "", fee: "" });
    setLast("total");
  };
  const del = (id) => setWithdrawals((prev) => prev.filter((w) => w.id !== id));

  // edición de filas
  const [editId, setEditId] = useState(null);
  const [ed, setEd] = useState({});
  const [edLast, setEdLast] = useState("rec"); // qué campo manda al editar: "precio" | "rec"
  const startEdit = (w) => {
    setEditId(w.id);
    setEd({ fecha: w.fecha, btc: w.btc, precio: w.precio, rec: d2(num(w.btc) * num(w.precio) - num(w.fee)), fee: w.fee });
    setEdLast("rec");
  };
  const cancelEdit = () => { setEditId(null); setEd({}); setEdLast("rec"); };
  const saveEdit = () => {
    if (num(ed.btc) <= 0 || num(ed.precio) <= 0) return;
    setWithdrawals((prev) => prev.map((w) => (w.id === editId
      ? { ...w, fecha: ed.fecha || today(), btc: String(num(ed.btc)), precio: String(num(ed.precio)), fee: String(num(ed.fee) || 0) } : w)));
    cancelEdit();
  };

  // mismos cálculos que el formulario: "Recibido" es neto (BTC × precio − comisión)
  const edBtc = (v) => setEd((p) => {
    const n = { ...p, btc: v }; const b = num(v);
    if (b > 0) {
      if (edLast === "rec" && num(p.rec) > 0) n.precio = d2((num(p.rec) + num(p.fee)) / b);
      else if (num(p.precio) > 0) n.rec = d2(b * num(p.precio) - num(p.fee));
    }
    return n;
  });
  const edPrecio = (v) => { setEdLast("precio"); setEd((p) => {
    const n = { ...p, precio: v }; const b = num(p.btc);
    if (b > 0 && num(v) > 0) n.rec = d2(b * num(v) - num(p.fee));
    return n;
  }); };
  const edRec = (v) => { setEdLast("rec"); setEd((p) => {
    const n = { ...p, rec: v }; const b = num(p.btc);
    if (b > 0 && num(v) > 0) n.precio = d2((num(v) + num(p.fee)) / b);
    return n;
  }); };

  // importador de lote (fecha, recibido USD, BTC)
  const [showImp, setShowImp] = useState(false);
  const [impText, setImpText] = useState("");
  const parsed = useMemo(() => parseRows(impText), [impText]);
  const impRec = parsed.reduce((a, r) => a + r.inv, 0);
  const impBtc = parsed.reduce((a, r) => a + r.btc, 0);
  const doImport = () => {
    if (parsed.length === 0) return;
    setWithdrawals((prev) => [...prev, ...parsed.map((r) => ({ id: uid(), fecha: r.fecha, btc: String(r.btc), precio: String(r.precio), fee: "0" }))]);
    setImpText("");
    setShowImp(false);
  };

  const totRecibido = withdrawals.reduce((a, w) => a + num(w.btc) * num(w.precio) - num(w.fee), 0);
  const totGanancia = withdrawals.reduce((a, w) => a + (num(w.btc) * num(w.precio) - num(w.fee) - num(w.btc) * costoProm), 0);

  return (
    <div>
      <div style={{ ...cardBox, padding: 16, marginBottom: 14 }}>
        <SectionTitle icon={ArrowUpRight}>Registrar retiro / venta</SectionTitle>
        <div className="grid-form">
          <Field label="Fecha"><input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} style={inp} /></Field>
          <Field label="Cantidad BTC"><input inputMode="decimal" placeholder="0.003" value={f.btc} onChange={(e) => setBtc(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} style={inp} /></Field>
          <Field label="Total del retiro (USD)"><input inputMode="decimal" placeholder="100.00" value={f.total} onChange={(e) => setTotal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} style={{ ...inp, borderColor: last === "total" && effTotal > 0 ? C.orangeDim : C.line }} /></Field>
          <Field label="Precio por BTC (USD)"><input inputMode="decimal" placeholder={price ? String(Math.round(price)) : "0"} value={f.precio} onChange={(e) => setPrecio(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} style={{ ...inp, borderColor: last === "precio" && effPrecio > 0 ? C.orangeDim : C.line }} /></Field>
          <Field label="Comisión (USD)"><input inputMode="decimal" placeholder="0" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()} style={inp} /></Field>
        </div>

        {/* Resumen calculado en vivo */}
        <div style={{ marginTop: 12, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 11, padding: "11px 13px",
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }} className="calc-row">
          <Calc label="Cada BTC valía" value={ready ? usd(effPrecio) : "—"} hint={bq > 0 && effTotal > 0 ? `${d2(effTotal)} ÷ ${d8(bq)}` : "precio unitario"} />
          <Calc label="Valor del retiro" value={ready ? usd(effTotal) : "—"} hint={`${d8(bq) || "0"} BTC`} accent />
          <Calc label="Recibes (neto)" value={ready ? usd(recibe) : "—"} hint="− comisión" />
        </div>

        <div className="flex items-center justify-between" style={{ marginTop: 12, flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 13, color: C.mut }}>
            {ready && <>Ganancia est. <b style={{ ...mono, color: gananciaPrev >= 0 ? C.green : C.red }}>{gananciaPrev >= 0 ? "+" : ""}{usd(gananciaPrev)}</b> <span style={{ color: C.mut2 }}>· vs costo prom. {usd(costoProm)}/BTC</span></>}
            {excede && <div style={{ color: C.red, fontSize: 12, marginTop: 3 }}>⚠ Excede tu saldo ({btc(saldoBTC)})</div>}
          </div>
          <button onClick={add} disabled={!ready} style={{ ...btnPrimary, opacity: ready ? 1 : 0.45, cursor: ready ? "pointer" : "not-allowed" }}><ArrowUpRight size={16} /> Ingresar retiro</button>
        </div>
        <div style={{ marginTop: 12, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
          <button onClick={() => setShowImp((s) => !s)} style={{ background: "transparent", border: `1px solid ${C.line}`, color: C.mut, borderRadius: 9, padding: "7px 13px", fontSize: 12.5, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 }}>
            <Upload size={14} color={C.mut} /> {showImp ? "Ocultar importador" : "Importar lote (pegar tabla)"}
          </button>
        </div>
      </div>

      {showImp && (
        <div style={{ ...cardBox, padding: 16, marginBottom: 14 }}>
          <SectionTitle icon={Upload}>Importar retiros</SectionTitle>
          <p style={{ fontSize: 12, color: C.mut, marginTop: -6, marginBottom: 10, lineHeight: 1.5 }}>
            Un retiro por línea: <b style={{ color: C.mut }}>fecha, recibido (USD), BTC</b> — separadas por tab, punto&nbsp;y&nbsp;coma o varios espacios. Fechas D/M/AAAA (la hora se ignora). El precio de venta se calcula solo.
          </p>
          <textarea value={impText} onChange={(e) => setImpText(e.target.value)} spellCheck={false}
            placeholder={"22/7/2026 10:30\t520,00\t0,00760000\n23/7/2026\t150\t0,00220000"}
            style={{ ...mono, width: "100%", minHeight: 140, background: C.bg2, border: `1px solid ${C.line}`, color: C.text, borderRadius: 10, padding: "10px 12px", fontSize: 12.5, outline: "none", resize: "vertical" }} />
          <div className="flex items-center justify-between" style={{ marginTop: 12, flexWrap: "wrap", gap: 10 }}>
            <span style={{ fontSize: 12.5, color: parsed.length ? C.mut : C.red }}>
              {parsed.length ? <>Se importarán <b style={{ color: C.text }}>{parsed.length}</b> retiro(s) · Recibido <b style={{ ...mono, color: C.text }}>{usd(impRec)}</b> · <b style={{ ...mono, color: C.orange }}>{btc(impBtc)}</b>{impBtc > saldoBTC + 1e-9 && <span style={{ color: C.red }}> · ⚠ supera tu saldo ({btc(saldoBTC)})</span>}</> : "Nada válido que importar todavía."}
            </span>
            <div className="flex" style={{ gap: 8 }}>
              <button onClick={() => setImpText("")} style={{ background: "transparent", border: `1px solid ${C.line}`, color: C.mut, borderRadius: 9, padding: "8px 13px", fontSize: 13, cursor: "pointer" }}>Vaciar</button>
              <button onClick={doImport} disabled={!parsed.length} style={{ ...btnPrimary, opacity: parsed.length ? 1 : 0.45, cursor: parsed.length ? "pointer" : "not-allowed" }}><Upload size={15} /> Importar {parsed.length || ""}</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid-kpi" style={{ marginBottom: 14 }}>
        <Kpi label="Total retirado (efectivo)" value={usd(totRecibido)} sub={`${withdrawals.length} retiro(s)`} accent={C.blue} />
        <Kpi label="Ganancia de retiros" value={`${totGanancia >= 0 ? "+" : ""}${usd(totGanancia)}`} sub="vs costo promedio" color={totGanancia >= 0 ? C.green : C.red} />
        <Kpi label="BTC retirado" value={btc(withdrawals.reduce((a, w) => a + num(w.btc), 0))} sub="Salido de cartera" />
        <Kpi label="Saldo restante" value={btc(saldoBTC)} sub={usd(saldoBTC * price)} accent={C.orange} />
      </div>

      <div style={{ ...cardBox, padding: 16 }}>
        <SectionTitle icon={Banknote}>Resumen de retiros</SectionTitle>
        {withdrawals.length === 0 ? <MiniEmpty text="Sin retiros todavía." /> : (
          <Ledger head={["Fecha", "BTC", "Precio", "Recibido", "Ganancia", ""]} minWidth={560}>
            {[...withdrawals].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).map((w) => {
              if (editId === w.id) {
                const recE = num(ed.rec);
                const gE = recE - num(ed.btc) * costoProm;
                return (
                  <tr key={w.id} style={{ background: C.bg2 }}>
                    <td style={tdBase}><input type="date" value={ed.fecha} onChange={(e) => setEd({ ...ed, fecha: e.target.value })} style={tinp} /></td>
                    <td style={tdBase}><input inputMode="decimal" value={ed.btc} onChange={(e) => edBtc(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveEdit()} style={{ ...tinp, textAlign: "right" }} /></td>
                    <td style={tdBase}><input inputMode="decimal" value={ed.precio} onChange={(e) => edPrecio(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveEdit()} style={{ ...tinp, textAlign: "right", borderColor: edLast === "precio" ? C.orangeDim : C.line }} /></td>
                    <td style={tdBase}><input inputMode="decimal" value={ed.rec} onChange={(e) => edRec(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveEdit()} style={{ ...tinp, textAlign: "right", borderColor: edLast === "rec" ? C.orangeDim : C.line }} /></td>
                    <td style={{ ...tdNum, color: gE >= 0 ? C.green : C.red, fontWeight: 600 }}>{gE >= 0 ? "+" : ""}{usd(gE)}</td>
                    <td style={{ ...tdBase, textAlign: "right", whiteSpace: "nowrap" }}>
                      <Check size={16} color={C.green} style={{ cursor: "pointer", marginRight: 10 }} onClick={saveEdit} />
                      <X size={16} color={C.mut2} style={{ cursor: "pointer" }} onClick={cancelEdit} />
                    </td>
                  </tr>
                );
              }
              const rec = num(w.btc) * num(w.precio) - num(w.fee);
              const g = rec - num(w.btc) * costoProm;
              const pos = g >= 0;
              return (
                <tr key={w.id}>
                  <td style={tdMut}>{w.fecha}</td>
                  <td style={tdNum}>{num(w.btc).toFixed(8)}</td>
                  <td style={tdNum}>{usd(num(w.precio))}</td>
                  <td style={tdNum}>{usd(rec)}</td>
                  <td style={{ ...tdNum, color: pos ? C.green : C.red, fontWeight: 600 }}>{pos ? "+" : ""}{usd(g)}</td>
                  <td style={{ ...tdBase, textAlign: "right", whiteSpace: "nowrap" }}>
                    <Pencil size={15} color={C.mut2} style={{ cursor: "pointer", marginRight: 10 }} className="edit" onClick={() => startEdit(w)} />
                    <Trash2 size={15} color={C.mut2} style={{ cursor: "pointer" }} className="del" onClick={() => del(w.id)} />
                  </td>
                </tr>
              );
            })}
          </Ledger>
        )}
      </div>
    </div>
  );
}

/* ================= PROYECCIÓN ================= */
function Proyeccion({ m, price, setPrice }) {
  const base = price || m.costoProm || 1;
  const [target, setTarget] = useState(0);
  useEffect(() => { if (!target && base) setTarget(Math.round(base)); }, [base]);

  const tp = target || base;
  const projValorSaldo = m.saldoBTC * tp;
  const projNoRealizada = m.saldoBTC * (tp - m.costoProm);
  const projTotal = m.gananciaRealizada + projNoRealizada;
  const projPatrimonio = projValorSaldo + m.recibido;

  const min = Math.max(Math.round(m.costoProm * 0.6), 1);
  const max = Math.max(Math.round(base * 3), Math.ceil(tp * 1.1));

  const chart = useMemo(() => {
    const pts = [];
    const lo = Math.min(min, Math.round(m.costoProm));
    const hi = max;
    const step = (hi - lo) / 40;
    for (let p = lo; p <= hi; p += step) {
      pts.push({ precio: Math.round(p), ganancia: m.gananciaRealizada + m.saldoBTC * (p - m.costoProm) });
    }
    return pts;
  }, [m, min, max]);

  const scenarios = [
    { l: "Precio actual", mult: 1 },
    { l: "+25%", mult: 1.25 },
    { l: "+50%", mult: 1.5 },
    { l: "+100%", mult: 2 },
    { l: "+200%", mult: 3 },
  ];

  if (m.saldoBTC <= 1e-9) {
    return <Empty icon={Target} title="No hay saldo para proyectar" text="La proyección evalúa la ganancia potencial de tu saldo en BTC según su precio. Registra compras (o reduce retiros) para tener saldo." />;
  }
  const pos = projTotal >= 0;

  return (
    <div>
      <div style={{ ...cardBox, padding: 18, marginBottom: 14 }}>
        <SectionTitle icon={Target}>Simulador de precio</SectionTitle>
        <div className="flex items-baseline justify-between" style={{ marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 11.5, color: C.mut2, textTransform: "uppercase", letterSpacing: 0.5 }}>Si BTC llega a (editable)</div>
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <span style={{ ...mono, fontSize: 30, fontWeight: 700, color: C.orange }}>$</span>
              <input inputMode="decimal" value={target || ""} onChange={(e) => setTarget(num(e.target.value))} placeholder={String(Math.round(base))}
                style={{ ...mono, fontSize: 30, fontWeight: 700, color: C.orange, background: "transparent", border: "none",
                  borderBottom: `2px solid ${C.orangeDim}`, outline: "none", width: 150, padding: "0 2px" }} />
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11.5, color: C.mut2, textTransform: "uppercase", letterSpacing: 0.5 }}>Ganancia total proyectada</div>
            <div style={{ ...mono, fontSize: 30, fontWeight: 700, color: pos ? C.green : C.red }}>{pos ? "+" : ""}{usd(projTotal)}</div>
          </div>
        </div>
        <input type="range" min={min} max={max} step={Math.max(1, Math.round((max - min) / 400))} value={tp}
          onChange={(e) => setTarget(num(e.target.value))} className="rng" style={{ width: "100%" }} />
        <div className="flex justify-between" style={{ ...mono, fontSize: 11, color: C.mut2, marginTop: 2 }}>
          <span>{usd0(min)}</span><span>break-even {usd0(m.costoProm)}</span><span>{usd0(max)}</span>
        </div>
        <div className="grid-kpi" style={{ marginTop: 16 }}>
          <Kpi label="Valor del saldo" value={usd(projValorSaldo)} sub={btc(m.saldoBTC)} accent={C.orange} />
          <Kpi label="Ganancia no realizada" value={`${projNoRealizada >= 0 ? "+" : ""}${usd(projNoRealizada)}`} sub="Solo del saldo" color={projNoRealizada >= 0 ? C.green : C.red} />
          <Kpi label="+ Ganancia realizada" value={usd(m.gananciaRealizada)} sub="Ya asegurada" />
          <Kpi label="Valor generado proyectado" value={usd(projPatrimonio)} sub="Saldo + efectivo retirado" accent={C.blue} />
        </div>
      </div>

      <div style={{ ...cardBox, padding: 16, marginBottom: 14 }}>
        <SectionTitle icon={LineChart}>Curva de ganancia según el precio de BTC</SectionTitle>
        <div style={{ height: 240, marginTop: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="gpos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.orange} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={C.orange} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="precio" tick={{ fill: C.mut2, fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} stroke={C.line} />
              <YAxis tick={{ fill: C.mut2, fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} stroke={C.line} width={44} />
              <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, color: C.text }}
                labelFormatter={(v) => `BTC a ${usd0(v)}`} formatter={(v) => [usd(v), "Ganancia total"]} />
              <ReferenceLine x={Math.round(m.costoProm)} stroke={C.mut} strokeDasharray="4 4" label={{ value: "break-even", fill: C.mut, fontSize: 10, position: "insideTopLeft" }} />
              <ReferenceLine y={0} stroke={C.mut2} />
              <ReferenceLine x={Math.round(tp)} stroke={C.orange} strokeWidth={1.5} />
              <Area type="monotone" dataKey="ganancia" stroke={C.orange} strokeWidth={2} fill="url(#gpos)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ ...cardBox, padding: 16 }}>
        <SectionTitle icon={TrendingUp}>Escenarios rápidos</SectionTitle>
        <Ledger head={["Escenario", "Precio BTC", "Valor saldo", "Ganancia total", "vs invertido"]}>
          {scenarios.map((s) => {
            const p = base * s.mult;
            const gTot = m.gananciaRealizada + m.saldoBTC * (p - m.costoProm);
            const r = m.invertido > 0 ? gTot / m.invertido : 0;
            const pos2 = gTot >= 0;
            return (
              <tr key={s.l} style={{ cursor: "pointer" }} onClick={() => setTarget(Math.round(p))} className="scen">
                <td style={{ ...tdMut, color: C.text }}>{s.l}</td>
                <td style={tdNum}>{usd0(p)}</td>
                <td style={tdNum}>{usd(m.saldoBTC * p)}</td>
                <td style={{ ...tdNum, color: pos2 ? C.green : C.red, fontWeight: 600 }}>{pos2 ? "+" : ""}{usd(gTot)}</td>
                <td style={{ ...tdNum, color: pos2 ? C.green : C.red }}>{pct(r)}</td>
              </tr>
            );
          })}
        </Ledger>
        <p style={{ fontSize: 11.5, color: C.mut2, marginTop: 10, lineHeight: 1.5 }}>
          La proyección usa tu <b style={{ color: C.mut }}>costo promedio ponderado</b> ({usd(m.costoProm)}/BTC) como punto de equilibrio. Toca un escenario para cargarlo en el simulador. No es asesoría financiera: el precio real de BTC es impredecible.
        </p>
      </div>
    </div>
  );
}

/* ================= BIENVENIDA (primer uso) ================= */
function Bienvenida({ price, onEmpezar, onApertura, onRestaurar }) {
  const [modo, setModo] = useState(null); // null | "wallet" | "cero"
  const [f, setF] = useState({ btc: "", total: "", fecha: today() });
  const fileRef = useRef(null);
  const [err, setErr] = useState("");

  const bq = num(f.btc), tot = num(f.total);
  const precioMedio = bq > 0 && tot > 0 ? tot / bq : 0;
  const ready = bq > 0 && tot > 0;

  const leerArchivo = async (file) => {
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      const p = Array.isArray(d?.purchases) ? d.purchases : null;
      const w = Array.isArray(d?.withdrawals) ? d.withdrawals : null;
      if (!p && !w) throw new Error("no encontré compras ni retiros");
      onRestaurar({
        purchases: (p || []).map((r) => ({ ...r, id: r.id || uid() })),
        withdrawals: (w || []).map((r) => ({ ...r, id: r.id || uid() })),
        alerts: (Array.isArray(d?.alerts) ? d.alerts : []).map((r) => ({ ...r, id: r.id || uid() })),
        price: num(d?.settings?.price),
      });
    } catch (e) { setErr(`No pude leer el archivo: ${e.message}`); }
  };

  return (
    <div style={{ ...cardBox, padding: "32px 24px", maxWidth: 640, margin: "8px auto" }}>
      <div style={{ textAlign: "center", marginBottom: 26 }}>
        <div style={{ width: 54, height: 54, borderRadius: 15, background: C.orange, display: "grid", placeItems: "center",
          margin: "0 auto 14px", boxShadow: `0 0 28px ${C.orangeDim}66` }}>
          <Bitcoin size={30} color="#111" strokeWidth={2.4} />
        </div>
        <div style={{ fontWeight: 700, fontSize: 19 }}>Bienvenido a Control BTC</div>
        <div style={{ color: C.mut, fontSize: 13.5, marginTop: 7, lineHeight: 1.55, maxWidth: 420, margin: "7px auto 0" }}>
          Lleva el control de tus compras y retiros de bitcoin: ganancias, saldo y proyección.
          Tus datos se guardan <b style={{ color: C.mut }}>solo en este dispositivo</b> — no hay cuentas ni servidor.
        </div>
      </div>

      {!modo && (
        <div style={{ display: "grid", gap: 10 }}>
          <Opcion icon={Wallet} title="Ya tengo bitcoin en una wallet"
            text="Registra tu saldo actual como punto de partida. Es la forma más rápida de empezar con números correctos."
            onClick={() => setModo("wallet")} />
          <Opcion icon={Upload} title="Tengo un respaldo para importar"
            text="Restaura un archivo .json exportado desde otra instalación de Control BTC."
            onClick={() => fileRef.current?.click()} />
          <Opcion icon={Plus} title="Empezar de cero"
            text="Sin datos previos. Vas registrando cada compra a medida que las hagas."
            onClick={onEmpezar} />
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: "none" }}
            onChange={(e) => { leerArchivo(e.target.files?.[0]); e.target.value = ""; }} />
          {err && <div style={{ color: C.red, fontSize: 12.5, marginTop: 4 }}>{err}</div>}
        </div>
      )}

      {modo === "wallet" && (
        <div>
          <SectionTitle icon={Wallet}>Tu saldo actual</SectionTitle>
          <p style={{ fontSize: 12.5, color: C.mut, marginTop: -6, marginBottom: 14, lineHeight: 1.55 }}>
            Se creará <b style={{ color: C.mut }}>una compra de apertura</b> con estos datos. No necesitas el historial completo:
            basta con cuánto bitcoin tienes y cuánto te costó en total.
          </p>
          <div className="grid-form">
            <Field label="Bitcoin que tienes">
              <input inputMode="decimal" autoFocus placeholder="0.00250000" value={f.btc}
                onChange={(e) => setF({ ...f, btc: e.target.value })} style={inp} />
            </Field>
            <Field label="Cuánto invertiste en total (USD)">
              <input inputMode="decimal" placeholder="1000.00" value={f.total}
                onChange={(e) => setF({ ...f, total: e.target.value })} style={inp} />
            </Field>
            <Field label="Desde cuándo">
              <input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} style={inp} />
            </Field>
          </div>

          <div style={{ marginTop: 12, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 11, padding: "11px 13px",
            display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            <Calc label="Tu costo promedio" value={ready ? usd(precioMedio) : "—"} hint="punto de equilibrio" accent />
            <Calc label={`Valor hoy${price ? ` a ${usd0(price)}` : ""}`} value={ready && price ? usd(bq * price) : "—"}
              hint={ready && price ? (bq * price >= tot ? "▲ vas ganando" : "▼ vas perdiendo") : "esperando precio"} />
          </div>

          <p style={{ fontSize: 11.5, color: C.mut2, marginTop: 10, lineHeight: 1.5 }}>
            Si no recuerdas cuánto invertiste, pon una estimación: el saldo en BTC será exacto igual,
            y solo el costo promedio quedará aproximado. Lo puedes corregir después en Compras.
          </p>

          <div className="flex items-center justify-between" style={{ marginTop: 16, gap: 10 }}>
            <button onClick={() => setModo(null)} style={btnGhost}>Volver</button>
            <button onClick={() => onApertura({ btc: f.btc, total: f.total, fecha: f.fecha })} disabled={!ready}
              style={{ ...btnPrimary, opacity: ready ? 1 : 0.45, cursor: ready ? "pointer" : "not-allowed" }}>
              <Check size={16} /> Crear mi registro
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
function Opcion({ icon: Icon, title, text, onClick }) {
  return (
    <button onClick={onClick} className="opcion" style={{ display: "flex", gap: 13, alignItems: "flex-start", textAlign: "left",
      background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 12, padding: "14px 16px", cursor: "pointer", width: "100%" }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: C.card, display: "grid", placeItems: "center", flexShrink: 0 }}>
        <Icon size={17} color={C.orange} />
      </div>
      <div>
        <div style={{ fontWeight: 650, fontSize: 14, color: C.text }}>{title}</div>
        <div style={{ fontSize: 12.5, color: C.mut, marginTop: 3, lineHeight: 1.5 }}>{text}</div>
      </div>
    </button>
  );
}

/* ================= ALERTAS ================= */
function Alertas({ alerts, setAlerts, price, m }) {
  const [perm, setPerm] = useState(notifPerm());
  const [tipo, setTipo] = useState("baja");
  const [obj, setObj] = useState("");
  const [nota, setNota] = useState("");

  const objetivo = num(obj);
  // "sube" solo tiene sentido por encima del precio actual, y "baja" por debajo:
  // si no, la alerta nunca podría cruzarse y quedaría muerta.
  const valido = price > 0 && objetivo > 0 && (tipo === "sube" ? objetivo > price : objetivo < price);
  const motivo = !objetivo ? "" : !price ? "esperando precio…"
    : tipo === "sube" && objetivo <= price ? `Para "sube a" el objetivo debe ser mayor que ${usd0(price)}`
    : tipo === "baja" && objetivo >= price ? `Para "baja a" el objetivo debe ser menor que ${usd0(price)}` : "";

  const pedirPermiso = async () => {
    if (!canNotify()) return;
    try { setPerm(await Notification.requestPermission()); } catch {}
  };

  const add = () => {
    if (!valido) return;
    setAlerts((prev) => [...prev, { id: uid(), tipo, precio: String(objetivo), nota: nota.trim(), creada: Date.now(), firedAt: null }]);
    setObj(""); setNota("");
  };
  const del = (id) => setAlerts((prev) => prev.filter((a) => a.id !== id));
  const rearmar = (id) => setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, firedAt: null, firedPrice: null, visto: false } : a)));

  const preset = (p, t) => { setTipo(t); setObj(String(Math.round(p))); };
  const activas = alerts.filter((a) => !a.firedAt).sort((a, b) => num(b.precio) - num(a.precio));
  const disparadas = alerts.filter((a) => a.firedAt).sort((a, b) => b.firedAt - a.firedAt);

  return (
    <div>
      {/* estado de las notificaciones */}
      {perm !== "granted" && (
        <div style={{ ...cardBox, padding: 14, marginBottom: 14, borderLeft: `3px solid ${perm === "denied" ? C.red : C.orange}` }}>
          <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontSize: 13, color: C.mut, lineHeight: 1.5 }}>
              {perm === "denied"
                ? <>Bloqueaste las notificaciones para este sitio. Habilítalas desde el candado 🔒 de la barra de direcciones; mientras tanto las alertas solo sonarán y se marcarán aquí.</>
                : perm === "unsupported"
                ? <>Tu navegador no soporta notificaciones. Las alertas igual suenan y quedan registradas aquí.</>
                : <>Activa las notificaciones del navegador para que te avise aunque estés en otra pestaña.</>}
            </div>
            {perm === "default" && <button onClick={pedirPermiso} style={btnPrimary}><Bell size={15} /> Activar notificaciones</button>}
          </div>
        </div>
      )}

      {/* crear */}
      <div style={{ ...cardBox, padding: 16, marginBottom: 14 }}>
        <SectionTitle icon={Plus}>Nueva alerta</SectionTitle>
        <div className="grid-form">
          <Field label="Condición">
            <div className="flex" style={{ gap: 6 }}>
              {[["baja", "Baja a", C.green], ["sube", "Sube a", C.red]].map(([t, lbl, col]) => (
                <button key={t} onClick={() => setTipo(t)} style={{ flex: 1, background: tipo === t ? col + "22" : C.bg2,
                  border: `1px solid ${tipo === t ? col : C.line}`, color: tipo === t ? col : C.mut, borderRadius: 9,
                  padding: "9px 6px", fontSize: 13, fontWeight: tipo === t ? 650 : 500, cursor: "pointer" }}>{lbl}</button>
              ))}
            </div>
          </Field>
          <Field label="Precio objetivo (USD)">
            <input inputMode="decimal" value={obj} onChange={(e) => setObj(e.target.value)} placeholder={price ? String(Math.round(price)) : "0"}
              onKeyDown={(e) => e.key === "Enter" && add()} style={{ ...inp, borderColor: motivo ? C.red : C.line }} />
          </Field>
          <Field label="Nota (opcional)">
            <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="comprar otros $50"
              onKeyDown={(e) => e.key === "Enter" && add()} style={{ ...inp, fontFamily: "inherit" }} />
          </Field>
          <Field label="&nbsp;">
            <button onClick={add} disabled={!valido} style={{ ...btnPrimary, width: "100%", justifyContent: "center",
              opacity: valido ? 1 : 0.45, cursor: valido ? "pointer" : "not-allowed" }}><Bell size={15} /> Crear alerta</button>
          </Field>
        </div>
        {motivo && <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>{motivo}</div>}

        {/* atajos basados en tus números */}
        {price > 0 && (
          <div style={{ marginTop: 14, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
            <div style={{ fontSize: 11, color: C.mut2, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Atajos</div>
            <div className="flex" style={{ gap: 8, flexWrap: "wrap" }}>
              {m.costoProm > price && <Chip onClick={() => preset(m.costoProm, "sube")} label={`Punto de equilibrio ${usd0(m.costoProm)}`} color={C.orange} />}
              {m.costoProm < price && <Chip onClick={() => preset(m.costoProm, "baja")} label={`Punto de equilibrio ${usd0(m.costoProm)}`} color={C.orange} />}
              <Chip onClick={() => preset(price * 0.95, "baja")} label={`−5% · ${usd0(price * 0.95)}`} color={C.green} />
              <Chip onClick={() => preset(price * 0.9, "baja")} label={`−10% · ${usd0(price * 0.9)}`} color={C.green} />
              <Chip onClick={() => preset(price * 1.05, "sube")} label={`+5% · ${usd0(price * 1.05)}`} color={C.red} />
              <Chip onClick={() => preset(price * 1.1, "sube")} label={`+10% · ${usd0(price * 1.1)}`} color={C.red} />
            </div>
          </div>
        )}
      </div>

      {/* activas */}
      <div style={{ ...cardBox, padding: 16, marginBottom: 14 }}>
        <SectionTitle icon={Bell}>Alertas activas <span style={{ color: C.mut2, fontWeight: 500, fontSize: 12 }}>· {activas.length}</span></SectionTitle>
        {activas.length === 0 ? <MiniEmpty text="Sin alertas activas. Crea una arriba." /> : (
          <Ledger head={["Condición", "Objetivo", "Falta", "Valor de tu saldo ahí", "Nota", ""]} minWidth={640}>
            {activas.map((a) => {
              const t = num(a.precio);
              const dist = price > 0 ? (t - price) / price : 0;
              const sube = a.tipo === "sube";
              return (
                <tr key={a.id}>
                  <td style={{ ...tdMut, color: sube ? C.red : C.green, whiteSpace: "nowrap" }}>{sube ? "▲ sube a" : "▼ baja a"}</td>
                  <td style={{ ...tdNum, fontWeight: 600 }}>{usd0(t)}</td>
                  <td style={{ ...tdNum, color: C.mut }}>{pct(dist)}</td>
                  <td style={tdNum}>{usd(m.saldoBTC * t)}</td>
                  <td style={{ ...tdBase, color: C.mut, fontSize: 12.5 }}>{a.nota || "—"}</td>
                  <td style={{ ...tdBase, textAlign: "right" }}>
                    <Trash2 size={15} color={C.mut2} style={{ cursor: "pointer" }} className="del" onClick={() => del(a.id)} />
                  </td>
                </tr>
              );
            })}
          </Ledger>
        )}
      </div>

      {/* disparadas */}
      {disparadas.length > 0 && (
        <div style={{ ...cardBox, padding: 16 }}>
          <SectionTitle icon={BellRing}>Historial de disparos <span style={{ color: C.mut2, fontWeight: 500, fontSize: 12 }}>· {disparadas.length}</span></SectionTitle>
          <Ledger head={["Cuándo", "Condición", "Objetivo", "Precio al disparar", "Nota", ""]} minWidth={640}>
            {disparadas.map((a) => {
              const sube = a.tipo === "sube";
              return (
                <tr key={a.id}>
                  <td style={tdMut}>{new Date(a.firedAt).toLocaleString("es-SV", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                  <td style={{ ...tdMut, color: sube ? C.red : C.green, whiteSpace: "nowrap" }}>{sube ? "▲ subió a" : "▼ bajó a"}</td>
                  <td style={tdNum}>{usd0(num(a.precio))}</td>
                  <td style={{ ...tdNum, fontWeight: 600 }}>{usd0(num(a.firedPrice))}</td>
                  <td style={{ ...tdBase, color: C.mut, fontSize: 12.5 }}>{a.nota || "—"}</td>
                  <td style={{ ...tdBase, textAlign: "right", whiteSpace: "nowrap" }}>
                    <RotateCcw size={15} color={C.mut2} style={{ cursor: "pointer", marginRight: 10 }} className="edit" title="Volver a armar" onClick={() => rearmar(a.id)} />
                    <Trash2 size={15} color={C.mut2} style={{ cursor: "pointer" }} className="del" onClick={() => del(a.id)} />
                  </td>
                </tr>
              );
            })}
          </Ledger>
        </div>
      )}

      <p style={{ fontSize: 11.5, color: C.mut2, marginTop: 14, lineHeight: 1.6 }}>
        El precio se consulta cada 30 s, así que las alertas solo se evalúan <b style={{ color: C.mut }}>con esta pestaña abierta</b> —
        si cierras el navegador no hay quien vigile. Una alerta se dispara al <b style={{ color: C.mut }}>cruzar</b> el objetivo y luego
        queda en el historial; puedes volver a armarla desde ahí. Los navegadores ralentizan las pestañas en segundo plano,
        así que en background la comprobación puede espaciarse a ~1 min.
      </p>
    </div>
  );
}
function Chip({ label, onClick, color }) {
  return (
    <button onClick={onClick} style={{ ...mono, background: C.bg2, border: `1px solid ${C.line}`, color, borderRadius: 20,
      padding: "5px 11px", fontSize: 11.5, cursor: "pointer", whiteSpace: "nowrap" }}>{label}</button>
  );
}

/* ================= Componentes UI ================= */
const cardBox = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 15 };
const inp = { ...mono, width: "100%", background: C.bg2, border: `1px solid ${C.line}`, color: C.text, borderRadius: 9, padding: "9px 11px", fontSize: 14.5, outline: "none" };
const btnPrimary = { display: "inline-flex", alignItems: "center", gap: 7, background: C.orange, color: "#111", border: "none", borderRadius: 10, padding: "9px 16px", fontWeight: 650, fontSize: 13.5, cursor: "pointer" };
const btnGhost = { display: "inline-flex", alignItems: "center", gap: 7, background: "transparent", border: `1px solid ${C.line}`, color: C.mut, borderRadius: 9, padding: "7px 13px", fontSize: 12.5, cursor: "pointer" };
const btnMini = { background: C.orange, color: "#111", border: "none", borderRadius: 6, padding: "3px 8px", fontWeight: 650, fontSize: 12, cursor: "pointer" };
const tdBase = { padding: "9px 10px", fontSize: 13, borderBottom: `1px solid ${C.line}` };
const tinp = { ...mono, width: "100%", minWidth: 74, background: C.card, border: `1px solid ${C.line}`, color: C.text, borderRadius: 6, padding: "5px 7px", fontSize: 12.5, outline: "none" };
const tdMut = { ...tdBase, color: C.mut };
const tdNum = { ...tdBase, ...mono, textAlign: "right", color: C.text };

function Kpi({ label, value, sub, color, accent }) {
  return (
    <div style={{ ...cardBox, padding: 14, borderLeft: accent ? `3px solid ${accent}` : `1px solid ${C.line}` }}>
      <div style={{ fontSize: 11, color: C.mut2, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ ...mono, fontSize: 20, fontWeight: 700, marginTop: 5, color: color || C.text, lineHeight: 1.15 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.mut2, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}
function HeroStat({ label, value, sub, accent }) {
  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.line}`, borderLeft: `3px solid ${accent}`, borderRadius: 12, padding: "13px 15px" }}>
      <div style={{ fontSize: 11, color: C.mut2, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ ...mono, fontSize: 26, fontWeight: 700, marginTop: 4, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ ...mono, fontSize: 12, color: C.mut, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}
function SectionTitle({ icon: Icon, children }) {
  return <div className="flex items-center" style={{ gap: 8, marginBottom: 12, fontWeight: 650, fontSize: 14 }}>
    {Icon && <Icon size={16} color={C.orange} />}{children}</div>;
}
function Field({ label, children }) {
  return <label style={{ display: "block" }}>
    <div style={{ fontSize: 11.5, color: C.mut, marginBottom: 5 }}>{label}</div>{children}</label>;
}
function Ledger({ head, children, minWidth = 480 }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth }}>
        <thead><tr>{head.map((h, i) => (
          <th key={i} style={{ padding: "7px 10px", fontSize: 10.5, color: C.mut2, textTransform: "uppercase", letterSpacing: 0.5,
            textAlign: i === 0 || (i === head.length - 1 && h === "") ? "left" : "right", borderBottom: `1px solid ${C.line}`, fontWeight: 600 }}>{h}</th>
        ))}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Bar({ rows }) {
  const total = rows.reduce((a, r) => a + r.val, 0) || 1;
  return (
    <div>
      <div style={{ display: "flex", height: 26, borderRadius: 7, overflow: "hidden", background: C.bg2 }}>
        {rows.map((r, i) => r.val > 0 && <div key={i} style={{ width: `${(r.val / total) * 100}%`, background: r.color }} title={`${r.label}: ${usd(r.val)}`} />)}
      </div>
      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: "6px 18px" }}>
        {rows.map((r, i) => (
          <div key={i} className="flex items-center" style={{ gap: 6, fontSize: 12, color: C.mut }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: r.color }} />
            {r.label} <b style={{ ...mono, color: C.text }}>{usd(r.val)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
function Empty({ icon: Icon, title, text, cta, onCta }) {
  return (
    <div style={{ ...cardBox, padding: "48px 24px", textAlign: "center" }}>
      <div style={{ width: 52, height: 52, borderRadius: 14, background: C.bg2, display: "grid", placeItems: "center", margin: "0 auto 14px" }}>
        <Icon size={24} color={C.orange} />
      </div>
      <div style={{ fontWeight: 650, fontSize: 16 }}>{title}</div>
      <div style={{ color: C.mut, fontSize: 13.5, marginTop: 6, maxWidth: 380, marginLeft: "auto", marginRight: "auto", lineHeight: 1.5 }}>{text}</div>
      {cta && <button onClick={onCta} style={{ ...btnPrimary, marginTop: 16 }}><Plus size={16} /> {cta}</button>}
    </div>
  );
}
function MiniEmpty({ text }) {
  return <div style={{ padding: "22px 0", textAlign: "center", color: C.mut2, fontSize: 13 }}>{text}</div>;
}
function Calc({ label, value, hint, accent }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: C.mut2, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ ...mono, fontSize: 17, fontWeight: 700, color: accent ? C.orange : C.text, lineHeight: 1.2, marginTop: 2 }}>{value}</div>
      {hint && <div style={{ ...mono, fontSize: 10.5, color: C.mut2, marginTop: 1 }}>{hint}</div>}
    </div>
  );
}

/* ---------- estilos globales del artifact ---------- */
const styleSheet = `
  .grid-kpi { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .grid-form { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .grid-hero { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
  @media (max-width: 720px) {
    .grid-kpi { grid-template-columns: repeat(2, 1fr); }
    .grid-form { grid-template-columns: repeat(2, 1fr); }
    .calc-row { grid-template-columns: repeat(3, 1fr) !important; gap: 6px !important; }
  }
  input[type=date]::-webkit-calendar-picker-indicator { filter: invert(0.6); }
  .spin { animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .pulse { animation: pulse 1.8s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 ${C.green}88; } 50% { box-shadow: 0 0 0 4px ${C.green}00; } }
  .del:hover { color: ${C.red} !important; }
  .edit:hover { color: ${C.orange} !important; }
  .scen:hover td { background: ${C.cardHi}; }
  .tab-btn:hover { color: ${C.text}; }
  .opcion:hover { border-color: ${C.orangeDim} !important; background: ${C.cardHi} !important; }
  .rng { -webkit-appearance: none; appearance: none; height: 6px; border-radius: 6px;
    background: ${C.bg2}; border: 1px solid ${C.line}; outline: none; }
  .rng::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%;
    background: ${C.orange}; cursor: pointer; border: 3px solid ${C.bg}; box-shadow: 0 0 0 1px ${C.orange}; }
  .rng::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: ${C.orange};
    cursor: pointer; border: 3px solid ${C.bg}; }
  ::-webkit-scrollbar { height: 8px; width: 8px; }
  ::-webkit-scrollbar-thumb { background: ${C.line}; border-radius: 8px; }
`;
