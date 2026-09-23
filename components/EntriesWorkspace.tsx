"use client";

import { useEffect, useRef, useState } from "react";
import EntryForm from "@/components/EntryForm";
import RecentEntries from "@/components/RecentEntries";
import { type Creator } from "@/lib/domain";

interface Option {
  name: string;
}
interface Property {
  id: number;
  name: string;
}
interface Categories {
  income: string[];
  expense: string[];
}

// 記住上次選的民宿。localStorage 是「這台裝置這個瀏覽器」層級，
// 換電腦不會同步——以一人一機的使用情境來說夠用。
const LAST_PROPERTY_KEY = "accounting:last-property";

/**
 * 帳目輸入頁的左右兩欄。
 * 兩邊需要共用「目前是哪一間民宿」，所以狀態放在這裡，
 * 頁面本身（server component）只負責把選單資料查好傳進來。
 */
export default function EntriesWorkspace({
  properties,
  creators,
  paymentMethods,
  channels,
  roomTypes,
  categories,
  filterCategories,
}: {
  properties: Property[];
  /** 明細「建立人員」那欄要顯示的名字 */
  creators: Creator[];
  paymentMethods: Option[];
  channels: Option[];
  roomTypes: Option[];
  /** 表單「支出科目」用（不含清潔費） */
  categories: Categories;
  /** 右邊明細的科目篩選用（含清潔費） */
  filterCategories: Categories;
}) {
  // 初值用第一間，讓伺服器與瀏覽器首次畫出來的內容一致（不然會 hydration 不符），
  // 掛載後再用 localStorage 蓋掉。
  const [formProperty, setFormProperty] = useState(() => String(properties[0]?.id ?? ""));
  // 右邊要看哪一間；空字串 = 還沒選，這時完全不查資料庫
  const [view, setView] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  // 只還原一次：即時同步會讓頁面反覆重新渲染，properties 每次都是新陣列，
  // 不擋的話這段會一直重跑，把使用者當下選的民宿蓋回上次存的值。
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;

    let saved: string | null = null;
    try {
      saved = localStorage.getItem(LAST_PROPERTY_KEY);
    } catch {
      // 無痕模式等情況讀不到 localStorage，就維持預設值
    }
    // 存的民宿可能已停用或權限被改掉，確認還在清單裡才套用
    if (saved && properties.some((p) => String(p.id) === saved)) {
      setFormProperty(saved);
      // 上次選過就直接載入那一間的帳目；第一次來（沒存過）才維持空白
      setView(saved);
    }
  }, [properties]);

  // 左邊換民宿 → 記起來，右邊也跟著看那一間
  const changeFormProperty = (v: string) => {
    setFormProperty(v);
    try {
      localStorage.setItem(LAST_PROPERTY_KEY, v);
    } catch {
      // 存不進去不影響使用，只是下次不會記得
    }
    setView(v);
  };

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-6 grid lg:grid-cols-[minmax(0,380px)_1fr] gap-5 items-start">
      <div className="lg:sticky lg:top-20">
        <h1 className="text-lg font-bold mb-3">新增帳目</h1>
        <EntryForm
          properties={properties}
          propertyId={formProperty}
          onPropertyChange={changeFormProperty}
          onSaved={() => setReloadToken((t) => t + 1)}
          paymentMethods={paymentMethods}
          channels={channels}
          roomTypes={roomTypes}
          categories={categories}
        />
      </div>

      <RecentEntries
        properties={properties}
        creators={creators}
        filterCategories={filterCategories}
        view={view}
        onViewChange={setView}
        reloadToken={reloadToken}
        editOptions={{ properties, paymentMethods, channels, roomTypes, categories }}
      />
    </main>
  );
}
