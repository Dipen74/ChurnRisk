import { useEffect, useRef, useState } from "react";

const API_URL = "http://127.0.0.1:8000/predict";

const DEFAULTS = {
  age: 35,
  gender: "Female",
  tenure: 12,
  usage_frequency: 15,
  support_calls: 3,
  payment_delay: 10,
  subscription_type: "Basic",
  contract_length: "Monthly",
  total_spend: 500,
  last_interaction: 15,
};

const PRESETS = [
  {
    name: "Unhappy profile",
    values: {
      age: 30, gender: "Female", tenure: 5, usage_frequency: 4,
      support_calls: 9, payment_delay: 25, subscription_type: "Basic",
      contract_length: "Monthly", total_spend: 300, last_interaction: 25,
    },
  },
  {
    name: "Loyal profile",
    values: {
      age: 45, gender: "Male", tenure: 48, usage_frequency: 25,
      support_calls: 1, payment_delay: 2, subscription_type: "Premium",
      contract_length: "Annual", total_spend: 850, last_interaction: 3,
    },
  },
  {
    name: "Borderline profile",
    values: {
      age: 45, gender: "Female", tenure: 21, usage_frequency: 26,
      support_calls: 4, payment_delay: 22, subscription_type: "Premium",
      contract_length: "Quarterly", total_spend: 628, last_interaction: 2,
    },
  },
];

const RISK_NOTE = {
  LOW: "This customer looks settled. Keep up the regular check-ins.",
  MEDIUM: "Some warning signs. A friendly check-in could help.",
  HIGH: "This customer is likely to leave. Act soon.",
};

const RISK_LABEL = { LOW: "Low risk", MEDIUM: "Medium risk", HIGH: "High risk" };

/* ---------- Small helpers ---------- */

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function polar(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)];
}

// Draws an arc on the top half of a circle, from fromPct to toPct (0 to 1)
function arcPath(cx, cy, r, fromPct, toPct) {
  const [x1, y1] = polar(cx, cy, r, 180 - fromPct * 180);
  const [x2, y2] = polar(cx, cy, r, 180 - toPct * 180);
  return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
}

// Turns "Payment Delay = 25 (> 14.5)" into something readable
function parseReason(text) {
  const m = text.match(/^(.+?) = (\S+) \((<=|>) (\S+)\)$/);
  if (!m) return { title: text, detail: "" };
  const [, name, rawValue, op, rawLimit] = m;
  const value = Number(rawValue);
  const limit = Number(rawLimit);
  if (name.includes("_") && limit === 0.5) {
    return {
      title: name.replace("_", ": "),
      detail: value > limit ? "Applies to this customer" : "Does not apply to this customer",
    };
  }
  return {
    title: name,
    detail: `${rawValue}, which is ${op === "<=" ? "at or below" : "above"} ${limit.toFixed(1)}`,
  };
}

// Simple advice based on the numbers entered (not produced by the model)
function getSuggestions(f) {
  const list = [];
  if (f.payment_delay > 14)
    list.push({ title: "Follow up on late payments", why: `Payments are ${f.payment_delay} days late.` });
  if (f.support_calls >= 6)
    list.push({ title: "Escalate to a senior support agent", why: `${f.support_calls} support calls suggest an unsolved problem.` });
  if (f.last_interaction > 20)
    list.push({ title: "Reach out this week", why: `There has been no contact for ${f.last_interaction} days.` });
  if (f.contract_length === "Monthly")
    list.push({ title: "Offer a discount for a longer contract", why: "Monthly customers can leave at any time." });
  if (f.usage_frequency < 8)
    list.push({ title: "Share tips to get more from the product", why: "Usage is low." });
  if (f.tenure < 12)
    list.push({ title: "Schedule an early check-in", why: "New customers are the most likely to leave." });
  return list.slice(0, 4);
}

/* ---------- Form pieces ---------- */

function SliderField({ label, name, min, max, unit, value, onChange }) {
  const id = `f-${name}`;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label} {unit && <span className="unit">({unit})</span>}
      </label>
      <div className="slider-row">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(name, Number(e.target.value))}
        />
        <input
          className="num"
          type="number"
          min={min}
          max={max}
          value={value}
          aria-label={`${label} value`}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isNaN(n)) onChange(name, clamp(n, min, max));
          }}
        />
      </div>
    </div>
  );
}

