import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { themeCssVariables } from "@/lib/theme";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: {
    default: "Dizkarte Admin",
    template: "%s · Dizkarte Admin",
  },
  description: "Protected Admin console for the Dizkarte task marketplace.",
  robots: { index: false, follow: false },
  icons: {
    icon: "/brand/app-icon-logo.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeCssVariables() }} />
      </head>
      <body>
        <a href="#dk-main-content" className="dk-skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
