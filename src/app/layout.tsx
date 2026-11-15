import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "ALOAPI — Private CRM & Integration Intelligence",
  description: "Self-hosted CRM, Growth Engine, guided integration documentation, and a write-only encrypted credential vault. Provider authorization is separate and never inferred from source presence.",
  keywords: ["ALOAPI", "self-hosted CRM", "integration intelligence", "OAuth setup guidance", "credential vault"],
  authors: [{ name: "ALOAPI" }],
  icons: { icon: "/logo.svg" },
  openGraph: {
    title: "ALOAPI — Private CRM & Integration Intelligence",
    description: "A private, owner-operated CRM and integration setup workspace.",
    siteName: "ALOAPI",
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
      <body className="antialiased bg-background text-foreground font-sans">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
