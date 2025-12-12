import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Mail, Lock, Eye, EyeOff, GraduationCap, Users, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type UserRole = "student" | "teacher" | "parent";

const roleInfo = {
  student: { label: "Elev", icon: GraduationCap, color: "primary" },
  teacher: { label: "Profesor", icon: Users, color: "accent" },
  parent: { label: "Părinte", icon: UserCircle, color: "success" },
};

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>("student");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Simulate login
    setTimeout(() => {
      setIsLoading(false);
      toast({
        title: "Autentificare reușită",
        description: `Bine ai venit! Ești conectat ca ${roleInfo[selectedRole].label}.`,
      });
      navigate("/dashboard");
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-gradient-hero flex">
      {/* Left side - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-lg">
              <BookOpen className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold text-foreground">EduCatalog</span>
          </Link>

          {/* Heading */}
          <h1 className="text-3xl font-bold text-foreground mb-2">Bine ai revenit!</h1>
          <p className="text-muted-foreground mb-8">Autentifică-te pentru a accesa catalogul</p>

          {/* Role selector */}
          <div className="mb-6">
            <Label className="text-sm text-muted-foreground mb-3 block">Selectează rolul</Label>
            <div className="grid grid-cols-3 gap-3">
              {(Object.entries(roleInfo) as [UserRole, typeof roleInfo.student][]).map(([role, info]) => {
                const Icon = info.icon;
                const isSelected = selectedRole === role;
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setSelectedRole(role)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                      isSelected
                        ? info.color === "primary"
                          ? "border-primary bg-primary/5"
                          : info.color === "accent"
                          ? "border-accent bg-accent/5"
                          : "border-success bg-success/5"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <Icon className={`w-6 h-6 ${
                      isSelected
                        ? info.color === "primary"
                          ? "text-primary"
                          : info.color === "accent"
                          ? "text-accent"
                          : "text-success"
                        : "text-muted-foreground"
                    }`} />
                    <span className={`text-sm font-medium ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>
                      {info.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="nume@scoala.ro"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="password">Parolă</Label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded border-border" />
                <span className="text-sm text-muted-foreground">Ține-mă minte</span>
              </label>
              <a href="#" className="text-sm text-primary hover:underline">Ai uitat parola?</a>
            </div>

            <Button type="submit" variant="hero" size="lg" className="w-full" disabled={isLoading}>
              {isLoading ? "Se conectează..." : "Autentificare"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Nu ai cont?{" "}
            <a href="#" className="text-primary hover:underline font-medium">Contactează școala</a>
          </p>
        </div>
      </div>

      {/* Right side - Decoration */}
      <div className="hidden lg:flex flex-1 bg-gradient-primary items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OSA0IDQgNCA0LTEuNzkgNC00eiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />
        
        <div className="relative z-10 text-center text-primary-foreground max-w-md">
          <div className="w-24 h-24 rounded-3xl bg-primary-foreground/20 flex items-center justify-center mx-auto mb-8 animate-float">
            <BookOpen className="w-12 h-12" />
          </div>
          <h2 className="text-3xl font-bold mb-4">Catalogul care explică școala</h2>
          <p className="text-primary-foreground/80 text-lg leading-relaxed">
            Tot ce ai nevoie pentru un an școlar de succes: note, absențe, calendar, lecții și explicații clare.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
