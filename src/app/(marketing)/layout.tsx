import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

import { AnnouncementBar } from "@/app/(marketing)/_components/announcement-bar";
import { Footer } from "@/app/(marketing)/_components/footer";
import { MarketingNav } from "@/app/(marketing)/_components/marketing-nav";
import { MotionProvider } from "@/app/(marketing)/_components/motion-provider";

/**
 * The logged-out site is a deliberately distinct visual world from the
 * authenticated app: Geist (loaded only here) instead of Inter, and a locked
 * light backdrop regardless of the visitor's OS theme — the dashboard's
 * `dark:`/media-query tokens never apply inside this subtree because nothing
 * here references them.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${GeistSans.variable} ${GeistMono.variable} min-h-screen bg-white font-display text-neutral-950 antialiased`}
    >
      <MotionProvider>
        <AnnouncementBar />
        <MarketingNav />
        <div className="animate-page-in">{children}</div>
        <Footer />
      </MotionProvider>
    </div>
  );
}
