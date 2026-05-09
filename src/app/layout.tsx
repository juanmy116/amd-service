import type { Metadata } from "next";
import { SITE } from "@/lib/constants";
import "./globals.css";

export const metadata: Metadata = {
  title: SITE.name,
  description: SITE.description,
  openGraph: {
    type: "website",
    locale: SITE.locale,
    url: SITE.url,
    siteName: SITE.name,
    images: [{ url: SITE.ogImage }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className="h-full scroll-smooth">
      <body className="flex flex-col min-h-screen">
        {children}
      </body>
    </html>
  );
}
