import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegistration } from "@/components/lockedin/ServiceWorkerRegistration";
import { DbSeedInitializer } from "@/components/lockedin/DbSeedInitializer";
import { InstallGuide } from "@/components/lockedin/InstallGuide";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lockedin — AI Powerlifting Coach",
  description: "Your personal AI-powered powerlifting coach",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Lockedin",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#111113",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
      style={{ backgroundColor: "#111113" }}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      </head>
      <body
        className="min-h-full flex flex-col"
        style={{ backgroundColor: "#111113", color: "#ECECEF" }}
      >
        <ServiceWorkerRegistration />
        <DbSeedInitializer />
        <InstallGuide />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
