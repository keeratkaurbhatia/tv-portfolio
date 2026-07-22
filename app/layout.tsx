import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "K–TV — Kaur After Dark",
  description: "An independent late-night broadcast of selected development work and creative code.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "K–TV — Live Projects After Dark",
    description: "Late-night project broadcasts with live builds open for exploration.",
    type: "website",
    images: [{ url: "/og.png", width: 1536, height: 910, alt: "K–TV live projects after dark" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "K–TV — Live Projects After Dark",
    description: "Late-night project broadcasts with live builds open for exploration.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={geistMono.variable}>{children}</body></html>;
}
