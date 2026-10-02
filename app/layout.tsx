import type { Metadata } from "next";
import { Geist, Geist_Mono, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";

const jetbrainsMono = JetBrains_Mono({subsets:['latin'],variable:'--font-mono'});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
  display: "swap",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      className={cn("h-full", "antialiased", jakarta.variable, geistSans.variable, geistMono.variable, "font-sans", jetbrainsMono.variable)}
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
