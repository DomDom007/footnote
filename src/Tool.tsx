// Footnote: adds a carbon estimate to every expense claim, ready for a sustainability report.
import { useMemo, useState } from "react";
import { csvObjects, num, toCsv } from "./lib/csv";
import { download, uid, useStored } from "./lib/store";
import { ImportBox, Section, Stat, Stats } from "./ui/kit";

const T = "footnote";
// Approximate factors from public averages (UK DEFRA and US EPA style), kg CO2e. Estimates only: good for trends and ranking, not audited reporting.
const ACTIVITY: Record<string, { unit: string; kg: number; label: string }> = {
  flight_short: { unit: "km", kg: 0.15, label: "Flight, under 1,500 km (economy)" }, flight_long: { unit: "km", kg: 0.14, label: "Flight, long haul (economy)" }, flight_business: { unit: "km", kg: 0.41, label: "Flight, business class" },
  train: { unit: "km", kg: 0.035, label: "Train" }, car: { unit: "km", kg: 0.17, label: "Car or taxi" }, hotel: { unit: "nights", kg: 25, label: "Hotel night" }, fuel: { unit: "litres", kg: 2.3, label: "Petrol or diesel" },
};
const SPEND: Record<string, { kg: number; label: string }> = { meals: { kg: 0.35, label: "Meals and catering" }, office: { kg: 0.3, label: "Office supplies" }, electronics: { kg: 0.45, label: "Electronics and hardware" }, software: { kg: 0.08, label: "Software and cloud" }, services: { kg: 0.12, label: "Professional services" }, other: { kg: 0.25, label: "Other" } };
// A few airports so flights can be entered as city pairs.
const AP: Record<string, [number, number]> = { TUN: [36.85, 10.23], CDG: [49.01, 2.55], ORY: [48.73, 2.37], FRA: [50.04, 8.56], LHR: [51.47, -0.45], IST: [41.26, 28.74], DXB: [25.25, 55.36], DOH: [25.27, 51.61], MAD: [40.47, -3.56], FCO: [41.8, 12.25], ALG: [36.69, 3.22], CMN: [33.37, -7.59], CAI: [30.12, 31.41], JFK: [40.64, -73.78], YUL: [45.47, -73.74], AMS: [52.31, 4.76], BRU: [50.9, 4.48], MXP: [45.63, 8.72], NCE: [43.66, 7.21], MRS: [43.44, 5.22], DJE: [33.87, 10.78], MIR: [35.76, 10.75], SFA: [34.72, 10.69] };
const hav = (a: [number, number], b: [number, number]) => { const r = (x: number) => (x * Math.PI) / 180, dLat = r(b[0] - a[0]), dLon = r(b[1] - a[1]); const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLon / 2) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(h)); };
type Exp = { id: string; date: string; who: string; what: string; amount: number; cat: string; qty: number; route?: string };
const SAMPLE: Exp[] = [
  { id: "e1", date: "2026-09-03", who: "Amira", what: "Flight TUN-CDG return", amount: 890, cat: "flight_short", qty: 2 * Math.round(hav(AP.TUN, AP.CDG)), route: "TUN-CDG return" },
  { id: "e2", date: "2026-09-04", who: "Amira", what: "Hotel Paris, 3 nights", amount: 1260, cat: "hotel", qty: 3 }, { id: "e3", date: "2026-09-10", who: "Karim", what: "Taxi to client, Sfax", amount: 45, cat: "car", qty: 28 },
  { id: "e4", date: "2026-09-12", who: "Karim", what: "Team lunch", amount: 310, cat: "meals", qty: 310 }, { id: "e5", date: "2026-09-15", who: "Ines", what: "Laptop", amount: 3400, cat: "electronics", qty: 3400 },
  { id: "e6", date: "2026-09-18", who: "Walid", what: "Train Tunis-Sousse return", amount: 32, cat: "train", qty: 290 }, { id: "e7", date: "2026-09-20", who: "Ines", what: "Flight TUN-DXB return, business", amount: 4100, cat: "flight_business", qty: 2 * Math.round(hav(AP.TUN, AP.DXB)), route: "TUN-DXB return" },
  { id: "e8", date: "2026-09-25", who: "Walid", what: "Cloud hosting", amount: 900, cat: "software", qty: 900 },
];
const kgOf = (e: Exp) => (ACTIVITY[e.cat] ? ACTIVITY[e.cat].kg * e.qty : (SPEND[e.cat]?.kg ?? 0.25) * e.qty);

