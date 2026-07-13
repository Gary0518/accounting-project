import Link from "next/link";
import { signOut } from "@/app/actions";
import { getAccess, canAny } from "@/lib/access";

export default async function NavBar({
  active,
}: {
  active: "dashboard" | "cashflow" | "entries" | "admin";
}) {
  const access = await getAccess();
  const show = {
    input: access ? canAny(access, "input") : false,
    operations: access ? canAny(access, "operations") : false,
    cashflow: access ? canAny(access, "cashflow") : false,
    admin: access?.isAdmin ?? false,
  };

  const linkStyle = (on: boolean) =>
    ({
      fontWeight: on ? 700 : 500,
      color: on ? "var(--text-primary)" : "var(--text-secondary)",
      borderBottom: on ? "2px solid var(--series-1)" : "2px solid transparent",
    }) as const;

  return (
    <header
      className="sticky top-0 z-10 backdrop-blur"
      style={{
        background: "color-mix(in srgb, var(--page) 85%, transparent)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-6">
        <nav className="flex gap-4 text-sm h-full items-center">
          {show.input && (
            <Link href="/" className="h-full flex items-center" style={linkStyle(active === "entries")}>
              帳目輸入
            </Link>
          )}
          {show.operations && (
            <Link
              href="/dashboard"
              className="h-full flex items-center"
              style={linkStyle(active === "dashboard")}
            >
              營業數據
            </Link>
          )}
          {show.cashflow && (
            <Link
              href="/cashflow"
              className="h-full flex items-center"
              style={linkStyle(active === "cashflow")}
            >
              金流數據
            </Link>
          )}
          {show.admin && (
            <Link
              href="/admin"
              className="h-full flex items-center"
              style={linkStyle(active === "admin")}
            >
              設定
            </Link>
          )}
        </nav>
        <form action={signOut} className="ml-auto">
          <button className="btn btn-ghost text-sm" type="submit">
            登出
          </button>
        </form>
      </div>
    </header>
  );
}
