// 無權限時顯示（NavBar 只會列出你有權限的分頁，可從上方切換）。
export default function NoAccess({ what }: { what: string }) {
  return (
    <main className="max-w-5xl mx-auto px-4 py-16 text-center">
      <p className="text-xl font-bold mb-2">沒有權限</p>
      <p style={{ color: "var(--text-secondary)" }}>
        你目前沒有「{what}」的權限。請聯絡管理員開通，或從上方切換到你有權限的分頁。
      </p>
    </main>
  );
}
