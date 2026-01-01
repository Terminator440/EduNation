import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowRight, Send, FileText } from "lucide-react";
import { toast } from "sonner";

const LeadFormSection = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    school: "",
    phone: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate form submission
    await new Promise((resolve) => setTimeout(resolve, 1000));

    toast.success("Cererea a fost trimisă cu succes! Vă vom contacta în curând.");
    setFormData({ name: "", email: "", school: "", phone: "", message: "" });
    setIsSubmitting(false);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  return (
    <section id="demo" className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left side - Text */}
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                Sunteți pregătiți să digitalizați școala?
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                Discutați cu un consultant și descoperiți cum poate fi implementat catalogul digital în unitatea dumneavoastră.
              </p>
              
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-foreground">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Send className="w-5 h-5 text-primary" />
                  </div>
                  <span>Solicitați un demo personalizat</span>
                </div>
                <div className="flex items-center gap-3 text-foreground">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <span>Cereți o ofertă adaptată școlii dvs.</span>
                </div>
              </div>
            </div>

            {/* Right side - Form */}
            <div className="bg-card p-8 rounded-2xl border border-border shadow-lg">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="name">Nume și prenume *</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Ion Popescu"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="ion.popescu@scoala.ro"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="school">Unitatea de învățământ *</Label>
                  <Input
                    id="school"
                    name="school"
                    value={formData.school}
                    onChange={handleChange}
                    placeholder="Liceul Teoretic..."
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Telefon</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="07XX XXX XXX"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Mesaj (opțional)</Label>
                  <Textarea
                    id="message"
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="Spuneți-ne mai multe despre nevoile școlii..."
                    rows={3}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Se trimite..." : "Solicită demo gratuit"}
                  <ArrowRight className="w-4 h-4" />
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  Prin trimiterea formularului, sunteți de acord cu{" "}
                  <a href="#" className="text-primary hover:underline">
                    politica de confidențialitate
                  </a>
                  .
                </p>
              </form>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LeadFormSection;
