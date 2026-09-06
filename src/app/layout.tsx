import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0d9488",
};

export const metadata: Metadata = {
  title: "CaribClear — Foreign Trade Operations for Caribbean Brokers",
  description:
    "Multi-tenant SaaS for customs brokers, freight forwarders and SME importers in Trinidad & Tobago and the Caribbean: shipments tracking, 5-year document vault, landed cost engine (CET/VAT/excise), T&T permits matrix, importer portal.",
  keywords: ["customs broker", "landed cost", "Trinidad and Tobago", "freight forwarding", "ASYCUDA", "import permits"],
  authors: [{ name: "CaribClear" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