export default function Footnote() {
  const [exps, setExps] = useStored<Exp[]>(T, "exps", SAMPLE);
  const [rate, setRate] = useStored(T, "rate", 0.32); // local currency to USD, for spend-based factors
  const [cur, setCur] = useStored(T, "cur", "TND");
  const [d, setD] = useState({ what: "", who: "", amount: "", cat: "meals", qty: "", from: "TUN", to: "CDG", ret: true, date: new Date().toISOString().slice(0, 10) });
  const withKg = useMemo(() => exps.map(e => ({ ...e, kg: ACTIVITY[e.cat] ? kgOf(e) : (SPEND[e.cat]?.kg ?? 0.25) * e.amount * rate })), [exps, rate]);
  const total = withKg.reduce((a, e) => a + e.kg, 0);
  const cats = Object.entries(withKg.reduce((a, e) => { const k = ACTIVITY[e.cat]?.label ?? SPEND[e.cat]?.label ?? e.cat; a[k] = (a[k] ?? 0) + e.kg; return a; }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1]);
  const people = Object.entries(withKg.reduce((a, e) => { a[e.who] = (a[e.who] ?? 0) + e.kg; return a; }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1]);
  const isFlight = d.cat.startsWith("flight");
  const flightKm = AP[d.from] && AP[d.to] ? Math.round(hav(AP[d.from], AP[d.to])) * (d.ret ? 2 : 1) : 0;
  const add = () => {
    const amount = num(d.amount), qty = isFlight ? flightKm : ACTIVITY[d.cat] ? num(d.qty) : amount;
    if (!d.what.trim() && !isFlight) return;
    setExps([{ id: uid(), date: d.date, who: d.who || "Me", what: d.what || `Flight ${d.from}-${d.to}${d.ret ? " return" : ""}`, amount, cat: d.cat, qty, route: isFlight ? `${d.from}-${d.to}${d.ret ? " return" : ""}` : undefined }, ...exps]);
    setD({ ...d, what: "", amount: "", qty: "" });
  };
  const t = (kg: number) => (kg >= 1000 ? `${(kg / 1000).toFixed(2)} t` : `${Math.round(kg)} kg`);

  return (
    <div className="stack">
      <Section title="Carbon from expenses" aside={<button className="btn small" onClick={() => download("expense-emissions.csv", toCsv([["Date", "Employee", "Expense", "Amount", "Currency", "Category", "Activity", "kg CO2e"], ...withKg.map(e => [e.date, e.who, e.what, e.amount, cur, ACTIVITY[e.cat]?.label ?? SPEND[e.cat]?.label ?? e.cat, ACTIVITY[e.cat] ? `${e.qty} ${ACTIVITY[e.cat].unit}` : "spend-based", e.kg.toFixed(1)])]), "text/csv")}>Export for the report</button>}>
        <Stats><Stat value={t(total)} label="CO2e from these expenses" /><Stat value={cats[0]?.[0] ?? "–"} label="Biggest source" tone="warn" /><Stat value={t(withKg.filter(e => e.cat.startsWith("flight")).reduce((a, e) => a + e.kg, 0))} label="From flights" /><Stat value={`${Math.round(total / Math.max(1, withKg.reduce((a, e) => a + e.amount, 0)) * 1000)} g`} label={`Per ${cur} spent`} /></Stats>
        <div className="fn-bars">{cats.map(([k, v]) => <div key={k} className="fn-row"><span>{k}</span><div className="fn-track"><i style={{ width: `${(v / (cats[0]?.[1] || 1)) * 100}%` }} /></div><b className="num">{t(v)}</b></div>)}</div>
      </Section>
      <div className="grid2">
        <Section title="Add an expense">
          <div className="stack" style={{ gap: 10 }}>
            <div className="row"><label className="field"><span>Type</span><select className="input" value={d.cat} onChange={e => setD({ ...d, cat: e.target.value })}><optgroup label="Measured by activity">{Object.entries(ACTIVITY).map(([k, a]) => <option key={k} value={k}>{a.label}</option>)}</optgroup><optgroup label="Estimated from spend">{Object.entries(SPEND).map(([k, a]) => <option key={k} value={k}>{a.label}</option>)}</optgroup></select></label><label className="field"><span>Employee</span><input className="input" value={d.who} onChange={e => setD({ ...d, who: e.target.value })} /></label></div>
            {isFlight ? <div className="row" style={{ alignItems: "flex-end" }}><label className="field"><span>From</span><select className="input" value={d.from} onChange={e => setD({ ...d, from: e.target.value })}>{Object.keys(AP).map(k => <option key={k}>{k}</option>)}</select></label><label className="field"><span>To</span><select className="input" value={d.to} onChange={e => setD({ ...d, to: e.target.value })}>{Object.keys(AP).map(k => <option key={k}>{k}</option>)}</select></label><label className="check" style={{ paddingBottom: 10 }}><input type="checkbox" checked={d.ret} onChange={e => setD({ ...d, ret: e.target.checked })} />Return</label><span className="note" style={{ paddingBottom: 10 }}>{flightKm.toLocaleString()} km</span></div>
              : <label className="field"><span>What</span><input className="input" value={d.what} onChange={e => setD({ ...d, what: e.target.value })} /></label>}
            <div className="row">{ACTIVITY[d.cat] && !isFlight && <label className="field"><span>{ACTIVITY[d.cat].unit}</span><input className="input num" value={d.qty} onChange={e => setD({ ...d, qty: e.target.value })} /></label>}<label className="field"><span>Amount ({cur})</span><input className="input num" value={d.amount} onChange={e => setD({ ...d, amount: e.target.value })} /></label><label className="field"><span>Date</span><input type="date" className="input" value={d.date} onChange={e => setD({ ...d, date: e.target.value })} /></label></div>
            <button className="btn primary" style={{ alignSelf: "flex-start" }} onClick={add}>Add</button>
          </div>
        </Section>
        <Section title="By person">
          {people.map(([p, v]) => <p key={p} className="row" style={{ justifyContent: "space-between" }}><span>{p}</span><strong className="num">{t(v)}</strong></p>)}
          <div className="row" style={{ marginTop: 12 }}><label className="field"><span>Currency</span><input className="input" value={cur} onChange={e => setCur(e.target.value.toUpperCase().slice(0, 3))} /></label><label className="field"><span>1 {cur} in USD (for spend factors)</span><input className="input num" value={rate} onChange={e => setRate(num(e.target.value) || 1)} /></label></div>
          <p className="note" style={{ marginTop: 8 }}>Travel uses distance and nights, which is more accurate. Other purchases use average emissions per dollar spent. Treat totals as estimates for spotting the big items.</p>
        </Section>
      </div>
      <Section title="Expenses">
        <div className="table-wrap"><table className="t"><thead><tr><th>Date</th><th>Who</th><th>Expense</th><th className="r">Amount</th><th className="r">CO2e</th><th /></tr></thead>
          <tbody>{withKg.map(e => <tr key={e.id}><td className="num">{e.date}</td><td>{e.who}</td><td>{e.what}<br /><span className="note">{ACTIVITY[e.cat] ? `${e.qty.toLocaleString()} ${ACTIVITY[e.cat].unit}` : SPEND[e.cat]?.label}</span></td><td className="r">{e.amount.toLocaleString()}</td><td className="r"><strong>{t(e.kg)}</strong></td><td><button className="btn ghost small danger" onClick={() => setExps(exps.filter(x => x.id !== e.id))}>×</button></td></tr>)}</tbody></table></div>
      </Section>
      <Section title="Import from your expense tool"><ImportBox label="CSV with date, employee, description, amount and category" rows={3} placeholder={"date,employee,description,amount,category\n2026-09-02,Amira,Team dinner,240,meals"} onText={tx => setExps([...csvObjects(tx).map(r => { const c = (r.category || "").toLowerCase(); const cat = /flight|air/.test(c) ? "flight_short" : /hotel|lodg/.test(c) ? "hotel" : /taxi|uber|car|mileage/.test(c) ? "car" : /train|rail/.test(c) ? "train" : /meal|food|restaurant/.test(c) ? "meals" : /software|saas|cloud/.test(c) ? "software" : /laptop|hardware|electronic/.test(c) ? "electronics" : /office|supplies/.test(c) ? "office" : "other"; const amount = num(r.amount); return { id: uid(), date: r.date, who: r.employee || r.name || "", what: r.description || r.merchant || "", amount, cat, qty: ACTIVITY[cat] ? num(r.km || r.nights || r.quantity) || (cat === "hotel" ? 1 : 0) : amount }; }), ...exps])} /></Section>
      <style>{`.fn-bars{display:grid;gap:8px;margin-top:16px}.fn-row{display:grid;grid-template-columns:220px 1fr 80px;gap:10px;align-items:center;font-size:14px}.fn-track{height:12px;background:var(--sunk);border-radius:6px;overflow:hidden}.fn-track i{display:block;height:100%;background:var(--good)}@media(max-width:560px){.fn-row{grid-template-columns:1fr 70px}.fn-track{grid-column:1/-1}}`}</style>
    </div>
  );
}
