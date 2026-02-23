import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const cinzel = localFont({
  variable: "--font-display",
  src: [
    { path: "./fonts/Cinzel-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Cinzel-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/Cinzel-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
});

const manrope = localFont({
  variable: "--font-body",
  src: [
    { path: "./fonts/Manrope-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Manrope-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/Manrope-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/Manrope-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Skull & Roses - Online Table",
  description:
    "Play Skull (Skulls and Roses) online with friends. Bluff, bid, reveal.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${cinzel.variable} ${manrope.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
