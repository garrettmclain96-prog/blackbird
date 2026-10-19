import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blackbird — Search beyond the obvious",
  description: "Live username and email checks, built for your phone. A private Blackbird workspace by McLain Systems.",
  applicationName: "Blackbird",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Blackbird" },
  icons: {
    icon: "/favicon.svg",
    apple: "/icon-192.png",
  },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#101719", viewportFit: "cover" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
