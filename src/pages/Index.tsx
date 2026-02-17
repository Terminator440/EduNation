import { lazy, Suspense } from "react";
import Header from "@/components/landing/Header";
import HeroSection from "@/components/landing/HeroSection";
import Footer from "@/components/landing/Footer";

const BenefitsSection = lazy(() => import("@/components/landing/BenefitsSection"));
const FeaturesSection = lazy(() => import("@/components/landing/FeaturesSection"));
const TrustSection = lazy(() => import("@/components/landing/TrustSection"));
const ImplementationSection = lazy(() => import("@/components/landing/ImplementationSection"));
const LeadFormSection = lazy(() => import("@/components/landing/LeadFormSection"));

const Index = () => {
  return (
    <div className="min-h-screen w-full bg-background">
      <Header />
      <main>
        <HeroSection />
        <Suspense fallback={<div className="min-h-[40vh]" aria-hidden />}>
          <BenefitsSection />
          <FeaturesSection />
          <TrustSection />
          <ImplementationSection />
          <LeadFormSection />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
};

export default Index;
