import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BookOpen,
  Mail,
  Lock,
  Eye,
  EyeOff,
  GraduationCap,
  Users,
  UserCircle,
  User,
  Phone,
  Key,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth, AppRole } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

type FormErrors = Partial<
  Record<"email" | "password" | "fullName" | "activationCode" | "staffCode", string>
>;

const STAFF_SIGNUP_CODE = import.meta.env.VITE_STAFF_SIGNUP_CODE as string | undefined;

const emailSchema = z.string().email("Email invalid");
const passwordSchema = z.string().min(6, "Parola trebuie să aibă cel puțin 6 caractere");

const routeMap: Record<AppRole, string> = {
  student: "/dashboard",
  parent: "/parent",
  teacher: "/teacher",
  homeroom_teacher: "/homeroom",
  secretariat: "/secretariat",
  director: "/director",
  uat_admin: "/admin",
};

const normalizeActivationCode = (v: string) =>
  v.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

// În unele contexte (iframe sandbox / privacy mode), localStorage poate arunca DOMException.
const safeStorageGet = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeStorageSet = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
};

export default function Auth() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signIn, signUp, user, loading, activeRole } = useAuth();

  // Mode
  const [isLogin, setIsLogin] = useState(true);
  const [showActivation, setShowActivation] = useState(false);

  // Common
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Signup / Activation common fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  // Signup: only Parent or Teacher gated
  const [selectedRole, setSelectedRole] = useState<AppRole>("parent");
  const [staffCode, setStaffCode] = useState("");

  // Activation
  const [activationRole, setActivationRole] = useState<AppRole>("student");
  const [activationCode, setActivationCode] = useState("");

  // UX
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const isTeacherSignup = useMemo(
    () => !isLogin && !showActivation && selectedRole === "teacher",
    [isLogin, showActivation, selectedRole]
  );

  // Redirect dacă ești deja logat
  useEffect(() => {
    if (!loading && user) {
      const stored = (safeStorageGet("eduro.activeRole") as AppRole | null) ?? null;
      const role: AppRole = (stored ?? activeRole ?? "student") as AppRole;
      navigate(routeMap[role] ?? "/dashboard");
    }
  }, [user, loading, navigate, activeRole]);

  const validateCommonAuth = (): FormErrors => {
    const newErrors: FormErrors = {};

    try {
      emailSchema.parse(email);
    } catch (e) {
      if (e instanceof z.ZodError) newErrors.email = e.errors[0]?.message ?? "Email invalid";
      else newErrors.email = "Email invalid";
    }

    try {
      passwordSchema.parse(password);
    } catch (e) {
      if (e instanceof z.ZodError) newErrors.password = e.errors[0]?.message ?? "Parolă invalidă";
      else newErrors.password = "Parolă invalidă";
    }

    return newErrors;
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = validateCommonAuth();

    if (!isLogin && !showActivation && !fullName.trim()) {
      newErrors.fullName = "Numele este obligatoriu";
    }

    if (isTeacherSignup) {
      if (!STAFF_SIGNUP_CODE) {
        newErrors.staffCode = "Înscrierea cadrelor didactice este dezactivată (lipsește VITE_STAFF_SIGNUP_CODE)";
      } else if (!staffCode.trim()) {
        newErrors.staffCode = "Codul de invitație este obligatoriu";
      } else if (staffCode.trim() !== STAFF_SIGNUP_CODE) {
        newErrors.staffCode = "Cod de invitație incorect";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleActivateAccount = async () => {
    const code = normalizeActivationCode(activationCode);
    const newErrors: FormErrors = validateCommonAuth();

    if (!fullName.trim()) newErrors.fullName = "Numele este obligatoriu";
    if (!code) newErrors.activationCode = "Codul de activare este obligatoriu";

    if (Object.keys(newErrors).length) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      const { data: activation, error: fetchError } = await supabase
        .from("student_activations")
        .select("*")
        .eq("activation_code", code)
        .eq("is_used", false)
        .single();

      if (fetchError || !activation) {
        toast({
          title: "Cod invalid",
          description: "Codul de activare nu este valid sau a fost deja folosit.",
          variant: "destructive",
        });
        return;
      }

      if (activation.expires_at && new Date(activation.expires_at) < new Date()) {
        toast({
          title: "Cod expirat",
          description: "Codul de activare a expirat. Contactează secretariatul.",
          variant: "destructive",
        });
        return;
      }

      // Creează contul (rol = elev/părinte în funcție de activare)
      const { error: signUpError } = await signUp(
        email,
        password,
        fullName,
        activationRole,
        phone.trim() || null
      );
      if (signUpError) {
        toast({ title: "Eroare", description: signUpError.message, variant: "destructive" });
        return;
      }

      // Autentifică imediat (dacă e permis)
      const { error: signInError } = await signIn(email, password);
      if (signInError) {
        toast({
          title: "Confirmare necesară",
          description:
            "Contul a fost creat. Dacă ai confirmare pe email activată, confirmă emailul apoi autentifică-te și reîncearcă activarea.",
        });
        return;
      }

      if (activationRole === "student") {
        const { error: rpcError } = await supabase.rpc("claim_student_activation", { _code: code });
        if (rpcError) throw rpcError;

        toast({
          title: "Cont elev activat",
          description: "Contul tău a fost legat de profilul elevului.",
        });
      } else if (activationRole === "parent") {
        const { error: rpcError } = await supabase.rpc("claim_parent_relation", {
          _code: code,
          _is_primary: true,
        });
        if (rpcError) throw rpcError;

        toast({
          title: "Cont părinte conectat",
          description: "Contul tău a fost legat de elev.",
        });
      }

      safeStorageSet("eduro.activeRole", activationRole);
      navigate(routeMap[activationRole] ?? "/dashboard");
    } catch (err: unknown) {
      const message =
        typeof err === "object" && err !== null && "message" in err
          ? String((err as { message?: unknown }).message ?? "")
          : "A apărut o eroare la activare.";

      toast({
        title: "Eroare",
        description: message || "A apărut o eroare la activare.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);
    setErrors({});

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          const isInvalid = error.message?.toLowerCase().includes("invalid login credentials");
          toast({
            title: "Eroare de autentificare",
            description: isInvalid ? "Email sau parolă incorectă." : error.message,
            variant: "destructive",
          });
          return;
        }

        toast({ title: "Autentificare reușită", description: "Bine ai venit!" });

        // Nu alegem rol din UI; rolul vine din profil/permisiuni.
        navigate("/dashboard");
        return;
      }

      // Signup (părinte sau teacher gated)
      const { error: signUpError } = await signUp(
        email,
        password,
        fullName,
        selectedRole,
        phone.trim() || null
      );

      if (signUpError) {
        const msg = signUpError.message || "Înregistrare eșuată.";
        const isExisting = msg.toLowerCase().includes("already");
        toast({
          title: isExisting ? "Cont existent" : "Eroare",
          description: isExisting
            ? "Există deja un cont cu acest email. Încearcă să te autentifici."
            : msg,
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Cont creat cu succes", description: "Te-ai înregistrat cu succes!" });
      safeStorageSet("eduro.activeRole", selectedRole);
      navigate(routeMap[selectedRole] ?? "/dashboard");
    } catch (err: unknown) {
      const message =
        typeof err === "object" && err !== null && "message" in err
          ? String((err as { message?: unknown }).message ?? "")
          : "A apărut o eroare.";

      toast({
        title: "Eroare",
        description: message || "A apărut o eroare.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-hero flex">
      {/* Left */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <Link to="/" className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-lg">
              <BookOpen className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold text-foreground">EduRO</span>
          </Link>

          <h1 className="text-3xl font-bold text-foreground mb-2">
            {isLogin ? "Bine ai revenit!" : showActivation ? "Activare cont" : "Creează un cont"}
          </h1>

          <p className="text-muted-foreground mb-8">
            {isLogin
              ? "Autentifică-te pentru a accesa catalogul"
              : showActivation
              ? "Introdu codul primit de la secretariat"
              : "Înregistrează-te pentru a accesa catalogul"}
          </p>

          {!isLogin && (
            <Tabs defaultValue="register" className="mb-6">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="register" onClick={() => setShowActivation(false)}>
                  Înregistrare
                </TabsTrigger>
                <TabsTrigger value="activate" onClick={() => setShowActivation(true)}>
                  Activare cont
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          {isLogin ? (
            // LOGIN
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
                    autoComplete="email"
                  />
                </div>
                {errors.email && <p className="text-sm text-destructive mt-1">{errors.email}</p>}
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
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Ascunde parola" : "Afișează parola"}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {errors.password && <p className="text-sm text-destructive mt-1">{errors.password}</p>}
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded border-border" />
                  <span className="text-sm text-muted-foreground">Ține-mă minte</span>
                </label>
                <a href="#" className="text-sm text-primary hover:underline">
                  Ai uitat parola?
                </a>
              </div>

              <Button type="submit" variant="hero" size="lg" className="w-full" disabled={isLoading}>
                {isLoading ? "Se procesează..." : "Autentificare"}
              </Button>
            </form>
          ) : showActivation ? (
            // ACTIVARE
            <div className="space-y-4">
              <div>
                <Label htmlFor="fullName">Nume complet</Label>
                <div className="relative mt-1">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="Ion Popescu"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="pl-10"
                    autoComplete="name"
                  />
                </div>
                {errors.fullName && <p className="text-sm text-destructive mt-1">{errors.fullName}</p>}
              </div>

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
                    autoComplete="email"
                  />
                </div>
                {errors.email && <p className="text-sm text-destructive mt-1">{errors.email}</p>}
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
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Ascunde parola" : "Afișează parola"}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {errors.password && <p className="text-sm text-destructive mt-1">{errors.password}</p>}
              </div>

              <div>
                <Label className="text-sm text-muted-foreground mb-3 block">Tip activare</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setActivationRole("student")}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      activationRole === "student"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <GraduationCap className="w-5 h-5" />
                      <span className="font-medium">Elev</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActivationRole("parent")}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      activationRole === "parent"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <UserCircle className="w-5 h-5" />
                      <span className="font-medium">Părinte</span>
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <Label htmlFor="phone">Număr de telefon (opțional)</Label>
                <div className="relative mt-1">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="07xx xxx xxx"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="pl-10"
                    autoComplete="tel"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="activationCode">Cod de activare</Label>
                <div className="relative mt-1">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="activationCode"
                    type="text"
                    placeholder="XXXXXXXX"
                    value={activationCode}
                    onChange={(e) => setActivationCode(normalizeActivationCode(e.target.value))}
                    className="pl-10 uppercase"
                    maxLength={8}
                    autoComplete="one-time-code"
                  />
                </div>
                {errors.activationCode && <p className="text-sm text-destructive mt-1">{errors.activationCode}</p>}
              </div>

              <Button
                variant="hero"
                size="lg"
                className="w-full"
                disabled={isLoading}
                onClick={handleActivateAccount}
              >
                {isLoading ? "Se procesează..." : "Activează contul"}
              </Button>

              <Button variant="ghost" className="w-full" onClick={() => setShowActivation(false)}>
                Înapoi la înregistrare
              </Button>
            </div>
          ) : (
            // SIGNUP
            <>
              <div className="mb-6">
                <Label className="text-sm text-muted-foreground mb-3 block">Tip cont</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedRole("parent")}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                      selectedRole === "parent"
                        ? "border-green-500 bg-green-500/5"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <UserCircle
                      className={`w-6 h-6 ${
                        selectedRole === "parent" ? "text-green-600" : "text-muted-foreground"
                      }`}
                    />
                    <span className="font-medium">Părinte</span>
                    <span className="text-xs text-muted-foreground text-center">Acces la situația copiilor</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedRole("teacher")}
                    disabled={!STAFF_SIGNUP_CODE}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                      selectedRole === "teacher"
                        ? "border-accent bg-accent/5"
                        : "border-border hover:border-muted-foreground/30"
                    } ${!STAFF_SIGNUP_CODE ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    <Users
                      className={`w-6 h-6 ${
                        selectedRole === "teacher" ? "text-accent" : "text-muted-foreground"
                      }`}
                    />
                    <span className="font-medium">Cadru didactic</span>
                    <span className="text-xs text-muted-foreground text-center">Doar cu invitație</span>
                  </button>
                </div>

                {isTeacherSignup && (
                  <div className="mt-4 space-y-2">
                    <Label htmlFor="staffCode">Cod invitație</Label>
                    <div className="relative">
                      <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="staffCode"
                        value={staffCode}
                        onChange={(e) => setStaffCode(e.target.value)}
                        placeholder="Cod primit de la școală"
                        className={`pl-10 ${errors.staffCode ? "border-destructive" : ""}`}
                        autoComplete="off"
                      />
                    </div>
                    {errors.staffCode && <p className="text-xs text-destructive">{errors.staffCode}</p>}
                    {!STAFF_SIGNUP_CODE && (
                      <p className="text-xs text-muted-foreground">
                        Înscrierea cadrelor didactice este dezactivată (lipsește VITE_STAFF_SIGNUP_CODE).
                      </p>
                    )}
                  </div>
                )}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="fullName">Nume complet</Label>
                  <div className="relative mt-1">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="Ion Popescu"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="pl-10"
                      autoComplete="name"
                    />
                  </div>
                  {errors.fullName && <p className="text-sm text-destructive mt-1">{errors.fullName}</p>}
                </div>

                <div>
                  <Label htmlFor="phone">Număr de telefon (opțional)</Label>
                  <div className="relative mt-1">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="07xx xxx xxx"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="pl-10"
                      autoComplete="tel"
                    />
                  </div>
                </div>

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
                      autoComplete="email"
                    />
                  </div>
                  {errors.email && <p className="text-sm text-destructive mt-1">{errors.email}</p>}
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
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? "Ascunde parola" : "Afișează parola"}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-sm text-destructive mt-1">{errors.password}</p>}
                </div>

                <Button type="submit" variant="hero" size="lg" className="w-full" disabled={isLoading}>
                  {isLoading ? "Se procesează..." : "Creează cont"}
                </Button>
              </form>
            </>
          )}

          <p className="text-center text-sm text-muted-foreground mt-6">
            {isLogin ? "Nu ai cont?" : "Ai deja un cont?"}{" "}
            <button
              onClick={() => {
                setIsLogin((v) => !v);
                setShowActivation(false);
                setErrors({});
              }}
              className="text-primary hover:underline font-medium"
              type="button"
            >
              {isLogin ? "Înregistrează-te" : "Autentifică-te"}
            </button>
          </p>
        </div>
      </div>

      {/* Right */}
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
}
