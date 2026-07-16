import { CapabilityRows } from "@/app/(marketing)/_components/capability-rows";
import { CostChart } from "@/app/(marketing)/_components/cost-chart";
import { CtaBand } from "@/app/(marketing)/_components/cta-band";
import { FeatureShowcase } from "@/app/(marketing)/_components/feature-showcase";
import { Hero } from "@/app/(marketing)/_components/hero";
import { HowItWorks } from "@/app/(marketing)/_components/how-it-works";
import { LogoCloud } from "@/app/(marketing)/_components/logo-cloud";
import { MetricsBand } from "@/app/(marketing)/_components/metrics-band";

export default function Home() {
  return (
    <main className="bg-white">
      <Hero />
      <LogoCloud />
      <MetricsBand />
      <FeatureShowcase />
      <CapabilityRows />
      <HowItWorks />
      <CostChart />
      <CtaBand />
    </main>
  );
}
