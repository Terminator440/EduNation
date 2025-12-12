import { BookOpen, Mail, Phone, MapPin } from "lucide-react";
import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer id="contact" className="bg-card border-t border-border py-16">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-foreground">EduCatalog</span>
            </Link>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Catalogul electronic care nu doar măsoară școala, ci o și explică.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Platformă</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/dashboard" className="text-muted-foreground hover:text-primary transition-colors text-sm">
                  Dashboard
                </Link>
              </li>
              <li>
                <a href="#features" className="text-muted-foreground hover:text-primary transition-colors text-sm">
                  Funcționalități
                </a>
              </li>
              <li>
                <a href="#benefits" className="text-muted-foreground hover:text-primary transition-colors text-sm">
                  Beneficii
                </a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Legal</h4>
            <ul className="space-y-2">
              <li>
                <a href="#" className="text-muted-foreground hover:text-primary transition-colors text-sm">
                  Termeni și condiții
                </a>
              </li>
              <li>
                <a href="#" className="text-muted-foreground hover:text-primary transition-colors text-sm">
                  Politica de confidențialitate
                </a>
              </li>
              <li>
                <a href="#" className="text-muted-foreground hover:text-primary transition-colors text-sm">
                  GDPR
                </a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Contact</h4>
            <ul className="space-y-3">
              <li className="flex items-center gap-2 text-muted-foreground text-sm">
                <Mail className="w-4 h-4" />
                contact@educatalog.ro
              </li>
              <li className="flex items-center gap-2 text-muted-foreground text-sm">
                <Phone className="w-4 h-4" />
                +40 700 000 000
              </li>
              <li className="flex items-center gap-2 text-muted-foreground text-sm">
                <MapPin className="w-4 h-4" />
                București, România
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-border mt-12 pt-8 text-center">
          <p className="text-muted-foreground text-sm">
            © {new Date().getFullYear()} EduCatalog. Toate drepturile rezervate.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
