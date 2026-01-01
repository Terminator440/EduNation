import Header from "@/components/landing/Header";
import HeroSection from "@/components/landing/HeroSection";
import BenefitsSection from "@/components/landing/BenefitsSection";
import FeaturesSection from "@/components/landing/FeaturesSection";
import TrustSection from "@/components/landing/TrustSection";
import ImplementationSection from "@/components/landing/ImplementationSection";
import LeadFormSection from "@/components/landing/LeadFormSection";
import Footer from "@/components/landing/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <HeroSection />
        <BenefitsSection />
        <FeaturesSection />
        <TrustSection />
        <ImplementationSection />
        <LeadFormSection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
