import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { RegisterSW } from "@/components/pwa/register-sw";
import { OfflineIndicator } from "@/components/pwa/offline-indicator";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0b192c" },
  ],
};

export const metadata: Metadata = {
  title: "CaribClear — Foreign Trade Operations for Caribbean Brokers",
  description:
    "Multi-tenant SaaS for customs brokers, freight forwarders and SME importers in Trinidad & Tobago and the Caribbean: shipments tracking, 5-year document vault, landed cost engine (CET/VAT/excise), T&T permits matrix, importer portal. Works offline.",
  keywords: ["customs broker", "landed cost", "Trinidad and Tobago", "freight forwarding", "ASYCUDA", "import permits"],
  authors: [{ name: "CaribClear" }],
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CaribClear",
  },
  formatDetection: { telephone: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${GeistSans.variable} ${GeistMono.variable} antialiased bg-background text-foreground`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <OfflineIndicator />
          {children}
          <Toaster />
          <RegisterSW />
        </ThemeProvider>
      </body>
    </html>
  );
}
