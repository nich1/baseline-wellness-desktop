import { ThemeProvider } from "@/components/ThemeProvider";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./responsive.css";
import "./muscle-map.css";
import "./themes.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: {
    default: "Baseline",
    template: "%s · Baseline",
  },
  description: "Nutrition, bodyweight, and strength tracking.",
  icons: { icon: "/baseline-logo-transparent.png" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} ${mono.variable}`}><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
