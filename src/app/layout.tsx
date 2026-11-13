import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ALO Education BD — CRM, Automation & Access Portal", 
  description:
    "ALO Education BD-র অল-ইন-ওয়ান স্টেজিং হাব — শিক্ষার্থী লিড পাইপলাইন, ফলো-আপ অটোমেশন, নলেজ বেস, এবং ক্লায়েন্ট ক্রেডেনশিয়াল কালেকশন পোর্টাল (WhatsApp Lite ID, Page ID, Token, Web URL — ১৩ প্ল্যাটফর্ম)।",
  keywords: [
    "ALO Education BD",
    "aloeducation",
    "CRM Bangladesh",
    "admission pipeline",
    "WhatsApp API setup",
    "client credential portal",
    "marketing automation",
  ],
  authors: [{ name: "ALO Education BD" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "ALO Education BD — CRM & Automation Hub",
    description: "শিক্ষা ব্যবসার জন্য লিড পাইপলাইন + অটোমেশন + নিরাপদ ক্রেডেনশিয়াল কালেকশন — সব বাংলায়।",
    siteName: "ALO Education BD",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="bn" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Bengali-first font for the client-facing portal */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- single-page app; App Router root layout */}
        <link
          href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
        style={{ fontFamily: "'Hind Siliguri', var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif" }}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
