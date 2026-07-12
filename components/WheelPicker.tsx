"use client";

import { useEffect, useRef } from "react";

// iPhone 鬧鐘風格的滾輪：滑動選取，停下後回報中間對齊的項目。
const ITEM = 40; // 每列高度
const VISIBLE = 5; // 顯示列數（要為奇數，中間那列是選取列）

export default function WheelPicker({
  options,
  value,
  onChange,
  width = 76,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idx = Math.max(0, options.findIndex((o) => o.value === value));

  // 進來 / 外部值改變時，把選取項捲到中間
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = idx * ITEM;
  }, [idx]);

  // 卸載時清掉尚未觸發的防抖 timer，避免對已卸載元件呼叫 onChange
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const handleScroll = () => {
    const el = ref.current;
    if (!el) return;
    if (timer.current) clearTimeout(timer.current);
    // 停止滑動一小段時間後，取中間對齊的項目
    timer.current = setTimeout(() => {
      const i = Math.min(options.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM)));
      const v = options[i]?.value;
      if (v && v !== value) onChange(v);
    }, 150);
  };

  return (
    <div style={{ position: "relative", height: ITEM * VISIBLE, width }}>
      {/* 中間選取帶 */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: ITEM * ((VISIBLE - 1) / 2),
          height: ITEM,
          pointerEvents: "none",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
          background: "color-mix(in srgb, var(--series-1) 10%, transparent)",
          borderRadius: 6,
        }}
      />
      <div
        ref={ref}
        onScroll={handleScroll}
        className="hide-scrollbar"
        style={{
          height: "100%",
          overflowY: "scroll",
          scrollSnapType: "y mandatory",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div style={{ height: ITEM * ((VISIBLE - 1) / 2) }} />
        {options.map((o, i) => (
          <div
            key={o.value}
            onClick={() => ref.current?.scrollTo({ top: i * ITEM, behavior: "smooth" })}
            style={{
              height: ITEM,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              scrollSnapAlign: "center",
              cursor: "pointer",
              userSelect: "none",
              color: o.value === value ? "var(--text-primary)" : "var(--text-muted)",
              fontWeight: o.value === value ? 700 : 400,
              fontSize: o.value === value ? 17 : 15,
              transition: "color .12s, font-size .12s",
            }}
          >
            {o.label}
          </div>
        ))}
        <div style={{ height: ITEM * ((VISIBLE - 1) / 2) }} />
      </div>
    </div>
  );
}
