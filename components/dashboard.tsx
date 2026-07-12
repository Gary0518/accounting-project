// 純呈現元件（Server Component 即可）。圖表以 HTML/CSS 繪製：
// 細長色塊、4px 圓角、緊貼基線、直接標值，符合 data-viz 規範且零額外套件。
import { ntd, num, pct, type RankRow, type RoomTypeRow } from "@/lib/domain";

// ---------- KPI 數字磚 ----------
export function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
  hero = false,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "good" | "critical";
  hero?: boolean;
}) {
  const color =
    tone === "good"
      ? "var(--good-text)"
      : tone === "critical"
        ? "var(--critical)"
        : "var(--text-primary)";
  return (
    <div className="card p-4 flex flex-col gap-1">
      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>
      <span
        className="tabular font-bold leading-tight"
        style={{ color, fontSize: hero ? "2rem" : "1.4rem" }}
      >
        {value}
      </span>
      {sub && (
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {sub}
        </span>
      )}
    </div>
  );
}

// ---------- 水平長條榜（通路 / 支出 通用）----------
export function BarList({
  title,
  rows,
  emptyText = "本月尚無資料",
}: {
  title: string;
  rows: RankRow[];
  emptyText?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <section className="card p-5">
      <h2 className="font-semibold mb-4">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {emptyText}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.name}>
              <div className="flex justify-between items-baseline text-sm mb-1">
                <span className="truncate" title={r.name}>
                  {r.name}
                  <span
                    className="ml-2 text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {r.count} 筆
                  </span>
                </span>
                <span className="tabular" style={{ color: "var(--text-secondary)" }}>
                  {ntd(r.total)}
                  <span className="ml-2" style={{ color: "var(--text-muted)" }}>
                    {pct(r.share)}
                  </span>
                </span>
              </div>
              <div
                className="w-full h-2.5 rounded-full overflow-hidden"
                style={{ background: "var(--bar-track)" }}
                role="img"
                aria-label={`${r.name} ${pct(r.share)}`}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(r.total / max) * 100}%`,
                    background: "var(--series-1)",
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- 圓餅圖（甜甜圈）：各收款方式比例 ----------
export function Donut({
  title,
  rows,
  emptyText = "本月尚無資料",
}: {
  title: string;
  rows: RankRow[];
  emptyText?: string;
}) {
  const total = rows.reduce((a, b) => a + b.total, 0);
  // r 設為 15.915 → 圓周長 ≈ 100，dasharray 可直接用百分比
  let cumulative = 0;
  const segs = rows.map((r, i) => {
    const len = total ? (r.total / total) * 100 : 0;
    const seg = { i, len, offset: 25 - cumulative }; // offset 25 = 從 12 點鐘開始
    cumulative += len;
    return seg;
  });

  return (
    <section className="card p-5">
      <h2 className="font-semibold mb-4">{title}</h2>
      {total === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {emptyText}
        </p>
      ) : (
        <div className="flex items-center gap-5 flex-wrap">
          <svg
            viewBox="0 0 42 42"
            style={{ width: 132, height: 132 }}
            className="shrink-0"
            role="img"
            aria-label={title}
          >
            <circle
              cx="21" cy="21" r="15.915"
              fill="none" stroke="var(--bar-track)" strokeWidth="5"
            />
            {segs.map((s) => (
              <circle
                key={s.i}
                cx="21" cy="21" r="15.915" fill="none"
                stroke={`var(--cat-${(s.i % 8) + 1})`}
                strokeWidth="5"
                strokeDasharray={`${s.len} ${100 - s.len}`}
                strokeDashoffset={s.offset}
              />
            ))}
          </svg>
          <ul className="flex-1 min-w-[170px] flex flex-col gap-2 text-sm">
            {rows.map((r, i) => (
              <li key={r.name} className="flex items-center gap-2">
                <span
                  className="shrink-0 inline-block"
                  style={{
                    width: 10, height: 10, borderRadius: 2,
                    background: `var(--cat-${(i % 8) + 1})`,
                  }}
                />
                <span className="truncate flex-1" title={r.name}>
                  {r.name}
                </span>
                <span className="tabular" style={{ color: "var(--text-secondary)" }}>
                  {ntd(r.total)}
                </span>
                <span
                  className="tabular w-12 text-right"
                  style={{ color: "var(--text-muted)" }}
                >
                  {pct(total ? r.total / total : 0)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ---------- 房型間數統計 ----------
export function RoomTypeTable({ rows }: { rows: RoomTypeRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.roomNights));
  return (
    <section className="card p-5">
      <h2 className="font-semibold mb-4">房型間數統計</h2>
      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          本月尚無住宿資料
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.name}>
              <div className="flex justify-between items-baseline text-sm mb-1">
                <span>{r.name}</span>
                <span className="tabular" style={{ color: "var(--text-secondary)" }}>
                  {num(r.roomNights)} 間
                  <span className="ml-2" style={{ color: "var(--text-muted)" }}>
                    {r.bookings} 筆 · {pct(r.share)}
                  </span>
                </span>
              </div>
              <div
                className="w-full h-2.5 rounded-full overflow-hidden"
                style={{ background: "var(--bar-track)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(r.roomNights / max) * 100}%`,
                    background: "var(--series-1)",
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- 通用分歧長條（正綠 / 負紅，以零為基線；標籤自訂）----------
export function DivergingBars({
  title,
  note,
  rows,
  emptyText = "本期間尚無資料",
}: {
  title: string;
  note?: string;
  rows: { label: string; value: number }[];
  emptyText?: string;
}) {
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <section className="card p-5">
      <h2 className="font-semibold">{title}</h2>
      {note && (
        <p className="text-xs mt-1 mb-3" style={{ color: "var(--text-muted)" }}>
          {note}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-sm mt-3" style={{ color: "var(--text-muted)" }}>
          {emptyText}
        </p>
      ) : (
        <ul className={`flex flex-col gap-2 ${note ? "" : "mt-4"}`}>
          {rows.map((r) => {
            const w = (Math.abs(r.value) / maxAbs) * 50;
            const neg = r.value < 0;
            return (
              <li key={r.label} className="flex items-center gap-2 text-sm">
                <span
                  className="w-28 shrink-0 truncate text-xs"
                  style={{ color: "var(--text-muted)" }}
                  title={r.label}
                >
                  {r.label}
                </span>
                <div className="flex-1 flex justify-end h-4">
                  {neg && (
                    <div
                      className="h-full rounded-l"
                      style={{ width: `${w}%`, background: "var(--critical)" }}
                    />
                  )}
                </div>
                <div className="w-px h-4 shrink-0" style={{ background: "var(--grid)" }} />
                <div className="flex-1 flex justify-start h-4">
                  {!neg && r.value > 0 && (
                    <div
                      className="h-full rounded-r"
                      style={{ width: `${w}%`, background: "var(--good)" }}
                    />
                  )}
                </div>
                <span
                  className="tabular w-24 shrink-0 text-right"
                  style={{ color: neg ? "var(--critical)" : "var(--good-text)" }}
                >
                  {r.value ? ntd(r.value) : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------- 年度各月損益（正綠 / 負紅，以零為基線的分歧長條）----------
export function MonthlyPnl({
  data,
}: {
  data: { month: number; profit: number }[];
}) {
  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.profit)));
  return (
    <section className="card p-5">
      <h2 className="font-semibold mb-4">年度各月損益</h2>
      <ul className="flex flex-col gap-2">
        {data.map((d) => {
          const w = (Math.abs(d.profit) / maxAbs) * 50; // 半邊最大 50%
          const isNeg = d.profit < 0;
          return (
            <li key={d.month} className="flex items-center gap-2 text-sm">
              <span
                className="w-8 shrink-0 text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                {d.month} 月
              </span>
              {/* 左半：負值 */}
              <div className="flex-1 flex justify-end h-4">
                {isNeg && (
                  <div
                    className="h-full rounded-l"
                    style={{ width: `${w}%`, background: "var(--critical)" }}
                  />
                )}
              </div>
              <div
                className="w-px h-4 shrink-0"
                style={{ background: "var(--grid)" }}
              />
              {/* 右半：正值 */}
              <div className="flex-1 flex justify-start h-4">
                {!isNeg && d.profit > 0 && (
                  <div
                    className="h-full rounded-r"
                    style={{ width: `${w}%`, background: "var(--good)" }}
                  />
                )}
              </div>
              <span
                className="tabular w-24 shrink-0 text-right"
                style={{ color: isNeg ? "var(--critical)" : "var(--good-text)" }}
              >
                {d.profit ? ntd(d.profit) : "—"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
