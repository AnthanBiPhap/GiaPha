import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import { SiteHeader } from "@/components/layout/site-header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-inter",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin", "vietnamese"],
  variable: "--font-source-serif",
});

export const metadata: Metadata = {
  applicationName: "Gia Phả Cao Tổ",
  title: {
    default: "Gia Phả Cao Tổ",
    template: "%s · Gia Phả Cao Tổ",
  },
  description: "Quản lý gia phả dòng họ Cao Tổ",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Gia Phả Cao Tổ",
  },
  openGraph: {
    title: "Gia Phả Cao Tổ",
    description: "Quản lý gia phả dòng họ Cao Tổ",
    siteName: "Gia Phả Cao Tổ",
    locale: "vi_VN",
    type: "website",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#46573f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body
        className={`${inter.variable} ${sourceSerif.variable} antialiased pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0`}
      >
        <SiteHeader />
        <main className="min-h-[calc(100dvh-3.5rem)]">{children}</main>
        <MobileNav />
        <Toaster />
      </body>
    </html>
  );
}
