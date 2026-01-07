import { useEffect, useState, useCallback, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BookOpen,
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  Phone,
  Key,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import {
  validateInvitationCode,
  claimInvitation,
  getRoleLabelRo,
  type Invitation,
} from "@/lib/invitations";

type FormErrors = Partial<
  Record<"email" | "password" | "fullName" | "invitationCode", string>
>;

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
  developer: "/developer",
};

const normalizeInvitationCode = (v: string) =>
  v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

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
  const { signIn, user, loading, activeRole } = useAuth();

  // Mode
  const [isLogin, setIsLogin] = useState(true);

  // Common fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Signup fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [invitationCode, setInvitationCode] = useState("");

  // Invitation validation
  const [validatingCode, setValidatingCode] = useState(false);
  const [validatedInvitation, setValidatedInvitation] = useState<Invitation | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  // UX
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && user) {
      const stored = safeStorageGet("edunation.activeRole") as AppRole | null;
      const role: AppRole = (stored ?? activeRole ?? "student") as AppRole;
      navigate(routeMap[role] ?? "/dashboard");
    }
  }, [user, loading, navigate, activeRole]);

  // Validate invitation code with debounce
  const validateCode = useCallback(async (code: string) => {
    const normalized = normalizeInvitationCode(code);
    if (normalized.length < 8) {
      setValidatedInvitation(null);
      setCodeError(null);
      return;
    }

    setValidatingCode(true);
    const result = await validateInvitationCode(normalized);
    setValidatingCode(false);

    if (result.valid && result.invitation) {
      setValidatedInvitation(result.invitation);
      setCodeError(null);
    } else {
      setValidatedInvitation(null);
      setCodeError(result.error || "Cod invalid");
    }
  }, []);

  useEffect(() => {
    if (!isLogin && invitationCode.length >= 8) {
      const timer = setTimeout(() => validateCode(invitationCode), 500);
      return () => clearTimeout(timer);
    } else {
      setValidatedInvitation(null);
      setCodeError(null);
    }
  }, [invitationCode, isLogin, validateCode]);

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

  const validateSignupForm = (): boolean => {
    const newErrors: FormErrors = validateCommonAuth();

    if (!fullName.trim()) {
      newErrors.fullName = "Numele este obligatoriu";
    }

    if (!invitationCode.trim()) {
      newErrors.invitationCode = "Codul de invitație este obligatoriu";
    } else if (!validatedInvitation) {
      newErrors.invitationCode = codeError || "Codul de invitație nu este valid";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    
    const newErrors = validateCommonAuth();
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setIsLoading(true);

    try {
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
      navigate("/dashboard");
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

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    if (!validateSignupForm()) return;
    if (!validatedInvitation) return;

    setIsLoading(true);

    try {
      const normalizedCode = normalizeInvitationCode(invitationCode);
      const role = validatedInvitation.role as AppRole;

      // Create user account
      const redirectUrl = `${window.location.origin}/`;
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName,
            role,
            phone: phone || null,
          },
        },
      });

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

      const userId = signUpData.user?.id;
      if (!userId) {
        toast({
          title: "Eroare",
          description: "Nu s-a putut crea contul. Încearcă din nou.",
          variant: "destructive",
        });
        return;
      }

      // Claim the invitation
      const claimResult = await claimInvitation(normalizedCode, userId);

      if (!claimResult.success) {
        toast({
          title: "Eroare la validarea invitației",
          description: claimResult.error_message || "Codul nu mai este valid.",
          variant: "destructive",
        });
        return;
      }

      // Update user profile with school_id
      if (claimResult.school_id) {
        await supabase
          .from("profiles")
          .update({ school_id: claimResult.school_id })
          .eq("id", userId);
      }

      // For students, link to class
      if (role === "student" && claimResult.class_id) {
        // Check if student record exists and update, or create new
        const { data: existingStudent } = await supabase
          .from("students")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();

        if (!existingStudent) {
          await supabase.from("students").insert({
            user_id: userId,
            class_id: claimResult.class_id,
            full_name: fullName,
            is_active: true,
          });
        }
      }

      // For parents, create relation to student
      if (role === "parent" && claimResult.student_id) {
        await supabase.from("parent_student_relations").insert({
          parent_user_id: userId,
          student_id: claimResult.student_id,
          is_primary: true,
        });
      }

      toast({
        title: "Cont creat cu succes!",
        description: `Te-ai înregistrat ca ${getRoleLabelRo(role)}.`,
      });

      safeStorageSet("edunation.activeRole", role);
      navigate(routeMap[role] ?? "/dashboard");
    } catch (err: unknown) {
      console.error("Signup error:", err);
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
            <span className="text-2xl font-bold text-foreground">EduNation</span>
          </Link>

          <h1 className="text-3xl font-bold text-foreground mb-2">
            {isLogin ? "Bine ai revenit!" : "Creează un cont"}
          </h1>

          <p className="text-muted-foreground mb-8">
            {isLogin
              ? "Autentifică-te pentru a accesa catalogul"
              : "Înregistrează-te cu codul primit de la administrator"}
          </p>

          {isLogin ? (
            // LOGIN FORM
            <form onSubmit={handleLogin} className="space-y-4">
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
          ) : (
            // SIGNUP FORM
            <form onSubmit={handleSignup} className="space-y-4">
              {/* Invitation Code - FIRST AND MANDATORY */}
              <div>
                <Label htmlFor="invitationCode">Cod de invitație *</Label>
                <div className="relative mt-1">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="invitationCode"
                    type="text"
                    placeholder="XXXXXXXXXXXX"
                    value={invitationCode}
                    onChange={(e) => setInvitationCode(normalizeInvitationCode(e.target.value))}
                    className={`pl-10 pr-10 uppercase font-mono tracking-wider ${
                      errors.invitationCode || codeError ? "border-destructive" : ""
                    } ${validatedInvitation ? "border-green-500" : ""}`}
                    maxLength={12}
                    autoComplete="one-time-code"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {validatingCode && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
                  </div>
                </div>
                {(errors.invitationCode || codeError) && (
                  <p className="text-sm text-destructive mt-1">{errors.invitationCode || codeError}</p>
                )}
                {validatedInvitation && (
                  <div className="mt-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <p className="text-sm text-green-700 dark:text-green-400 font-medium">
                      ✓ Cod valid pentru rol: {getRoleLabelRo(validatedInvitation.role as any)}
                    </p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Codul de 12 caractere primit de la administrator. Fără cod nu te poți înregistra.
                </p>
              </div>

              <div>
                <Label htmlFor="fullName">Nume complet *</Label>
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
                <Label htmlFor="phone">Telefon (opțional)</Label>
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
                <Label htmlFor="email">Email *</Label>
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
                <Label htmlFor="password">Parolă *</Label>
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

              <Button
                type="submit"
                variant="hero"
                size="lg"
                className="w-full"
                disabled={isLoading || !validatedInvitation}
              >
                {isLoading ? "Se procesează..." : "Creează cont"}
              </Button>
            </form>
          )}

          <p className="text-center text-sm text-muted-foreground mt-6">
            {isLogin ? "Nu ai cont?" : "Ai deja un cont?"}{" "}
            <button
              onClick={() => {
                setIsLogin((v) => !v);
                setErrors({});
                setInvitationCode("");
                setValidatedInvitation(null);
                setCodeError(null);
              }}
              className="text-primary hover:underline font-medium"
              type="button"
            >
              {isLogin ? "Înregistrează-te" : "Autentifică-te"}
            </button>
          </p>

          {!isLogin && (
            <p className="text-center text-xs text-muted-foreground mt-4">
              Nu ai un cod? Contactează administratorul școlii sau dirigintele clasei.
            </p>
          )}
        </div>
      </div>

      {/* Right */}
      <div className="hidden lg:flex flex-1 bg-gradient-primary items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OSA0IDQgNCA0LTEuNzkgNC00eiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />
        <div className="relative z-10 text-center text-primary-foreground max-w-md">
          <div className="w-24 h-24 rounded-3xl bg-primary-foreground/20 flex items-center justify-center mx-auto mb-8 animate-float">
            <BookOpen className="w-12 h-12" />
          </div>
          <h2 className="text-3xl font-bold mb-4">EduNation – catalog digital școlar</h2>
          <p className="text-primary-foreground/80 text-lg leading-relaxed">
            Tot ce ai nevoie pentru un an școlar organizat: note, absențe, calendar, condică și comunicare.
          </p>
        </div>
      </div>
    </div>
  );
}