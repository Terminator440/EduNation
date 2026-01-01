import { ShieldCheck, Lock, Eye, UserCheck, Building2 } from "lucide-react";

const trustPoints = [
  {
    icon: Lock,
    text: "Datele sunt stocate în infrastructură securizată",
  },
  {
    icon: UserCheck,
    text: "Accesul este controlat strict, pe bază de rol",
  },
  {
    icon: Eye,
    text: "Orice modificare este înregistrată și trasabilă",
  },
  {
    icon: ShieldCheck,
    text: "Nu folosim datele în scopuri comerciale",
  },
  {
    icon: Building2,
    text: "Platforma este concepută special pentru mediul educațional din România",
  },
];

const TrustSection = () => {
  return (
    <section id="trust" className="py-24 bg-card">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-6">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Datele școlii sunt protejate. Permanent.
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Platforma este construită respectând Regulamentul General privind Protecția Datelor (GDPR) și bunele practici de securitate IT.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {trustPoints.map((point, index) => (
              <div
                key={index}
                className="flex items-center gap-4 p-4 rounded-xl bg-background border border-border"
              >
                <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center flex-shrink-0">
                  <point.icon className="w-5 h-5 text-success" />
                </div>
                <span className="text-foreground">{point.text}</span>
              </div>
            ))}
          </div>

          <div className="mt-8 p-6 rounded-2xl bg-primary/5 border border-primary/20 text-center">
            <p className="text-foreground font-medium">
              👉 Siguranța datelor elevilor și profesorilor este prioritatea noastră.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default TrustSection;
