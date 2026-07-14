import { CapabilityRows } from "@/app/(marketing)/_components/capability-rows";
import { CostChart } from "@/app/(marketing)/_components/cost-chart";
import { CtaBand } from "@/app/(marketing)/_components/cta-band";
import { Hero } from "@/app/(marketing)/_components/hero";
import { HowItWorks } from "@/app/(marketing)/_components/how-it-works";
import { LogoCloud } from "@/app/(marketing)/_components/logo-cloud";
import { MetricsBand } from "@/app/(marketing)/_components/metrics-band";
import { MorePrimitives } from "@/app/(marketing)/_components/more-primitives";

export default function Home() {
  return (
    <main className="bg-white">
      <Hero />
      <LogoCloud />
      <MetricsBand />
      <CapabilityRows />
      <HowItWorks />
      <MorePrimitives />
      <CostChart />
      <CtaBand />
    </main>
  );
}
