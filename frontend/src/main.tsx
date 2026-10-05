import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Copy } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
  ComposedChart,
  Bar,
  Brush,
} from "recharts";
import T from "./translations.json";
import "bootstrap/dist/css/bootstrap.min.css";
import "./styles.css";
import {
  Breakdown,
  CheapestTooltip,
  CostChart,
  Firings,
  Metadata,
  Num,
  Overview,
  OverviewTooltip,
  Stat,
} from "./components/FiringComponents";
const API = "/api",
  areas = ["SE1", "SE2", "SE3", "SE4", "FIXED"];
const units: any = {
  temperature: "°C",
  output_percent: "%",
  total_ore: "öre",
  energy_price_sek_kwh: "kr/kWh",
  estimated_total_cost_sek: "kr",
  total_cost_sek: "kr",
  average_energy_price_sek_kwh: "kr/kWh",
  base_ore: "öre",
  tax_ore: "öre",
  grid_ore: "öre",
  markup_ore: "öre",
  other_ore: "öre",
  fixed_ore: "öre",
  vat_ore: "öre",
};
function App() {
  const [lang, setLang] = useState(localStorage.lang || "sv"),
    t = (T as any)[lang] || (T as any).en,
    rtl = ["ar", "yi"].includes(lang),
    [view, setView] = useState(pathView()),
    [kilns, setKilns] = useState<any[]>([]),
    [list, setList] = useState<any>({ items: [], page: 1, pages: 1 }),
    [sel, setSel] = useState<any>(null),
    [display, setDisplay] = useState<any>(null),
    [overview, setOverview] = useState<any[]>([]),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [msg, setMsg] = useState(""),
    [cooling, setCooling] = useState(false),
    [when, setWhen] = useState(""),
    [altArea, setAltArea] = useState("SE4"),
    [optArea, setOptArea] = useState("SE4"),
    [cheap, setCheap] = useState<any>(null),
    [fixed, setFixed] = useState(false),
    [hidden, setHidden] = useState<Record<string, boolean>>({});
  function pathView() {
    return location.pathname === "/overview"
      ? "overview"
      : location.pathname === "/firings"
        ? "firings"
        : location.pathname.startsWith("/firings/")
          ? "detail"
          : "home";
  }
  useEffect(() => {
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [rtl, lang]);
  useEffect(() => {
    if (!msg) return;
    const timer = window.setTimeout(() => setMsg(""), 5000);
    return () => window.clearTimeout(timer);
  }, [msg]);
  const call = async (url: string, o?: RequestInit) => {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch(url, o);
      let b: any = {};
      try {
        b = await r.json();
      } catch {}
      if (!r.ok) throw Error(b.detail || `${t.requestFailed} (${r.status})`);
      return b;
    } catch (e: any) {
      setMsg(e.message || t.requestFailed);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const load = async (p = page, s = q) =>
    setList(
      await call(
        `${API}/firings?${new URLSearchParams({ page: String(p), page_size: "10", q: s })}`,
      ),
    );
  const go = async (v: string, path: string) => {
    history.pushState({}, "", path);
    setView(v);
    if (v === "firings") await load(1, q);
    if (v === "overview") setOverview(await call(API + "/overview"));
  };
  const open = async (id: string, push = true) => {
    const d = await call(`${API}/firings/${id}`);
    setSel(d);
    setDisplay(null);
    setCheap(null);
    const a =
      d.user_metadata?.electricity_area === "FIXED"
        ? "SE4"
        : d.user_metadata?.electricity_area || "SE4";
    setAltArea(a);
    setOptArea(a);
    setView("detail");
    if (push) history.pushState({}, "", `/firings/${id}`);
  };
  useEffect(() => {
    call(API + "/kilns")
      .then(setKilns)
      .catch(() => {});
    load(1, "").catch(() => {});
    const m = location.pathname.match(/^\/firings\/([0-9a-f-]+)$/i);
    if (m) open(m[1], false);
    if (location.pathname === "/overview")
      call(API + "/overview")
        .then(setOverview)
        .catch(() => {});
    const pop = () => setView(pathView());
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (view !== "firings") return;
    const h = setTimeout(() => {
      setPage(1);
      load(1, q).catch(() => {});
    }, 300);
    return () => clearTimeout(h);
  }, [q, view]);
  const fmt = (x: any) =>
    x
      ? new Date(x).toLocaleString(lang, {
          dateStyle: "short",
          timeStyle: "short",
        })
      : "";
  const current = display || sel;
  const raw = useMemo(
    () =>
      current?.samples?.map((s: any, i: number) => ({
        ...s,
        ...current.cost_intervals?.[i],
      })) || [],
    [current],
  );
  const data = useMemo(
    () =>
      cooling
        ? raw
        : raw.filter(
            (x: any) => x.active !== false && ((x.output_percent || 0) > 0 || x.energy_kwh > 0),
          ),
    [raw, cooling],
  );
  const upload = async (e: any) => {
    e.preventDefault();
    try {
      const b = await call(API + "/firings", {
        method: "POST",
        body: new FormData(e.currentTarget),
      });
      await load(1, "");
      setSel(b.firing);
      setDisplay(null);
      setView("detail");
      history.pushState({}, "", `/firings/${b.id}`);
      e.currentTarget.reset();
      setFixed(false);
      setMsg(t.uploadSuccess);
    } catch {}
  };
  const recalc = async () => {
    if (!when) return;
    try {
      const params: any = {
        start_time: new Date(when).toISOString(),
        area: altArea,
      };
      if (altArea === "FIXED")
        params.fixed_price = String(
          sel.user_metadata.cost_assumptions?.fixed_energy_price_sek_kwh || 1,
        );
      const d = await call(`${API}/firings/${sel.id}/cost-at?${new URLSearchParams(params)}`, {
        method: "POST",
      });
      setDisplay({
        ...sel,
        ...d,
        cost_intervals: d.intervals,
        user_metadata: {
          ...sel.user_metadata,
          spot_cost_sek: d.spot_cost_sek,
          estimated_total_cost_sek: d.total_cost_sek,
          cost_breakdown: d.breakdown,
        },
      });
    } catch {}
  };
  const legend = (e: any) => setHidden((h) => ({ ...h, [e.dataKey]: !h[e.dataKey] }));
  const tip = (v: any, n: any, p: any) => [
    `${Number(v).toLocaleString(lang)} ${units[p?.dataKey] || ""}`,
    n,
  ];
  const copy = async () => {
    const url = `${location.origin}/firings/${sel.id}`;
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(url);
      else {
        const x = document.createElement("textarea");
        x.value = url;
        x.setAttribute("readonly", "");
        x.style.position = "fixed";
        x.style.left = "-9999px";
        document.body.appendChild(x);
        x.select();
        const ok = document.execCommand("copy");
        x.remove();
        if (!ok) throw Error("copy failed");
      }
      setMsg(t.copied);
    } catch {
      window.prompt(t.copy, url);
    }
  };
  return (
    <div dir={rtl ? "rtl" : "ltr"}>
      <a className="skip-link" href="#main-content">
        {t.skipToContent}
      </a>
      <nav className="navbar navbar-expand-lg navbar-dark bg-dark">
        <div className="container-fluid app-width">
          <button
            type="button"
            className="navbar-brand btn btn-link"
            onClick={() => go("home", "/")}
          >
            {t.title}
          </button>
          <div className="navbar-nav flex-row flex-wrap gap-2 align-items-center">
            <button type="button" className="nav-link btn btn-link" onClick={() => go("home", "/")}>
              {t.home}
            </button>
            <button
              type="button"
              className="nav-link btn btn-link"
              onClick={() => go("overview", "/overview")}
            >
              {t.overview}
            </button>
            <button
              type="button"
              className="nav-link btn btn-link"
              onClick={() => go("firings", "/firings")}
            >
              {t.firings}
            </button>
            <select
              aria-label={t.language}
              className="form-select form-select-sm lang"
              value={lang}
              onChange={(e) => {
                setLang(e.target.value);
                localStorage.lang = e.target.value;
              }}
            >
              {Object.keys(T).map((k) => (
                <option key={k} value={k}>
                  {
                    (
                      {
                        sv: "Svenska",
                        da: "Dansk",
                        no: "Norsk",
                        en: "English",
                        de: "Deutsch",
                        nl: "Nederlands",
                        fr: "Français",
                        ar: "العربية",
                        yi: "ייִדיש",
                      } as any
                    )[k]
                  }
                </option>
              ))}
            </select>
          </div>
        </div>
      </nav>
      {msg && (
        <div className="app-width alert alert-warning mt-3" role="status" aria-live="polite">
          {msg}
        </div>
      )}
      {view === "overview" ? (
        <Overview data={overview} t={t} fmt={fmt} open={open} />
      ) : view === "firings" ? (
        <Firings
          list={list}
          q={q}
          setQ={setQ}
          open={open}
          page={page}
          setPage={setPage}
          load={load}
          t={t}
          fmt={fmt}
        />
      ) : view === "home" ? (
        <main id="main-content" tabIndex={-1}>
          <section className="card">
            <h2>{t.upload}</h2>
            <div className="upload-info">
              <strong>{t.uploadInfoTitle}</strong>
              <p>{t.uploadInfo}</p>
            </div>
            <form className="upload-form" onSubmit={upload}>
              <label htmlFor="firing-name">
                {t.name}
                <input id="firing-name" required name="name" maxLength={120} />
              </label>
              <label htmlFor="firing-file">
                {t.csv}
                <input id="firing-file" required name="file" type="file" accept=".csv,text/csv" />
              </label>
              <label htmlFor="kiln-model">
                {t.kiln}
                <select id="kiln-model" required name="kiln_model">
                  <option />
                  {kilns.map((k) => (
                    <option key={k.model} value={k.model}>
                      {k.model} ({k.power_kw} kW)
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="electricity-area">
                {t.area}
                <select
                  id="electricity-area"
                  name="electricity_area"
                  defaultValue="SE4"
                  onChange={(e) => setFixed(e.target.value === "FIXED")}
                >
                  {areas.map((a) => (
                    <option key={a} value={a}>
                      {a === "FIXED" ? t.fixedOption : a}
                    </option>
                  ))}
                </select>
              </label>
              {fixed && <Num n="fixed_energy_price_sek_kwh" l={t.fixedPrice} v="1.00" />}
              <label htmlFor="comment">
                {t.comment}
                <textarea id="comment" name="comment" />
              </label>
              <details>
                <summary>{t.costs}</summary>
                <Num n="energy_tax_sek_kwh" l={`${t.tax} (kr/kWh)`} v="0.36" />
                <Num n="grid_variable_sek_kwh" l={`${t.grid} (kr/kWh)`} v="0.30" />
                <Num n="supplier_markup_sek_kwh" l={`${t.markup} (kr/kWh)`} v="0.05" />
                <Num n="other_variable_sek_kwh" l={`${t.other} (kr/kWh)`} v="0.01" />
                <Num n="vat_rate" l={`${t.vat} (decimal 0–1)`} v="0.25" />
                <Num n="fixed_monthly_sek" l={`${t.fixedMonthly} (kr/månad)`} v="150" />
                <Num
                  n="monthly_consumption_kwh"
                  l={`${t.monthlyConsumption} (kWh/månad)`}
                  v="1000"
                />
              </details>
              <label className="consent">
                <input required name="cc0_consent" type="checkbox" value="true" />
                <span>{t.cc0Consent}</span>
              </label>
              <p className="consent-help" id="cc0-help">
                {t.cc0Help}
              </p>
              <button type="submit" className="btn btn-primary">
                {t.upload}
              </button>
            </form>
          </section>
        </main>
      ) : (
        <main>
          {sel && (
            <>
              <section className="card hero">
                <div>
                  <h2>
                    {sel.user_metadata.name ||
                      sel.controller_metadata.program_name ||
                      sel.original_filename}
                  </h2>
                  <div className="hero-meta">
                    <span>
                      <strong>{t.startTime}:</strong> {fmt(sel.controller_metadata?.start_time)}
                    </span>
                    {sel.controller_metadata?.program_name && (
                      <span>
                        <strong>{t.programName}:</strong> {sel.controller_metadata.program_name}
                      </span>
                    )}
                  </div>
                  <p>{sel.user_metadata.comment}</p>
                </div>
                <button
                  type="button"
                  className="btn btn-light"
                  onClick={copy}
                  aria-label={t.copyLink}
                  title={t.copyLink}
                >
                  <Copy aria-hidden="true" size={16} />
                </button>
              </section>
              <div className="stats">
                <Stat
                  n={t.totalCost}
                  v={`${Number(current.user_metadata?.estimated_total_cost_sek || current.total_cost_sek || 0).toFixed(2)} kr`}
                />
                <Stat
                  n={t.energyPrice}
                  v={`${Number(current.user_metadata?.spot_cost_sek || current.spot_cost_sek || 0).toFixed(2)} kr`}
                />
                <Stat
                  n={t.energy}
                  v={`${current.user_metadata?.energy_kwh || current.energy_kwh || 0} kWh`}
                />
              </div>
              <section className="card">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={cooling}
                    onChange={(e) => setCooling(e.target.checked)}
                  />
                  {t.showCooling}
                </label>
                <h2>{t.mainChart}</h2>
                <div className="chart">
                  <ResponsiveContainer>
                    <LineChart data={data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="timestamp" tickFormatter={fmt} />
                      <YAxis yAxisId="temp" />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip labelFormatter={fmt} formatter={tip} />
                      <Legend onClick={legend} />
                      <Line
                        hide={hidden.temperature}
                        yAxisId="temp"
                        dataKey="temperature"
                        name={`${t.temperature} (°C)`}
                        dot={false}
                        stroke="#d85d32"
                      />
                      <Line
                        hide={hidden.output_percent}
                        yAxisId="right"
                        dataKey="output_percent"
                        name={`${t.power} (%)`}
                        dot={false}
                        stroke="#d3a124"
                      />
                      <Line
                        hide={hidden.total_ore}
                        yAxisId="right"
                        dataKey="total_ore"
                        name={`${t.costOre} (öre)`}
                        dot={false}
                        stroke="#27866d"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>
              <CostChart data={data} t={t} fmt={fmt} tip={tip} />
              <Breakdown
                b={current?.breakdown || current?.user_metadata?.cost_breakdown || {}}
                t={t}
              />
              <section className="card">
                <h2>{t.alternative}</h2>
                <div className="tools">
                  <input
                    aria-label={t.startTime}
                    type="datetime-local"
                    value={when}
                    onChange={(e) => setWhen(e.target.value)}
                  />
                  <select
                    aria-label={t.area}
                    value={altArea}
                    onChange={(e) => setAltArea(e.target.value)}
                  >
                    {areas.map((a) => (
                      <option key={a} value={a}>
                        {a === "FIXED" ? t.fixedOption : a}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-primary" disabled={!when} onClick={recalc}>
                    {t.calculate}
                  </button>
                </div>
              </section>
              <section className="card">
                <h2>{t.cheapest}</h2>
                <div className="tools">
                  <select
                    aria-label={t.area}
                    value={optArea}
                    onChange={(e) => setOptArea(e.target.value)}
                  >
                    {areas.slice(0, 4).map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                  <button
                    className="btn btn-primary"
                    onClick={async () => {
                      try {
                        setCheap(await call(`${API}/firings/${sel.id}/cheapest?area=${optArea}`));
                      } catch {
                        setCheap(null);
                      }
                    }}
                  >
                    {t.findCheapest}
                  </button>
                </div>
                {cheap && (
                  <>
                    <div className={`traffic ${cheap.price_level}`}>
                      <span />
                      <strong>{t[cheap.price_level]}</strong>
                    </div>
                    <p>
                      <strong>
                        {t.startKiln}: {fmt(cheap.start_time)}
                      </strong>{" "}
                      · {t.price}: {cheap.total_cost_sek.toFixed(2)} kr · {t.averagePrice}:{" "}
                      {cheap.average_energy_price_sek_kwh.toFixed(2)} kr/kWh
                    </p>
                    <div className="smallchart" role="img" aria-label={t.cheapest}>
                      <ResponsiveContainer>
                        <ComposedChart
                          data={[...(cheap.spot_prices || []), ...cheap.candidates].sort(
                            (a: any, b: any) => a.start_ms - b.start_ms,
                          )}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            type="number"
                            dataKey="start_ms"
                            domain={["dataMin", "dataMax"]}
                            tickFormatter={(v: any) => fmt(v)}
                          />
                          <YAxis
                            yAxisId="cost"
                            dataKey="total_cost_sek"
                            name={`${t.totalCost} (kr)`}
                          />
                          <YAxis
                            yAxisId="spot"
                            orientation="right"
                            dataKey="spot_price_sek_kwh"
                            name={`${t.areaSpotPrice} ${cheap.area} (kr/kWh)`}
                          />
                          <ZAxis range={[60, 60]} />
                          <Tooltip content={<CheapestTooltip t={t} fmt={fmt} />} />
                          <Legend onClick={legend} />
                         
                          <Scatter
                            data={cheap.candidates || []}
                            hide={hidden.total_cost_sek}
                            yAxisId="cost"
                            dataKey="total_cost_sek"
                            name={`${t.totalCost} (kr)`}
                            onClick={(p: any) => {
                              if (p?.start_time) {
                                setWhen(p.start_time.slice(0, 16));
                                setAltArea(optArea);
                              }
                            }}
                          >
                            {cheap.candidates.map((p: any, i: number) => (
                              <Cell
                                key={i}
                                fill={
                                  p.price_level === "green"
                                    ? "#198754"
                                    : p.price_level === "yellow"
                                      ? "#ffc107"
                                      : "#dc3545"
                                }
                              />
                            ))}
                          </Scatter>
                          <Line
                            data={cheap.spot_prices || []}
                            hide={hidden.spot_price_sek_kwh}
                            yAxisId="spot"
                            dataKey="spot_price_sek_kwh"
                            name={`${t.areaSpotPrice} ${cheap.area} (kr/kWh)`}
                            stroke="#0d6efd"
                            strokeWidth={2}
                            dot={false}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                )}
              </section>
              <Metadata data={sel} t={t} lang={lang} />
            </>
          )}
        </main>
      )}
      {busy && (
        <div className="overlay">
          <div className="spinner" />
          <strong>{t.loading}</strong>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
