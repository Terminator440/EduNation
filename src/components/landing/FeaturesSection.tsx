import { Calculator, Clock, Calendar, MessageSquare, BarChart3, History } from "lucide-react";

const features = [
  {
    icon: Calculator,
    title: "Note și medii calculate automat",
    description: "Sistemul calculează automat mediile și situațiile școlare, eliminând erorile manuale.",
  },
  {
    icon: Clock,
    title: "Gestionare absențe și motivări",
    description: "Înregistrare și motivare absențe, cu notificări automate către părinți.",
  },
  {
    icon: Calendar,
    title: "Calendar școlar și evenimente",
    description: "Toate evenimentele școlare într-un singur loc, sincronizate pentru toți.",
  },
  {
    icon: MessageSquare,
    title: "Mesagerie securizată școală–părinte",
    description: "Comunicare directă și sigură între profesori și părinți, cu trasabilitate.",
  },
  {
    icon: BarChart3,
    title: "Statistici și rapoarte exportabile",
    description: "Rapoarte CSV și print-ready pentru conducere și autorități, generate instant.",
  },
  {
    icon: History,
    title: "Istoric complet și audit",
    description: "Toate modificările sunt înregistrate și trasabile pentru transparență totală.",
  },
];

const FeaturesSection = () => {
  return (
    <section id="features" className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Funcționalități cheie
          </h2>
          <p className="text-lg text-muted-foreground">
            Tot ce aveți nevoie pentru digitalizarea completă a catalogului școlar.
          </p>
        </div>

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
              <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
