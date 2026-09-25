"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type Period = "daily" | "weekly" | "monthly"

interface RankBreakdown { key: string; label: string; total: number; passed: number; pending_approval: number }
interface TrendPoint    { label: string; value: number }

interface SummaryData {
  generated_at:    string
  period:          Period
  total:           number
  enrolled:        number
  passed:          number
  not_passed:      number
  pending_approval: number
  no_requirements: number
  has_requirements: boolean
  percent_enrolled: number
  percent_passed:   number
  percent_pending_approval: number
  new_today:  number
  new_week:   number
  new_month:  number
  rank_class_breakdown: RankBreakdown[]
  trend: TrendPoint[]
}

const PERIOD_LABELS: Record<Period, string> = {
  daily:   "รายวัน",
  weekly:  "รายสัปดาห์",
  monthly: "รายเดือน",
}

// ── Sparkbar chart ────────────────────────────────────────────────────
function TrendChart({ data, period }: { data: TrendPoint[]; period: Period }) {
  if (!data.length) return (
    <div className="h-32 flex items-center justify-center text-sm text-[var(--text-muted)]">
      ไม่มีข้อมูลในช่วงนี้
    </div>
  )

  const max = Math.max(...data.map((d) => d.value), 1)
  const showEvery = data.length > 14 ? Math.ceil(data.length / 10) : 1

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-px h-28" aria-label="กราฟแนวโน้ม">
        {data.map((d, i) => {
          const pct = (d.value / max) * 100
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end group relative">
              <div
                className="w-full rounded-sm transition-all duration-200 group-hover:opacity-90"
                style={{
                  height: `${Math.max(pct, 2)}%`,
                  background: d.value > 0
                    ? "linear-gradient(180deg, var(--bar-top) 0%, var(--bar-bot) 100%)"
                    : "var(--bar-empty)",
                }}
              />
              {/* tooltip */}
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block
                              bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1
                              text-xs text-[var(--text-primary)] whitespace-nowrap shadow-md z-10 pointer-events-none">
                <span className="font-semibold">{d.value.toLocaleString()}</span>
                <span className="text-[var(--text-muted)] ml-1">คน</span>
                <br/>
                <span className="text-[var(--text-muted)]">{d.label}</span>
              </div>
            </div>
          )
        })}
      </div>
      {/* X-axis labels */}
      <div className="flex gap-px">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center overflow-hidden">
            {i % showEvery === 0 && (
              <span className="text-[10px] text-[var(--text-muted)] block truncate">{d.label}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Donut progress ring ───────────────────────────────────────────────
function Ring({ pct, color, size = 72 }: { pct: number; color: string; size?: number }) {
  const r  = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ

  return (
    <svg width={size} height={size} className="rotate-[-90deg]" aria-hidden="true">
      <circle cx={size/2} cy={size/2} r={r} fill="none"
              strokeWidth="7" stroke="var(--ring-track)" />
      <circle cx={size/2} cy={size/2} r={r} fill="none"
              strokeWidth="7" stroke={color}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeLinecap="round"
              style={{ transition: "stroke-dasharray 0.6s ease" }} />
    </svg>
  )
}

// ── KPI tile ──────────────────────────────────────────────────────────
function Tile({
  label, value, sub, pct, color, ring,
}: {
  label: string; value: string | number; sub?: string
  pct?: number; color?: string; ring?: boolean
}) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <div className="tile-body">
        {ring && pct !== undefined && color ? (
          <div className="relative inline-flex items-center justify-center">
            <Ring pct={pct} color={color} />
            <span className="absolute text-sm font-bold tabular-nums" style={{ color }}>
              {pct}%
            </span>
          </div>
        ) : null}
        <div>
          <span className="tile-value tabular-nums">{typeof value === "number" ? value.toLocaleString() : value}</span>
          {sub && <span className="tile-sub">{sub}</span>}
        </div>
      </div>
      {pct !== undefined && !ring && color ? (
        <div className="mt-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-[var(--text-muted)]">ร้อยละ</span>
            <span className="font-semibold tabular-nums" style={{ color }}>{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--ring-track)] overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
                 style={{ width: `${pct}%`, background: color }} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────
export default function SummaryReportPage() {
  const [period,  setPeriod]  = useState<Period>("daily")
  const [data,    setData]    = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState("")
  const printRef = useRef<HTMLDivElement>(null)

  const load = useCallback((p: Period) => {
    setLoading(true)
    setError("")
    fetch(`/military/api/v1/reports/summary/?period=${p}`, { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error("โหลดข้อมูลไม่สำเร็จ"); return r.json() })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(period) }, [period, load])

  function handlePeriod(p: Period) { setPeriod(p); load(p) }

  function handlePrint() { window.print() }

  if (loading) return (
    <div className="report-root">
      <div className="skeleton-grid">
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton" />)}
      </div>
    </div>
  )

  if (error) return (
    <div className="report-root">
      <div className="error-box">{error}</div>
    </div>
  )

  if (!data) return null

  const enrollPct  = data.percent_enrolled
  const passedPct  = data.percent_passed
  const notPassPct = data.total ? Math.round(data.not_passed / data.total * 100) : 0
  const pendingApprovalPct = data.percent_pending_approval

  return (
    <>
      <style>{CSS}</style>
      <div className="report-root" ref={printRef}>

        {/* Header */}
        <div className="report-header no-print">
          <div>
            <h1 className="report-title">สรุปสถานะกำลังพลในระบบ</h1>
            <p className="report-subtitle">ข้อมูล ณ วันที่ {data.generated_at} — สำหรับรายงาน ทบ.</p>
          </div>
          <div className="header-actions">
            <button onClick={handlePrint} className="btn-print">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4 4V2h8v2M4 12H2V7h12v5h-2M4 9h8M4 12v2h8v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              พิมพ์รายงาน
            </button>
          </div>
        </div>

        {/* Print header */}
        <div className="print-only print-header">
          <div className="print-title">รายงานสรุปสถานะกำลังพล — ระบบการฝึกอบรม กองทัพบก</div>
          <div className="print-meta">ข้อมูล ณ วันที่ {data.generated_at} | ระยะ: {PERIOD_LABELS[data.period]}</div>
        </div>

        {/* Period selector */}
        <div className="period-bar no-print">
          <span className="period-label">ช่วงเวลา</span>
          <div className="period-btns">
            {(["daily","weekly","monthly"] as Period[]).map((p) => (
              <button key={p} onClick={() => handlePeriod(p)}
                      className={`period-btn ${period === p ? "active" : ""}`}>
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        {/* KPI tiles */}
        <div className="tiles-grid">
          <Tile label="กำลังพลในระบบทั้งหมด" value={data.total}
                sub={`เพิ่มใหม่เดือนนี้ +${data.new_month.toLocaleString()}`} />
          <Tile label="ลงทะเบียนเรียนแล้ว" value={data.enrolled}
                pct={enrollPct} color="var(--c-blue)" />
          <Tile label="ผ่านมาตรฐานแล้ว" value={data.passed}
                pct={passedPct} color="var(--c-green)" ring />
          <Tile label="สอบผ่าน รออนุมัติ" value={data.pending_approval}
                sub="รอ admin กด “อนุมัติทั้งหมด”" pct={pendingApprovalPct} color="var(--c-amber)" />
          <Tile label="ยังไม่ผ่านมาตรฐาน" value={data.not_passed}
                pct={notPassPct} color="var(--c-red)" />
        </div>

        {!data.has_requirements && (
          <div className="notice-box no-print">
            ยังไม่ได้กำหนดหลักสูตรมาตรฐาน — ตัวเลข "ผ่าน/ไม่ผ่าน" จะยังเป็น 0 จนกว่าจะกำหนดใน
            <a href="/dashboard/course-requirements" className="notice-link"> ⚙️ กำหนดมาตรฐาน</a>
          </div>
        )}

        {/* Trend + เพิ่มใหม่ summary */}
        <div className="section-grid">
          <div className="card">
            <div className="card-header">
              <span className="card-title">แนวโน้มการลงทะเบียน</span>
              <span className="card-badge">{PERIOD_LABELS[period]}</span>
            </div>
            <TrendChart data={data.trend} period={period} />
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">ผู้ลงทะเบียนใหม่</span>
            </div>
            <div className="new-stats">
              {[
                { label: "วันนี้",      value: data.new_today,  accent: "var(--c-blue)"  },
                { label: "สัปดาห์นี้",  value: data.new_week,   accent: "var(--accent)"  },
                { label: "เดือนนี้",    value: data.new_month,  accent: "var(--c-green)" },
              ].map((s) => (
                <div key={s.label} className="new-stat-row">
                  <span className="new-stat-label">{s.label}</span>
                  <span className="new-stat-value tabular-nums" style={{ color: s.accent }}>
                    {s.value.toLocaleString()} คน
                  </span>
                </div>
              ))}
            </div>

            <div className="card-divider" />

            <div className="card-header" style={{ marginTop: "0.5rem" }}>
              <span className="card-title">สัดส่วน no-requirement</span>
            </div>
            <div className="new-stat-row">
              <span className="new-stat-label">ยังไม่กำหนดเงื่อนไข</span>
              <span className="new-stat-value tabular-nums" style={{ color: "var(--c-amber)" }}>
                {data.no_requirements.toLocaleString()} คน
              </span>
            </div>
            <div className="mt-2">
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--ring-track)" }}>
                <div className="h-full rounded-full" style={{
                  width: `${data.total ? Math.round(data.no_requirements/data.total*100) : 0}%`,
                  background: "var(--c-amber)",
                  transition: "width 0.7s ease"
                }}/>
              </div>
              <p className="text-right text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                {data.total ? Math.round(data.no_requirements/data.total*100) : 0}% ของกำลังพลทั้งหมด
              </p>
            </div>
          </div>
        </div>

        {/* Rank class breakdown */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">สัดส่วนกำลังพลตามระดับชั้น</span>
          </div>
          <div className="breakdown-table-wrap">
            <table className="breakdown-table">
              <thead>
                <tr>
                  <th>ระดับชั้น</th>
                  <th className="num">จำนวน (คน)</th>
                  <th className="num">ร้อยละ</th>
                  <th className="bar-col">สัดส่วน</th>
                  <th className="num" style={{ color: "var(--c-green)" }}>ผ่านมาตรฐานแล้ว</th>
                  <th className="num" style={{ color: "var(--c-amber)" }}>สอบผ่าน รออนุมัติ</th>
                </tr>
              </thead>
              <tbody>
                {data.rank_class_breakdown.map((row) => {
                  const pct = data.total ? Math.round(row.total / data.total * 100) : 0
                  return (
                    <tr key={row.key}>
                      <td>
                        <span className="rc-chip">{row.label}</span>
                      </td>
                      <td className="num tabular-nums">{row.total.toLocaleString()}</td>
                      <td className="num tabular-nums">{pct}%</td>
                      <td className="bar-col">
                        <div className="bar-track">
                          <div className="bar-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td className="num tabular-nums" style={{ color: "var(--c-green)", fontWeight: 600 }}>
                        {row.passed.toLocaleString()}
                      </td>
                      <td className="num tabular-nums" style={{ color: "var(--c-amber)", fontWeight: 600 }}>
                        {row.pending_approval.toLocaleString()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td><strong>รวมทั้งหมด</strong></td>
                  <td className="num tabular-nums"><strong>{data.total.toLocaleString()}</strong></td>
                  <td className="num">100%</td>
                  <td />
                  <td className="num tabular-nums" style={{ color: "var(--c-green)" }}>
                    <strong>{data.passed.toLocaleString()}</strong>
                  </td>
                  <td className="num tabular-nums" style={{ color: "var(--c-amber)" }}>
                    <strong>{data.pending_approval.toLocaleString()}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Print footer */}
        <div className="print-only print-footer">
          จัดทำโดยระบบการฝึกอบรม กองทัพบก — Signal Standard Training Platform
        </div>

      </div>
    </>
  )
}

// ── Styles ────────────────────────────────────────────────────────────
const CSS = `
:root {
  --accent:      #4A1A6B;
  --accent-mid:  #7B3FA0;
  --c-green:     #059669;
  --c-red:       #DC2626;
  --c-blue:      #2563EB;
  --c-amber:     #D97706;
  --surface-1:   #FFFFFF;
  --surface-2:   #F7F5FA;
  --border:      #EDE9F5;
  --text-primary:#1A0A2E;
  --text-muted:  #8B7BAA;
  --ring-track:  #E9E4F4;
  --bar-top:     #7B3FA0;
  --bar-bot:     #4A1A6B;
  --bar-empty:   #E9E4F4;
}

@media (prefers-color-scheme: dark) {
  :root {
    --surface-1:  #1C1228;
    --surface-2:  #251533;
    --border:     #3B2560;
    --text-primary:#F0EBF8;
    --text-muted: #9B85C0;
    --ring-track: #3B2560;
    --bar-empty:  #3B2560;
  }
}
:root[data-theme="light"] {
  --surface-1:   #FFFFFF;
  --surface-2:   #F7F5FA;
  --border:      #EDE9F5;
  --text-primary:#1A0A2E;
  --text-muted:  #8B7BAA;
  --ring-track:  #E9E4F4;
  --bar-empty:   #E9E4F4;
}
:root[data-theme="dark"] {
  --surface-1:  #1C1228;
  --surface-2:  #251533;
  --border:     #3B2560;
  --text-primary:#F0EBF8;
  --text-muted: #9B85C0;
  --ring-track: #3B2560;
  --bar-empty:  #3B2560;
}

.report-root {
  max-width: 1100px;
  margin: 0 auto;
  padding: 1.5rem 1.25rem 3rem;
  color: var(--text-primary);
  font-family: 'Sarabun', 'Noto Sans Thai', system-ui, sans-serif;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.report-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}
.report-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--accent);
  text-wrap: balance;
  margin: 0;
}
.report-subtitle {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin: 0.2rem 0 0;
}
.header-actions { display: flex; gap: 0.5rem; align-items: center; }
.btn-print {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.45rem 1rem;
  font-size: 0.8rem; font-weight: 500;
  background: var(--accent); color: #fff;
  border: none; border-radius: 8px; cursor: pointer;
  transition: background 0.15s;
}
.btn-print:hover { background: #2D0F42; }

.period-bar {
  display: flex; align-items: center; gap: 0.75rem;
}
.period-label { font-size: 0.75rem; color: var(--text-muted); white-space: nowrap; }
.period-btns  { display: flex; gap: 0.25rem; }
.period-btn {
  padding: 0.35rem 0.9rem;
  font-size: 0.8rem; font-weight: 500;
  border: 1.5px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}
.period-btn.active,
.period-btn:hover {
  background: var(--accent); color: #fff; border-color: var(--accent);
}

.tiles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}
.tile {
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.1rem 1.25rem;
}
.tile-label {
  display: block;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 0.6rem;
}
.tile-body { display: flex; align-items: center; gap: 0.75rem; }
.tile-value {
  display: block;
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.1;
}
.tile-sub {
  display: block;
  font-size: 0.72rem;
  color: var(--text-muted);
  margin-top: 0.15rem;
}

.notice-box {
  background: #FFF8E1;
  border: 1px solid #FFD54F;
  border-radius: 8px;
  padding: 0.7rem 1rem;
  font-size: 0.82rem;
  color: #7B5800;
}
.notice-link { color: var(--accent); text-decoration: underline; }

.section-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
@media (max-width: 680px) { .section-grid { grid-template-columns: 1fr; } }

.card {
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.1rem 1.25rem;
}
.card-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 0.9rem; gap: 0.5rem;
}
.card-title { font-size: 0.875rem; font-weight: 600; color: var(--text-primary); }
.card-badge {
  font-size: 0.68rem; font-weight: 600; letter-spacing: 0.04em;
  text-transform: uppercase; color: var(--accent-mid);
  background: var(--ring-track); padding: 0.2rem 0.55rem; border-radius: 999px;
}
.card-divider {
  height: 1px; background: var(--border);
  margin: 0.9rem -1.25rem; width: calc(100% + 2.5rem);
}

.new-stats { display: flex; flex-direction: column; gap: 0.5rem; }
.new-stat-row { display: flex; justify-content: space-between; align-items: center; }
.new-stat-label { font-size: 0.82rem; color: var(--text-muted); }
.new-stat-value { font-size: 1rem; font-weight: 700; }

.breakdown-table-wrap { overflow-x: auto; }
.breakdown-table {
  width: 100%; border-collapse: collapse;
  font-size: 0.82rem; color: var(--text-primary);
}
.breakdown-table th {
  text-align: left; font-size: 0.68rem; font-weight: 600;
  letter-spacing: 0.05em; text-transform: uppercase;
  color: var(--text-muted); padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border);
}
.breakdown-table th.num,
.breakdown-table td.num { text-align: right; }
.breakdown-table td { padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--border); }
.breakdown-table tbody tr:last-child td { border-bottom: none; }
.breakdown-table tfoot td {
  padding: 0.6rem 0.75rem;
  border-top: 1.5px solid var(--border);
  font-size: 0.82rem;
}
.rc-chip {
  display: inline-block;
  background: var(--ring-track);
  color: var(--accent);
  font-size: 0.72rem; font-weight: 600;
  padding: 0.15rem 0.55rem; border-radius: 999px;
}
.bar-col { width: 160px; }
.bar-track {
  height: 6px; border-radius: 999px;
  background: var(--ring-track); overflow: hidden;
}
.bar-fill {
  height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, var(--bar-top), var(--bar-bot));
  transition: width 0.7s ease;
}

.skeleton-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 1rem; }
.skeleton {
  height: 110px; border-radius: 12px;
  background: linear-gradient(90deg, var(--surface-2) 25%, var(--border) 50%, var(--surface-2) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}
@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

.error-box {
  background: #FEE2E2; border: 1px solid #FCA5A5;
  border-radius: 8px; padding: 1rem; color: #991B1B; font-size: 0.875rem;
}

/* Print styles */
.print-only { display: none; }

@media print {
  @page { size: A4 portrait; margin: 12mm 10mm; }

  * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }

  .no-print  { display: none !important; }
  .print-only { display: block; }

  body { background: #fff !important; font-size: 11px; }
  .report-root { padding: 0; gap: 0.6rem; max-width: 100%; }

  .tiles-grid { grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
  .tile { padding: 0.6rem 0.7rem; }
  .tile-value { font-size: 1.15rem !important; }

  .section-grid { grid-template-columns: 1fr 1fr; gap: 0.6rem; }
  .card { padding: 0.75rem; }
  .card, .tile { border: 1px solid #ddd !important; box-shadow: none !important; break-inside: avoid; }

  .breakdown-table { font-size: 10px; }
  .breakdown-table th, .breakdown-table td { padding: 0.35rem 0.5rem; }

  .period-bar, .header-actions { display: none; }

  .print-header {
    margin-bottom: 0.6rem; padding-bottom: 0.5rem;
    border-bottom: 2px solid #2D1B69;
    display: flex; align-items: baseline; justify-content: space-between;
  }
  .print-title { font-size: 1.05rem; font-weight: 700; color: #2D1B69; }
  .print-meta  { font-size: 0.72rem; color: #666; }

  .print-footer {
    margin-top: 0.8rem;
    text-align: center;
    font-size: 0.65rem;
    color: #888;
    border-top: 1px solid #ddd;
    padding-top: 0.4rem;
  }

  /* กันตารางหรือการ์ดถูกตัดครึ่งข้ามหน้ากระดาษ */
  table, tr, .card { break-inside: avoid; }
}
`
