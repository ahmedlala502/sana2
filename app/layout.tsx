import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { THEME_BOOTSTRAP } from "@/lib/theme";
import "./globals.css";

/*
  Self-hosted at build time rather than a <link> to fonts.googleapis.com.
  That stylesheet was render-blocking and cost two extra DNS+TLS handshakes
  before a single glyph could be requested; next/font inlines the @font-face
  rules into the first CSS payload and serves the woff2 from our own origin.
  `display: swap` keeps text visible while they arrive.
*/
const fontBody = Inter({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
  variable: "--font-body-src",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
  adjustFontFallback: true,
});

const fontDisplay = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700"],
  variable: "--font-display-src",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
  adjustFontFallback: true,
});

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
  variable: "--font-mono-src",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
  adjustFontFallback: true,
});

export const metadata: Metadata = {
  title: "Sana2 Advanced Assistant",
  description:
    "Multi-provider AI console - NVIDIA NIM, Ollama and OpenCode Zen, with skills, plugins, MCP tools and a live visual canvas.",
  applicationName: "Sana2 Advanced Assistant",
  appleWebApp: { capable: true, title: "Sana2", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  /*
    No maximumScale / user-scalable:no. Pinch-zoom is the fallback anyone with
    low vision relies on, and disabling it fails WCAG 1.4.4 outright.
  */
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5fa" },
    { media: "(prefers-color-scheme: dark)", color: "#08080b" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontBody.variable} ${fontDisplay.variable} ${fontMono.variable}`}
    >
      <head>
        {/* sets theme, accent and density before first paint, so there is no flash */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="lab-bg overflow-hidden">{children}</body>
    </html>
  );
}
