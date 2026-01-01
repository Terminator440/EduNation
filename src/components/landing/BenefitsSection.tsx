import { Check, Briefcase, Users, GraduationCap } from "lucide-react";

const benefits = {
  directori: {
    title: "Pentru Directori & Profesori",
    subtitle: "Control total. Mai puțin timp pierdut.",
    icon: Briefcase,
    color: "primary",
    items: [
      "Calcul automat al mediilor și situațiilor școlare",
      "Rapoarte generate instant pentru conducere și autorități",
      "Evidență clară a notelor, absențelor și modificărilor",
      "Acces diferențiat pe roluri (profesor, diriginte, director)",
      "Date centralizate, fără erori de calcul sau dublări",
    ],
  },
  parinti: {
    title: "Pentru Părinți",
    subtitle: "Transparență și informații la timp.",
    icon: Users,
    color: "accent",
    items: [
      "Notificări în timp real pentru note și absențe",
      "Vizibilitate clară asupra situației copilului",
      "Istoric complet și trasabil al modificărilor",
      "Comunicare directă cu școala, într-un cadru sigur",
    ],
  },
  elevi: {
    title: "Pentru Elevi",
    subtitle: "Acces rapid la informațiile școlare.",
    icon: GraduationCap,
    color: "success",
    items: [
      "Orar actualizat și calendar școlar",
      "Vizualizare note și absențe pe materii",
      "Acces la materiale și anunțuri",
      "Claritate, fără confuzie sau informații pierdute",
    ],
  },
};

const BenefitsSection = () => {
  return (
    <section id="benefits" className="py-24 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Beneficii concrete pentru toată comunitatea școlară
          </h2>
          <p className="text-lg text-muted-foreground">
            O platformă care răspunde nevoilor reale ale școlii moderne — nu promisiuni vagi, ci rezultate măsurabile.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {Object.entries(benefits).map(([key, benefit]) => {
            const IconComponent = benefit.icon;
            return (
              <div
                key={key}
                className="bg-card rounded-2xl p-8 border border-border shadow-md hover:shadow-lg transition-all duration-300 hover:border-primary/20"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      benefit.color === "primary"
                        ? "bg-primary/10"
                        : benefit.color === "accent"
                        ? "bg-accent/10"
                        : "bg-success/10"
                    }`}
                  >
                    <IconComponent
                      className={`w-6 h-6 ${
                        benefit.color === "primary"
                          ? "text-primary"
                          : benefit.color === "accent"
                          ? "text-accent"
                          : "text-success"
                      }`}
                    />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-foreground mb-1">
                  {benefit.title}
                </h3>
                <p className="text-muted-foreground text-sm mb-6">{benefit.subtitle}</p>
                <ul className="space-y-3">
                  {benefit.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          benefit.color === "primary"
                            ? "bg-primary/10"
                            : benefit.color === "accent"
                            ? "bg-accent/10"
                            : "bg-success/10"
                        }`}
                      >
                        <Check
                          className={`w-3 h-3 ${
                            benefit.color === "primary"
                              ? "text-primary"
                              : benefit.color === "accent"
                              ? "text-accent"
                              : "text-success"
                          }`}
                        />
                      </div>
                      <span className="text-foreground text-sm">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default BenefitsSection;
