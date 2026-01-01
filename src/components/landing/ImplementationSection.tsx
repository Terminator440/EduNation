import { Upload, Users, Headphones, ArrowRight } from "lucide-react";

const steps = [
  {
    number: "1",
    icon: Upload,
    title: "Import date",
    description: "Preluăm structura școlii, clasele și utilizatorii existenți.",
  },
  {
    number: "2",
    icon: Users,
    title: "Training & configurare",
    description: "Profesorii și conducerea primesc instruire clară, pas cu pas.",
  },
  {
    number: "3",
    icon: Headphones,
    title: "Suport continuu",
    description: "Asistență tehnică și suport dedicat, fără întreruperi.",
  },
];

const ImplementationSection = () => {
  return (
    <section id="implementation" className="py-24 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Digitalizarea școlii în 3 pași simpli
          </h2>
          <p className="text-lg text-muted-foreground">
            Trecerea de la catalogul clasic la digital se face rapid și controlat.
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, index) => (
              <div key={step.number} className="relative">
                <div className="text-center">
                  <div className="relative inline-flex">
                    <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                      <step.icon className="w-10 h-10 text-primary" />
                    </div>
                    <span className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                      {step.number}
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">{step.title}</h3>
                  <p className="text-muted-foreground">{step.description}</p>
                </div>
                
                {/* Arrow between steps */}
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-10 -right-4 transform translate-x-1/2">
                    <ArrowRight className="w-8 h-8 text-primary/30" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ImplementationSection;
