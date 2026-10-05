import { useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function Num(p: any) {
  return (
    <label htmlFor={p.n}>
      {p.l}
      <input id={p.n} name={p.n} type="number" step="0.01" defaultValue={p.v} />
    </label>
  );
}
export function Stat(p: any) {
  return (
    <div className="stat">
      <span>{p.n}</span>
      <strong>{p.v}</strong>
    </div>
  );
}
export function Breakdown({ b, t }: any) {
  return (
    <section className="card">
      <h2>{t.costSummary}</h2>
      <div className="breakdown">
        {[
          [t.energyPrice, b.energy_price_sek],
          [t.tax, b.energy_tax_sek],
          [t.gridFee, b.grid_variable_sek],
          [t.markup, b.supplier_markup_sek],
          [t.otherShort, b.other_variable_sek],
          [t.fixedFees, b.fixed_fee_share_sek],
          [t.vat, b.vat_sek],
        ].map((x: any, i) => (
          <div key={i}>
            <span>{x[0]}</span>
            <strong>{Number(x[1] || 0).toFixed(2)} kr</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
export function CostChart({ data, t, fmt, tip }: any) {
  const [off, setOff] = useState<Record<string, boolean>>({});
  const toggle = (e: any) => setOff((x) => ({ ...x, [e.dataKey]: !x[e.dataKey] }));
  const bars = [
    ["base_ore", t.energyComponent, "#4470a5"],
    ["tax_ore", t.tax, "#d85d32"],
    ["grid_ore", t.gridFee, "#7868a6"],
    ["markup_ore", t.markup, "#d3a124"],
    ["other_ore", t.otherShort, "#7c8792"],
    ["fixed_ore", t.fixedFees, "#8a6240"],
    ["vat_ore", t.vat, "#27866d"],
  ];
  return (
    <section className="card">
      <h2>{t.costChart}</h2>
      <div className="chart">
        <ResponsiveContainer>
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="timestamp" tickFormatter={fmt} />
            <YAxis yAxisId="cost" />
            <YAxis yAxisId="price" orientation="right" />
            <Tooltip labelFormatter={fmt} formatter={tip} />
            <Legend onClick={toggle} />
            {bars.map((x: any) => (
              <Bar
                key={x[0]}
                hide={off[x[0]]}
                yAxisId="cost"
                dataKey={x[0]}
                name={`${x[1]} (öre)`}
                stackId="a"
                fill={x[2]}
              />
            ))}
            <Line
              hide={off.energy_price_sek_kwh}
              yAxisId="price"
              dataKey="energy_price_sek_kwh"
              name={`${t.energyPrice} (kr/kWh)`}
              stroke="#111"
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
export function Overview({ data, t, fmt, open }: any) {
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLocaleLowerCase();
  const filtered = data.filter(
    (x: any) =>
      !needle ||
      [
        x.name,
        x.program_name,
        x.original_filename,
        x.kiln_model,
        x.comment,
        x.electricity_area,
      ].some((v) =>
        String(v || "")
          .toLocaleLowerCase()
          .includes(needle),
      ),
  );
  const prepared = filtered
    .map((x: any) => ({ ...x, start_ms: new Date(x.start_time).getTime() }))
    .filter((x: any) => Number.isFinite(x.start_ms));
  const allPrepared = data
    .map((x: any) => ({ ...x, start_ms: new Date(x.start_time).getTime() }))
    .filter((x: any) => Number.isFinite(x.start_ms));
  const max = allPrepared.length
    ? Math.max(...allPrepared.map((x: any) => x.start_ms))
    : Date.now();
  const min = new Date(max);
  min.setMonth(min.getMonth() - 6);
  return (
    <main>
      <section className="card">
        <h2>{t.allFirings}</h2>
        <label htmlFor="overview-filter">
          {t.filterFirings}
          <input
            id="overview-filter"
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t.filterPlaceholder}
          />
        </label>
        <p className="muted">
          {t.showingFirings}: {prepared.length} / {data.length}. {t.sixMonthScale}
        </p>
        <div className="overviewchart" role="img" aria-label={t.allFirings}>
          <ResponsiveContainer>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="start_ms"
                domain={[min.getTime(), max]}
                tickFormatter={(v: any) => new Date(v).toLocaleDateString()}
              />
              <YAxis dataKey="estimated_total_cost_sek" />
              <Tooltip content={<OverviewTooltip t={t} fmt={fmt} />} />
              <Legend />
              <Scatter
                name={`${t.totalCost} (kr)`}
                data={prepared}
                fill="#d85d32"
                onClick={(p: any) => open(p.id)}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </section>
    </main>
  );
}
export function Firings({ list, q, setQ, open, page, setPage, load, t, fmt }: any) {
  return (
    <main>
      <section className="card">
        <h2>{t.firings}</h2>
        <label htmlFor="firing-search">{t.searchLabel}</label>
        <input
          id="firing-search"
          type="search"
          placeholder={t.search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {list.items.map((x: any) => (
          <button key={x.id} className="row" onClick={() => open(x.id)}>
            <strong>{x.name || x.original_filename}</strong>
            {x.program_name && (
              <span className="program-name">
                {t.programName}: {x.program_name}
              </span>
            )}
            <span>
              {fmt(x.start_time)} · {x.kiln_model}
            </span>
            {x.comment && <span className="comment">{x.comment}</span>}
          </button>
        ))}
        <div className="pager">
          <button
            disabled={page <= 1}
            onClick={() => {
              setPage(page - 1);
              load(page - 1);
            }}
          >
            {t.previous}
          </button>
          <span>
            {t.page} {list.page}/{list.pages}
          </span>
          <button
            disabled={page >= list.pages}
            onClick={() => {
              setPage(page + 1);
              load(page + 1);
            }}
          >
            {t.next}
          </button>
        </div>
      </section>
    </main>
  );
}
export function Metadata({ data, t, lang }: any) {
  const skip = new Set(["samples", "cost_intervals"]);
  const rows: any[] = [];
  const walk = (o: any, p = "") =>
    Object.entries(o || {}).forEach(([k, v]: any) => {
      if (skip.has(k)) return;
      const key = p ? `${p}.${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) walk(v, key);
      else rows.push([key, Array.isArray(v) ? JSON.stringify(v) : String(v ?? "")]);
    });
  walk(data);
  return (
    <section className="card metadata-card">
      <details>
        <summary>
          <strong>{t.metadata}</strong>
          <span>{t.expandMetadata}</span>
        </summary>
        <dl className="metadata">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}
export function CheapestTooltip({ active, payload, t, fmt }: any) {
  if (!active || !payload?.length) return null;
  const p = payload.find((x: any) => x?.payload)?.payload;
  if (!p) return null;
  const time = p.start_time || p.time || p.start_ms;
  return (
    <div className="chart-tip">
      <strong>
        {t.startTime}: {fmt(time)}
      </strong>
      {Number.isFinite(Number(p.total_cost_sek)) && (
        <div>
          {t.totalCost}: {Number(p.total_cost_sek).toFixed(2)} kr
        </div>
      )}
      {Number.isFinite(Number(p.average_energy_price_sek_kwh)) && (
        <div>
          {t.averagePrice}: {Number(p.average_energy_price_sek_kwh).toFixed(2)} kr/kWh
        </div>
      )}
      {Number.isFinite(Number(p.spot_price_sek_kwh)) && (
        <div>
          {t.areaSpotPrice}: {Number(p.spot_price_sek_kwh).toFixed(2)} kr/kWh
        </div>
      )}
    </div>
  );
}
export function OverviewTooltip({ active, payload, t, fmt }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="chart-tip">
      <strong>{p.name || p.original_filename}</strong>
      {p.program_name && (
        <div>
          {t.programName}: {p.program_name}
        </div>
      )}
      <div>
        {t.startTime}: {fmt(p.start_time)}
      </div>
      <div>
        {t.totalCost}: {Number(p.estimated_total_cost_sek || 0).toFixed(2)} kr
      </div>
    </div>
  );
}
