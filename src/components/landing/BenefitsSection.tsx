import { Check } from "lucide-react";

const benefits = {
  elevi: {
    title: "Pentru Elevi",
    color: "primary",
    items: [
      "Note și absențe într-un singur loc",
      "Explicații clare pentru fiecare lecție",
      "Calendar cu toate evenimentele",
      "Acces la manuale digitale",
      "Organizare perfectă a studiului",
    ],
  },
  profesori: {
    title: "Pentru Profesori",
    color: "accent",
    items: [
      "Introducere rapidă a notelor",
      "Adaugă lecții din programă",
      "Decizi ce explicații ajung la elevi",
      "Economisești timp prețios",
      "Comunicare directă cu părinții",
    ],
  },
  parinti: {
    title: "Pentru Părinți",
    color: "success",
    items: [
      "Vedere clară asupra situației",
      "Notificări în timp real",
      "Calendarul complet al școlii",
      "Contact direct cu profesorii",
      "Urmărirea progresului",
    ],
  },
};

const BenefitsSection = () => {
  return (
    <section id="benefits" className="py-24 bg-secondary/30">
      <div className="container mx-auto px-4">
        {/* Section header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Beneficii pentru toată lumea
          </h2>
          <p className="text-lg text-muted-foreground">
            EduCatalog este gândit să ajute fiecare participant în procesul educațional
          </p>
        </div>

        {/* Benefits cards */}
        <div className="grid md:grid-cols-3 gap-8">
          {Object.entries(benefits).map(([key, benefit], index) => (
            <div
              key={key}
              className="bg-card rounded-2xl p-8 border border-border shadow-md hover:shadow-lg transition-shadow"
            >
              <div className={`inline-block px-4 py-1.5 rounded-full text-sm font-semibold mb-6 ${
                benefit.color === "primary" 
                  ? "bg-primary/10 text-primary" 
                  : benefit.color === "accent"
                  ? "bg-accent/10 text-accent"
                  : "bg-success/10 text-success"
              }`}>
                {benefit.title}
              </div>
              <ul className="space-y-4">
                {benefit.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      benefit.color === "primary" 
                        ? "bg-primary/10" 
                        : benefit.color === "accent"
                        ? "bg-accent/10"
                        : "bg-success/10"
                    }`}>
                      <Check className={`w-3 h-3 ${
                        benefit.color === "primary" 
                          ? "text-primary" 
                          : benefit.color === "accent"
                          ? "text-accent"
                          : "text-success"
                      }`} />
                    </div>
                    <span className="text-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default BenefitsSection;
