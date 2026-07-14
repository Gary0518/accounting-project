"use client";

import { useState } from "react";
import { commitImport, previewImport } from "@/app/actions";
import { ntd } from "@/lib/domain";
import type { ImportPreview } from "@/lib/import-excel";

interface Property {
  id: number;
  name: string;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : "發生未知的錯誤");

/**
 * 設定 → 匯入舊資料。
 * 兩段式：先解析出預覽（不寫入任何東西），確認過對應關係與警告之後才真的寫進去。
 */
export default function ImportOldData({ properties }: { properties: Property[] }) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [propertyId, setPropertyId] = useState<number>(properties[0]?.id ?? 0);
  const [sheets, setSheets] = useState<Set<string>>(new Set());
  const [handlerMap, setHandlerMap] = useState<Record<string, string>>({});
  const [addOptions, setAddOptions] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  async function onPreview(fd: FormData) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const p = await previewImport(fd);
      setPreview(p);
      setSheets(new Set(p.sheets.filter((s) => s.ledger).map((s) => s.name)));
      setHandlerMap(Object.fromEntries(p.handlers.map((h) => [h, ""])));
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  async function onCommit() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const n = await commitImport({
        propertyId,
        sheets: [...sheets],
        rows: preview.rows,
        handlerMap,
        addOptions,
      });
      setDone(n);
      setPreview(null);
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  const chosen = preview?.rows.filter((r) => sheets.has(r.sheet)) ?? [];
  const income = chosen.filter((r) => r.direction === "income");
  const expense = chosen.filter((r) => r.direction === "expense");
  const sum = (xs: { amount: number }[]) => xs.reduce((a, b) => a + b.amount, 0);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        匯入老闆那種「一個月一張工作表」的 Excel（.xlsx）。系統會自己找出哪幾張是帳目、
        哪幾張不是，你可以在預覽時再決定要匯入哪幾個月。
        <strong>按下「確認匯入」之前不會寫入任何東西。</strong>
      </p>

      {error && (
        <div
          className="card p-4 text-sm"
          style={{ borderColor: "var(--danger, #dc2626)", color: "var(--danger, #dc2626)" }}
        >
          {error}
        </div>
      )}

      {done !== null && (
        <div className="card p-4 text-sm">
          ✅ 已匯入 <strong>{done}</strong> 筆帳目。到「營業數據」或「金流數據」把期間切到那幾個月就看得到了。
        </div>
      )}

      {/* ---------- 第一步：選民宿 + 選檔 ---------- */}
      {!preview && (
        <form action={onPreview} className="card p-5 flex flex-col gap-4">
          <div style={{ maxWidth: 260 }}>
            <label className="label">匯入到哪一間民宿</label>
            <select
              name="property_id"
              className="field"
              value={propertyId}
              onChange={(e) => setPropertyId(Number(e.target.value))}
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Excel 檔案</label>
            <input
              type="file"
              name="file"
              required
              accept=".xlsx"
              className="field"
              style={{ maxWidth: 420 }}
            />
          </div>

          <button type="submit" disabled={busy} className="btn btn-primary self-start text-sm">
            {busy ? "解析中…" : "解析並預覽"}
          </button>
        </form>
      )}

      {/* ---------- 第二步：預覽 ---------- */}
      {preview && (
        <>
          <section className="card p-5 flex flex-col gap-3">
            <h3 className="font-semibold">要匯入哪幾張工作表</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
                    <th className="p-2 font-medium">工作表</th>
                    <th className="p-2 font-medium">期間</th>
                    <th className="p-2 font-medium text-right">筆數</th>
                    <th className="p-2 font-medium text-right">收入</th>
                    <th className="p-2 font-medium text-right">支出</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sheets.map((s) => (
                    <tr key={s.name} style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="p-2">
                        {s.ledger ? (
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={sheets.has(s.name)}
                              onChange={(e) => {
                                const next = new Set(sheets);
                                if (e.target.checked) next.add(s.name);
                                else next.delete(s.name);
                                setSheets(next);
                              }}
                            />
                            <span>{s.name}</span>
                          </label>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>
                            {s.name}（不是帳目，略過）
                          </span>
                        )}
                      </td>
                      <td className="p-2" style={{ color: "var(--text-secondary)" }}>
                        {s.minDate ? `${s.minDate} ~ ${s.maxDate}` : "—"}
                      </td>
                      <td className="p-2 text-right">{s.ledger ? s.rows : "—"}</td>
                      <td className="p-2 text-right">{s.ledger ? ntd(s.income) : "—"}</td>
                      <td className="p-2 text-right">{s.ledger ? ntd(s.expense) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              支出不含清潔費——清潔費是系統自動算的，匯入會變成重複記帳，所以那幾列會跳過。
            </p>
          </section>

          {/* 經手人對應 */}
          {preview.handlers.length > 0 && (
            <section className="card p-5 flex flex-col gap-3">
              <div>
                <h3 className="font-semibold">經手人對應</h3>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  Excel 用的是簡稱，系統用的是「設定 → 管理權限」裡填的中文名字。
                  對應到誰，圓餅圖就會把這些舊帳算給誰；留空就不指定經手人。
                </p>
              </div>
              {preview.handlers.map((h) => (
                <div key={h} className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm" style={{ minWidth: 60 }}>
                    「{h}」→
                  </span>
                  <select
                    className="field"
                    style={{ maxWidth: 220 }}
                    value={handlerMap[h] ?? ""}
                    onChange={(e) => setHandlerMap({ ...handlerMap, [h]: e.target.value })}
                  >
                    <option value="">（留空）</option>
                    {preview.profiles.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {preview.rows.filter((r) => r.handler === h && sheets.has(r.sheet)).length} 筆
                  </span>
                </div>
              ))}
            </section>
          )}

          {/* 新項目 */}
          {(preview.newChannels.length > 0 ||
            preview.newRoomTypes.length > 0 ||
            preview.newCategories.length > 0) && (
            <section className="card p-5 flex flex-col gap-3">
              <div>
                <h3 className="font-semibold">Excel 裡有、下拉選單裡沒有的項目</h3>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  這些值不管勾不勾都會照原樣存進帳目、報表也算得到；
                  勾了只是順便把它們加進「帳目輸入」頁的下拉選單，之後手動記帳時選得到。
                </p>
              </div>
              <ul className="text-sm flex flex-col gap-1">
                {preview.newChannels.map((c) => (
                  <li key={`ch-${c}`}>
                    <span style={{ color: "var(--text-muted)" }}>通路：</span> {c}
                  </li>
                ))}
                {preview.newRoomTypes.map((c) => (
                  <li key={`rt-${c}`}>
                    <span style={{ color: "var(--text-muted)" }}>房型：</span> {c}
                  </li>
                ))}
                {preview.newCategories.map((c) => (
                  <li key={`ct-${c.name}-${c.direction}`}>
                    <span style={{ color: "var(--text-muted)" }}>
                      {c.direction === "income" ? "收入來源" : "支出科目"}：
                    </span>{" "}
                    {c.name}
                  </li>
                ))}
              </ul>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={addOptions}
                  onChange={(e) => setAddOptions(e.target.checked)}
                />
                <span>一併加進下拉選單</span>
              </label>
            </section>
          )}

          {/* 要注意的事 */}
          {(preview.existing || preview.refunds > 0 || preview.skipped.length > 0) && (
            <section className="card p-5 flex flex-col gap-3">
              <h3 className="font-semibold">匯入前請確認</h3>
              <ul className="text-sm flex flex-col gap-2">
                {preview.existing && (
                  <li>
                    ⚠️ <strong>這間民宿在 {preview.existing.start} ~ {preview.existing.end} 已經有
                    {preview.existing.count} 筆帳目了。</strong>
                    照樣匯入不會蓋掉舊的，而是<strong>再多記一份</strong>，營收會變成兩倍。
                    如果之前已經匯過，請先到帳目列表把舊的刪掉。
                  </li>
                )}
                {preview.refunds > 0 && (
                  <li>
                    老闆把退款記成「支出」而不是沖銷收入（例如「1600 收退 300」），
                    共 {preview.refunds} 筆會變成科目是「住宿費」的<strong>支出</strong>。
                    損益算出來跟他的表一樣，只是支出結構圖上會多一塊「住宿費」。
                  </li>
                )}
                {preview.skipped.length > 0 && (
                  <li>
                    略過 {preview.skipped.length} 列：
                    <span style={{ color: "var(--text-muted)" }}>
                      {" "}
                      {preview.skipped
                        .slice(0, 5)
                        .map((s) => `${s.sheet} 第 ${s.excelRow} 列（${s.reason}）`)
                        .join("、")}
                      {preview.skipped.length > 5 && ` …等 ${preview.skipped.length} 列`}
                    </span>
                  </li>
                )}
              </ul>
            </section>
          )}

          {/* 送出 */}
          <section className="card p-5 flex flex-col gap-3">
            <div className="text-sm">
              即將寫入 <strong>{chosen.length}</strong> 筆：
              收入 {income.length} 筆 {ntd(sum(income))}、 支出 {expense.length} 筆{" "}
              {ntd(sum(expense))}。
              <span style={{ color: "var(--text-muted)" }}>（收款方式一律留空。）</span>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onCommit}
                disabled={busy || chosen.length === 0}
                className="btn btn-primary text-sm"
              >
                {busy ? "匯入中…" : `確認匯入 ${chosen.length} 筆`}
              </button>
              <button
                type="button"
                onClick={() => setPreview(null)}
                disabled={busy}
                className="btn text-sm"
              >
                取消
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
