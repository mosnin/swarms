import { Footer } from "@/app/(marketing)/_components/footer";
import { MarketingNav } from "@/app/(marketing)/_components/marketing-nav";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <MarketingNav />
      <div className="animate-page-in">{children}</div>
      <Footer />
    </div>
  );
}
