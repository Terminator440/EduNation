import Header from "@/components/landing/Header";
import HeroSection from "@/components/landing/HeroSection";
import PrinciplesSection from "@/components/landing/PrinciplesSection";
import Footer from "@/components/landing/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <HeroSection />
        <PrinciplesSection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
