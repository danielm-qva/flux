import type { Metadata } from "next";
import { Instrument_Sans, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";
import "./redesign.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";

const mono = Spline_Sans_Mono({
  subsets: ["latin"],
  variable: "--font-code",
  display: "swap",
});

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Flux",
  description: "A fast, focused API workspace.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={cn(
        "h-full",
        "antialiased",
        sans.variable,
        mono.variable,
        "font-sans",
      )}
    >
      <body
        suppressHydrationWarning
        className="min-h-full bg-background text-foreground"
      >
        <div className="flux-app-background flex min-h-screen flex-col">
          {children}
        </div>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
