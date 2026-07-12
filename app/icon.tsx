import { ImageResponse } from "next/og";

// 產生 PNG 網站圖示（favicon）。用純幾何畫一間小房子，
// 不依賴中文字型，Safari / Chrome 都能正常顯示。
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#2a78d6",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* 屋頂 */}
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: "9px solid transparent",
            borderRight: "9px solid transparent",
            borderBottom: "8px solid #ffffff",
          }}
        />
        {/* 房身 */}
        <div style={{ width: 12, height: 8, background: "#ffffff" }} />
      </div>
    ),
    size,
  );
}
