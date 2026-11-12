import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

const display = Archivo({ subsets: ["latin"], weight: ["800", "900"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "Sam Time",
  description: "How long have we been waiting for Sam?",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={display.variable}>
      <body>{children}</body>
    </html>
  );
}
