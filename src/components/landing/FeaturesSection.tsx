import { BookOpen, Calendar, GraduationCap, Users, Brain, FileText } from "lucide-react";

const features = [
  {
    icon: GraduationCap,
    title: "Note și Absențe",
    description: "Urmărește-ți notele și prezența în timp real. Fiecare materie, fiecare evaluare, totul organizat clar.",
  },
  {
    icon: Brain,
    title: "Explicații AI",
    description: "Un algoritm inteligent explică lecțiile pe scurt și clar, într-un limbaj ușor de înțeles.",
  },
  {
    icon: Calendar,
    title: "Calendar Școlar",
    description: "Vacanțe, teste, evenimente - tot ce trebuie să știi, într-un singur calendar interactiv.",
  },
  {
    icon: BookOpen,
    title: "Manuale Digitale",
    description: "Acces la manuale și cărți digitale din programă, puse la dispoziție legal și gratuit.",
  },
  {
    icon: Users,
    title: "Comunicare Facilă",
    description: "Profesori, elevi și părinți conectați pe aceeași platformă pentru o comunicare eficientă.",
  },
  {
    icon: FileText,
    title: "Lecții Structurate",
    description: "Profesorii pot adăuga lecții din programă, iar tu le găsești organizate și gata de studiu.",
  },
];

const FeaturesSection = () => {
  return (
    <section id="features" className="py-24 bg-background">
      <div className="container mx-auto px-4">
        {/* Section header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Tot ce ai nevoie pentru școală
          </h2>
          <p className="text-lg text-muted-foreground">
            O platformă completă care transformă modul în care înveți și te organizezi
          </p>
        </div>

        {/* Features grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="group p-6 rounded-2xl bg-card border border-border hover:border-primary/30 hover:shadow-lg transition-all duration-300"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <feature.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">
                {feature.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
