"use client";

/**
 * 匯出 PDF：直接開瀏覽器的列印對話框，在目的地選「另存為 PDF」。
 * 版面靠 globals.css 的 @media print 處理（隱藏導覽列與篩選、白底黑字、明細整份展開）。
 * 不用 html2canvas / jsPDF 那類套件：那會把圖表轉成點陣圖、文字變糊，也印不出可選取的文字。
 */
export default function PrintButton() {
  return (
    <button type="button" className="btn btn-ghost no-print" onClick={() => window.print()}>
      匯出 PDF
    </button>
  );
}
