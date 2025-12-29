import { ShieldCheck, Layers, CheckCircle2, ListChecks } from "lucide-react";

const principles = [
  {
    icon: Layers,
    title: "O singură sursă de adevăr",
    description:
      "Elevi, părinți și profesori văd aceleași informații, fără duplicate și fără versiuni paralele în grupuri sau foi.",
  },
  {
    icon: ListChecks,
    title: "Fluxuri clare, pe roluri",
    description:
      "Fiecare utilizator vede doar ce are nevoie: mai puțină confuzie, mai puține greșeli, mai mult timp salvat.",
  },
  {
    icon: CheckCircle2,
    title: "Trasabilitate și responsabilitate",
    description:
      "Modificările sunt urmărite și explicabile. Când apare o întrebare, există istoric — nu presupuneri.",
  },
  {
    icon: ShieldCheck,
    title: "Date protejate",
    description:
      "Acces controlat și bune practici de securitate. Datele elevilor nu sunt „conținut social”, ci informații sensibile.",
  },
];

const PrinciplesSection = () => {
  return (
    <section id="why" className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">De ce EduNation</h2>
          <p className="text-lg text-muted-foreground">
            Nu promitem magie. Promitem claritate: fluxuri simple, informații consecvente și date protejate.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {principles.map((p, index) => (
            <div
              key={p.title}
              className="group p-6 rounded-2xl bg-card border border-border hover:border-primary/30 hover:shadow-lg transition-all duration-300"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <p.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">{p.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{p.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PrinciplesSection;
