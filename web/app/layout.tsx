import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { LangProvider } from "@/components/lang";
import { SkipLink } from "@/components/site";
import { THEME_SCRIPT } from "@/components/theme";
import "./globals.css";
import { siteUrl } from "@/lib/site-url";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});


export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Todu - Help is one tap away",
    template: "%s | Todu",
  },
  description:
    "Todu turns one tap into a lifeline: live location to people you trust, a direct line to 112, and a fallback ladder that keeps working when the network does not.",
  keywords: [
    "emergency SOS app",
    "personal safety India",
    "112 ERSS",
    "offline SOS",
    "women safety app",
  ],
  openGraph: {
    type: "website",
    siteName: "Todu",
    title: "Todu - Help is one tap away",
    description:
      "One tap. Your people know where you are. Live location, 112, and an offline fallback ladder.",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "Todu - Help is one tap away",
    description:
      "One tap. Your people know where you are. Live location, 112, and an offline fallback ladder.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#f6f8fa",
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // data-theme is set before hydration by THEME_SCRIPT, so React must not
    // treat it as a mismatch.
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        <LangProvider>
          <SkipLink />
          {children}
        </LangProvider>
      </body>
    </html>
  );
}
