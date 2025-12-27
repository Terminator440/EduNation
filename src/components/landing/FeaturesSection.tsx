import { BookOpen, Calendar, GraduationCap, Users, FileText, ClipboardList } from "lucide-react";

const features = [
  {
    icon: GraduationCap,
    title: "Note și Absențe",
    description:
      "Urmărești notele și prezența pe materii și perioade, cu evidență clară pentru elevi și părinți.",
  },
  {
    icon: ClipboardList,
    title: "Condică (Profesor)",
    description:
      "Evidență pentru orele predate: dată, clasă, disciplină și status (predată/anulată/suplinire).",
  },
  {
    icon: Calendar,
    title: "Calendar Școlar",
    description: "Vacanțe, teste, evenimente — toate într-un calendar ușor de consultat.",
  },
  {
    icon: BookOpen,
    title: "Materiale și Resurse",
    description:
      "Profesorii pot atașa materiale (link-uri/documente) pe discipline, organizate pentru studiu.",
  },
  {
    icon: Users,
    title: "Comunicare",
    description:
      "Mesaje și notificări între profesori, elevi și părinți, cu trasabilitate și acces controlat.",
  },
  {
    icon: FileText,
    title: "Rapoarte și Export",
    description:
      "Rapoarte print-ready și export CSV pentru situații pe elev/clasă și pentru condică.",
  },
];

const FeaturesSection = () => {
  return (
    <section id="features" className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Tot ce ai nevoie pentru școală
          </h2>
          <p className="text-lg text-muted-foreground">
            O platformă completă pentru evidență, comunicare și rapoarte, fără promisiuni
            „magice”.
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
              <h3 className="text-xl font-semibold text-foreground mb-2">{feature.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
