import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// 以 Email + 密碼登入（帳號由 Supabase Dashboard → Authentication 建立）
async function signIn(formData: FormData) {
  "use server";
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <form
        action={signIn}
        className="card w-full max-w-sm p-8 flex flex-col gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold">民宿管理系統</h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            出入帳 / 訂房管理系統
          </p>
        </div>
        <div>
          <label className="label">Email</label>
          <input name="email" type="email" required className="field" />
        </div>
        <div>
          <label className="label">密碼</label>
          <input name="password" type="password" required className="field" />
        </div>
        {error && (
          <p className="text-sm" style={{ color: "var(--critical)" }}>
            登入失敗：{error}
          </p>
        )}
        <button className="btn btn-primary mt-2" type="submit">
          登入
        </button>
      </form>
    </main>
  );
}
