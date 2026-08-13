import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import "./globals.css";
import { AppDotSpotlight } from "@/components/layout/app-dot-spotlight";
import { AppToaster } from "@/components/ui/app-toaster";
import { SolarIconsProvider } from "@/components/providers/solar-icons-provider";
import { clerkAppearance } from "@/lib/auth/clerk-appearance";
import { isClerkConfigured } from "@/lib/auth/roles";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Capital Lead Solutions — Lead Distribution",
  description: "Internal lead distribution platform for Capital Lead Solutions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const body = (
    <html lang="en" className={plusJakarta.variable}>
      <body className="relative font-sans antialiased">
        <NextTopLoader color="#1d4ed8" height={3} showSpinner={false} />
        <AppToaster />
        <AppDotSpotlight />
        <div className="relative z-[1]">
          <SolarIconsProvider>{children}</SolarIconsProvider>
        </div>
      </body>
    </html>
  );

  if (!isClerkConfigured()) {
    return body;
  }

  // No explicit proxyUrl prop needed: ClerkProvider reads
  // NEXT_PUBLIC_CLERK_PROXY_URL (set in next.config.mjs, production only)
  // to route Frontend API requests through src/middleware.ts's
  // frontendApiProxy instead of Clerk's CNAME subdomain.
  return <ClerkProvider appearance={clerkAppearance}>{body}</ClerkProvider>;
}
