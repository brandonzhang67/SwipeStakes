import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SwipeStakes",
  description: "Trade Yale meal swipes for dining dollars: straight trades, provably fair games, and weather parlays.",
};

export const viewport: Viewport = { themeColor: "#00356b", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
