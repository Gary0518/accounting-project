"use client";

import { useState } from "react";

export type Caps = { i: boolean; o: boolean; c: boolean };

const CAP_KEYS = ["i", "o", "c"] as const;
type CapKey = (typeof CAP_KEYS)[number];

// checkbox 的 name 前綴要跟 updateUserAccess 解析表單時用的一致
const CAP_FIELD: Record<CapKey, string> = { i: "input", o: "operations", c: "cashflow" };
const CAP_LABEL: Record<CapKey, string> = { i: "輸入帳目", o: "營業數據", c: "金流數據" };

// 全選區域跟資料格之間的分隔線
const DIVIDER = "1px solid var(--text-primary)";

/**
 * 一位使用者的權限卡片：管理員勾選、中文名字、以及民宿×功能的權限表格。
 * 勾管理員時會把整張表也勾滿（管理員本來就能看全部，勾滿比較好懂）。
 * 表格每欄、每列、右上角各有一個全選；全選 checkbox 沒有 name，不進表單，只在前端代勾。
 */
export default function UserAccessCard({
  user,
  properties,
  initial,
}: {
  user: { id: string; email: string | null; display_name: string | null; is_admin: boolean };
  properties: { id: number; name: string }[];
  initial: Record<number, Caps>;
}) {
  const [isAdmin, setIsAdmin] = useState(user.is_admin);
  const [caps, setCaps] = useState<Record<number, Caps>>(() => {
    const m: Record<number, Caps> = {};
    for (const p of properties) m[p.id] = initial[p.id] ?? { i: false, o: false, c: false };
    return m;
  });

  const colState = (k: CapKey) => {
    const on = properties.filter((p) => caps[p.id][k]).length;
    return { all: on === properties.length && on > 0, some: on > 0 };
  };
  const rowState = (id: number) => {
    const on = CAP_KEYS.filter((k) => caps[id][k]).length;
    return { all: on === CAP_KEYS.length, some: on > 0 };
  };
  const totalOn = properties.reduce(
    (n, p) => n + CAP_KEYS.filter((k) => caps[p.id][k]).length,
    0
  );
  const totalAll = properties.length > 0 && totalOn === properties.length * CAP_KEYS.length;

  const setCol = (k: CapKey, v: boolean) =>
    setCaps((prev) => {
      const next = { ...prev };
      for (const p of properties) next[p.id] = { ...next[p.id], [k]: v };
      return next;
    });
  const setRow = (id: number, v: boolean) =>
    setCaps((prev) => ({ ...prev, [id]: { i: v, o: v, c: v } }));
  const fillAll = (v: boolean) => {
    const next: Record<number, Caps> = {};
    for (const p of properties) next[p.id] = { i: v, o: v, c: v };
    setCaps(next);
  };

  const onAdminChange = (v: boolean) => {
    setIsAdmin(v);
    if (v) fillAll(true); // 勾管理員＝看全部，表格也一起勾滿
  };

  return (
    <>
      <input type="hidden" name="user_id" value={user.id} />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="font-semibold">{user.display_name || user.email || user.id}</div>
          {user.email && (
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              {user.email}
            </div>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="is_admin"
            checked={isAdmin}
            onChange={(e) => onAdminChange(e.target.checked)}
          />
          <span className="font-medium">管理員（看全部＋改設定）</span>
        </label>
      </div>

      <div>
        <label className="label">中文名字（會顯示為帳目的經手人）</label>
        <input
          type="text"
          name="display_name"
          defaultValue={user.display_name ?? ""}
          placeholder="例：陳怡安"
          className="field"
          style={{ maxWidth: 260 }}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
              <th className="p-2 font-medium">民宿</th>
              {CAP_KEYS.map((k) => {
                const s = colState(k);
                return (
                  <th key={k} className="p-2 font-medium text-center">
                    <div className="flex flex-col items-center gap-1">
                      {CAP_LABEL[k]}
                      <SelectAll
                        checked={s.all}
                        indeterminate={!s.all && s.some}
                        onChange={(v) => setCol(k, v)}
                        title={`全部民宿的${CAP_LABEL[k]}`}
                      />
                    </div>
                  </th>
                );
              })}
              <th
                className="p-2 font-medium text-center"
                style={{ borderLeft: DIVIDER }}
              >
                <div className="flex flex-col items-center gap-1">
                  全選
                  <SelectAll
                    checked={totalAll}
                    indeterminate={!totalAll && totalOn > 0}
                    onChange={fillAll}
                    title="所有民宿的所有權限"
                  />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {properties.map((p, idx) => {
              const s = rowState(p.id);
              return (
                <tr
                  key={p.id}
                  style={{ borderTop: idx === 0 ? DIVIDER : "1px solid var(--border)" }}
                >
                  <td className="p-2">{p.name}</td>
                  {CAP_KEYS.map((k) => (
                    <td key={k} className="p-2 text-center">
                      <input
                        type="checkbox"
                        name={`${CAP_FIELD[k]}_${p.id}`}
                        checked={caps[p.id][k]}
                        onChange={(e) =>
                          setCaps((prev) => ({
                            ...prev,
                            [p.id]: { ...prev[p.id], [k]: e.target.checked },
                          }))
                        }
                      />
                    </td>
                  ))}
                  <td className="p-2 text-center" style={{ borderLeft: DIVIDER }}>
                    <SelectAll
                      checked={s.all}
                      indeterminate={!s.all && s.some}
                      onChange={(v) => setRow(p.id, v)}
                      title={`${p.name} 的全部權限`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SelectAll({
  checked,
  indeterminate,
  onChange,
  title,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (v: boolean) => void;
  title: string;
}) {
  return (
    <input
      type="checkbox"
      title={title}
      aria-label={title}
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate;
      }}
      onChange={(e) => onChange(e.target.checked)}
      style={
        indeterminate
          ? { accentColor: "#93c5fd", opacity: 0.6 } // 半勾＝淺藍＋更透，一眼看出不是全有全無
          : undefined
      }
    />
  );
}