function SelectField({ label, name, options, value, onChange }) {
  const id = `f-${name}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className="select"
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

/* ---------- The gauge ---------- */

function Gauge({ probability, level }) {
  const pct = probability ?? 0;
  const angle = (pct - 1) * 180; // 0% points left, 100% points right
  const cx = 120;
  const cy = 120;
  const r = 90;
  const needleColor = level ? `var(--${level === "LOW" ? "low" : level === "MEDIUM" ? "mid" : "high"})` : "var(--muted)";

  return (
    <div className="gauge-wrap">
      <svg
        viewBox="0 0 240 140"
        role="img"
        aria-label={probability == null ? "Risk gauge, no result yet" : `Risk gauge showing ${Math.round(pct * 100)} percent`}
      >
        <path d={arcPath(cx, cy, r, 0, 0.3)} stroke="var(--low)" strokeWidth="16" fill="none" />
        <path d={arcPath(cx, cy, r, 0.3, 0.7)} stroke="var(--mid)" strokeWidth="16" fill="none" />
        <path d={arcPath(cx, cy, r, 0.7, 1)} stroke="var(--high)" strokeWidth="16" fill="none" />
        <g className="needle" style={{ transform: `rotate(${angle}deg)` }}>
          <line x1={cx} y1={cy} x2={cx + 76} y2={cy} stroke="var(--ink)" strokeWidth="4" strokeLinecap="round" />
        </g>
        <circle cx={cx} cy={cy} r="9" fill="var(--ink)" />
        <circle cx={cx} cy={cy} r="4" fill={needleColor} />
      </svg>
      <div className="gauge-ends">
        <span>0%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

/* ---------- Main app ---------- */

export default function App() {
  const [form, setForm] = useState(DEFAULTS);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ok | error
  const [retry, setRetry] = useState(0);
  const [saved, setSaved] = useState([]);
  const counter = useRef(1);

  function setField(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  // Ask the backend for a new prediction whenever the form changes
  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Bad response");
        const data = await res.json();
        setResult({ ...data, input: form });
        setStatus("ok");
      } catch (e) {
        if (e.name === "AbortError") return;
        setStatus("error");
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [form, retry]);

  function saveCurrent() {
    if (!result) return;
    const id = counter.current++;
    setSaved((list) =>
      [...list, {
        id,
        label: `Customer ${id}`,
        input: result.input,
        probability: result.probability,
        risk_level: result.risk_level,
      }].slice(-6)
    );
  }

  const activePreset = PRESETS.find(
    (p) => JSON.stringify(p.values) === JSON.stringify(form)
  );
  const suggestions = getSuggestions(form);
  const level = result?.risk_level;

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Customer churn risk</h1>
          <p>Change a customer profile and watch the risk update. Save profiles to compare them side by side.</p>
        </div>
        <span className={`status ${status}`} aria-live="polite">
          <i />
          {status === "ok" && "Connected to model"}
          {status === "loading" && "Calculating"}
          {status === "error" && "Backend offline"}
        </span>
      </header>

      <div className="grid">
        {/* ---------- Left: the form ---------- */}
        <section className="panel">
          <h2>Customer profile</h2>
          <p className="sub">Start from an example, then adjust the details.</p>

          <div className="presets">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                className={`chip ${activePreset?.name === p.name ? "active" : ""}`}
                onClick={() => setForm(p.values)}
              >
                {p.name}
              </button>
            ))}
          </div>

          <fieldset>
            <legend>Account</legend>
            <div className="fields">
              <SliderField label="Age" name="age" min={18} max={65} unit="years" value={form.age} onChange={setField} />
              <SelectField label="Gender" name="gender" options={["Female", "Male"]} value={form.gender} onChange={setField} />
              <SelectField label="Subscription" name="subscription_type" options={["Basic", "Standard", "Premium"]} value={form.subscription_type} onChange={setField} />
              <SelectField label="Contract length" name="contract_length" options={["Monthly", "Quarterly", "Annual"]} value={form.contract_length} onChange={setField} />
            </div>
          </fieldset>

          <fieldset>
            <legend>Activity</legend>
            <div className="fields">
              <SliderField label="Tenure" name="tenure" min={1} max={60} unit="months" value={form.tenure} onChange={setField} />
              <SliderField label="Usage frequency" name="usage_frequency" min={1} max={30} value={form.usage_frequency} onChange={setField} />
              <div className="field wide">
                <SliderField label="Days since last contact" name="last_interaction" min={1} max={30} unit="days" value={form.last_interaction} onChange={setField} />
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>Support and billing</legend>
            <div className="fields">
              <SliderField label="Support calls" name="support_calls" min={0} max={10} value={form.support_calls} onChange={setField} />
              <SliderField label="Payment delay" name="payment_delay" min={0} max={30} unit="days" value={form.payment_delay} onChange={setField} />
              <div className="field wide">
                <SliderField label="Total spend" name="total_spend" min={100} max={1000} value={form.total_spend} onChange={setField} />
              </div>
            </div>
          </fieldset>
        </section>

        {/* ---------- Right: the result ---------- */}
        <section className="panel sticky" aria-live="polite">
          <h2>Risk assessment</h2>
          <p className="sub">Updates automatically as you change the profile.</p>

          <Gauge probability={result?.probability} level={level} />

          <div className={`score ${status === "loading" ? "stale" : ""}`}>
            {result ? (
              <>
                <div className="pct">{Math.round(result.probability * 100)}%</div>
                <span className={`badge ${level}`}>{RISK_LABEL[level]}</span>
                <p className="note">{RISK_NOTE[level]}</p>
              </>
            ) : (
              status !== "error" && <p className="note">Calculating the first result...</p>
            )}
          </div>

          {status === "error" && (
            <div className="error-box" role="alert">
              The page cannot reach the backend. Open a terminal in the backend folder and run:
              <code>python -m uvicorn main:app --reload</code>
              <button type="button" className="btn small" onClick={() => setRetry((n) => n + 1)}>
                Try again
              </button>
            </div>
          )}

          {result && (
            <>
              <div className="section">
                <h3>Why the model says this</h3>
                <p className="sub">The rules it checked for this customer, in order.</p>
                <ol className="rules">
                  {result.reasons.map((r, i) => {
                    const p = parseReason(r);
                    return (
                      <li key={i}>
                        <span className="t">{p.title}</span>
                        {p.detail && <span className="d">{p.detail}</span>}
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div className="section">
                <h3>Suggested actions</h3>
                <p className="sub">Based on the numbers you entered, not on the model.</p>
                {suggestions.length > 0 ? (
                  <ul className="actions">
                    {suggestions.map((s) => (
                      <li key={s.title}>
                        <span className="t">{s.title}</span>
                        <span className="d">{s.why}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="empty">Nothing stands out. Keep the usual check-ins.</div>
                )}
              </div>

              <button
                type="button"
                className="btn block"
                onClick={saveCurrent}
                disabled={status !== "ok"}
              >
                Save to comparison
              </button>
            </>
          )}
        </section>
      </div>

      {/* ---------- Comparison table ---------- */}
      <section className="panel compare">
        <h2>Saved customers</h2>
        <p className="sub">Save up to six profiles to compare their risk.</p>

        {saved.length === 0 ? (
          <div className="empty">
            Nothing saved yet. Set up a profile and choose Save to comparison.
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Plan</th>
                  <th>Support and billing</th>
                  <th>Risk</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {saved.map((c) => (
                  <tr key={c.id}>
                    <td><b>{c.label}</b></td>
                    <td>{c.input.subscription_type}, {c.input.contract_length}</td>
                    <td>{c.input.support_calls} calls, {c.input.payment_delay} days late</td>
                    <td>
                      <span className={`badge ${c.risk_level}`}>{RISK_LABEL[c.risk_level]}</span>
                      {Math.round(c.probability * 100)}%
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="btn ghost" onClick={() => setForm(c.input)}>
                          Load
                        </button>
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => setSaved((list) => list.filter((x) => x.id !== c.id))}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}