"use client";

import { useState } from "react";

export type Caps = { i: boolean; o: boolean; c: boolean };

const CAP_KEYS = ["i", "o", "c"] as const;
type CapKey = (typeof CAP_KEYS)[number];

// checkbox 的 name 前綴要跟 updateUserAccess 解析表單時用的一致
const CAP_FIELD: Record<CapKey, string> = { i: "input", o: "operations", c: "cashflow" };
const CAP_LABEL: Record<CapKey, string> = { i: "輸入帳目", o: "營業數據", c: "金流數據" };

/**
 * 管理權限的勾選表格：列＝民宿、欄＝功能。
 * 每欄表頭、每列尾端各有一個全選；右上角的全選一次給所有民宿的所有權限。
 * 全選 checkbox 沒有 name，不會被送進表單，只在前端代勾。
 */
export default function AccessTable({
  properties,
  initial,
}: {
  properties: { id: number; name: string }[];
  initial: Record<number, Caps>;
}) {
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
  const setAll = (v: boolean) =>
    setCaps(() => {
      const next: Record<number, Caps> = {};
      for (const p of properties) next[p.id] = { i: v, o: v, c: v };
      return next;
    });

  return (
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
          <th className="p-2 font-medium text-center">
            <div className="flex flex-col items-center gap-1">
              全選
              <SelectAll
                checked={totalAll}
                indeterminate={!totalAll && totalOn > 0}
                onChange={setAll}
                title="所有民宿的所有權限"
              />
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        {properties.map((p) => {
          const s = rowState(p.id);
          return (
            <tr key={p.id} style={{ borderTop: "1px solid var(--border)" }}>
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
              <td className="p-2 text-center">
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
    />
  );
}
