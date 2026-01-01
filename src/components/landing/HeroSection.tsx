import { Button } from "@/components/ui/button";
import { ArrowRight, Play } from "lucide-react";

const HeroSection = () => {
  const scrollToDemo = () => {
    document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollToFeatures = () => {
    document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative min-h-[90vh] flex items-center justify-center bg-gradient-hero overflow-hidden pt-20">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/8 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-accent/8 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Main headline */}
          <h1
            className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 animate-fade-up leading-tight"
            style={{ animationDelay: "0.1s" }}
          >
            Eliminați birocrația din școală.
            <span className="block text-gradient mt-2">
              Gestionați totul digital, simplu și sigur.
            </span>
          </h1>

          {/* Subheadline */}
          <p
            className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto mb-10 animate-fade-up leading-relaxed"
            style={{ animationDelay: "0.2s" }}
          >
            Catalog digital școlar conform cerințelor Ministerului Educației, care automatizează notele, absențele și rapoartele oficiale — într-o singură platformă sigură.
          </p>

          {/* CTAs */}
          <div
            className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-up"
            style={{ animationDelay: "0.3s" }}
          >
            <Button variant="hero" size="xl" onClick={scrollToDemo}>
              Solicită un demo gratuit
              <ArrowRight className="w-5 h-5" />
            </Button>
            <Button variant="hero-outline" size="xl" onClick={scrollToFeatures}>
              <Play className="w-4 h-4" />
              Vezi cum funcționează
            </Button>
          </div>

          {/* Trust indicators */}
          <div
            className="mt-12 flex flex-wrap justify-center gap-6 text-sm text-muted-foreground animate-fade-up"
            style={{ animationDelay: "0.4s" }}
          >
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-success" />
              Conform GDPR
            </span>
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-success" />
              Date securizate
            </span>
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-success" />
              Suport dedicat
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
