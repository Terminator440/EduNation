import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Spinner } from "@/components/ui/spinner";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { validateInvitationCode, claimInvitation, getRoleLabelRo, type Invitation, type InvitationRole } from "@/lib/invitations";
import { checkLoginRateLimit, recordLoginAttempt } from "@/lib/rate-limit";

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

export default function Auth() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signIn, user, loading } = useAuth();

  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [invitationCode, setInvitationCode] = useState("");

  const [validatingCode, setValidatingCode] = useState(false);
  const [validatedInvitation, setValidatedInvitation] = useState<Invitation | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  // Validare cod în timp real (Debounce)
  useEffect(() => {
    if (!isLogin && invitationCode.length >= 8) {
      const timer = setTimeout(async () => {
        setValidatingCode(true);
        const result = await validateInvitationCode(invitationCode);
        if (result.valid && result.invitation) {
          setValidatedInvitation(result.invitation);
          setCodeError(null);
        } else {
          setValidatedInvitation(null);
          setCodeError(result.error || "Cod invalid");
        }
        setValidatingCode(false);
      }, 600);
      return () => clearTimeout(timer);
    } else if (invitationCode.length < 8) {
      setValidatedInvitation(null);
      setCodeError(null);
    }
  }, [invitationCode, isLogin]);

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    if (!validatedInvitation) {
      toast({
        title: "Eroare",
        description: "Te rog să introduci un cod de invitație valid.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const role = validatedInvitation.role as AppRole;

      // Prefer invitation data (saved at generate) over form input for name/phone/email
      const invFirstName = validatedInvitation.first_name;
      const invLastName = validatedInvitation.last_name;
      const invEmail = validatedInvitation.invited_email;
      const invPhone = validatedInvitation.invited_phone;
      const invStudentNumber = validatedInvitation.invited_student_number;

      const resolvedFullName =
        invFirstName != null && invLastName != null
          ? `${invFirstName.trim()} ${invLastName.trim()}`.trim()
          : fullName.trim() || "Utilizator";
      const resolvedEmail = (invEmail && invEmail.trim()) || email;
      const resolvedPhone = (invPhone && invPhone.trim()) || (phone && phone.trim()) || null;

      // 1. Sign Up în Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: resolvedEmail,
        password,
        options: {
          data: {
            full_name: resolvedFullName,
            role,
            phone: resolvedPhone,
          },
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("Eroare la crearea userului.");

      // 2. Claim Invitație via RPC (returns invitation data for profile/student)
      const claimResult = await claimInvitation(invitationCode, authData.user.id);
      if (!claimResult.success) throw new Error(claimResult.error_message || "Eroare la activarea invitației");

      const claimFullName =
        claimResult.first_name != null && claimResult.last_name != null
          ? `${claimResult.first_name} ${claimResult.last_name}`.trim()
          : resolvedFullName;
      const claimPhone = (claimResult.invited_phone && claimResult.invited_phone.trim()) || resolvedPhone;
      const rawStudentNum = claimResult.invited_student_number ?? invStudentNumber ?? null;
      const claimStudentNumber = rawStudentNum != null ? String(rawStudentNum) : null;

      // 3. Update Profil: school_id, full_name, phone from invitation
      const profileUpdates: { school_id?: string; full_name?: string; phone?: string | null } = {};
      if (claimResult.school_id) profileUpdates.school_id = claimResult.school_id;
      profileUpdates.full_name = claimFullName;
      profileUpdates.phone = claimPhone;

      const { error: profileError } = await supabase
        .from("profiles")
        .update(profileUpdates)
        .eq("id", authData.user.id);
      if (profileError) console.error("Profile update error:", profileError);

      // 4. Logica specifică rolului (Student/Parent)
      if (role === "student" && claimResult.class_id) {
        type StudentInsert = {
          user_id: string;
          class_id: string;
          full_name: string;
          student_number: number | null;
        };
        await supabase.from("students").insert({
          user_id: authData.user.id,
          class_id: claimResult.class_id,
          full_name: claimFullName,
          student_number: typeof claimStudentNumber === "number" ? claimStudentNumber : null,
        } as StudentInsert);
      }

      if (role === "parent" && claimResult.student_id) {
        await supabase.from("parent_student_relations").insert({
          parent_user_id: authData.user.id,
          student_id: claimResult.student_id,
        });
      }

      toast({
        title: "Cont creat!",
        description: `Înregistrat cu succes ca ${getRoleLabelRo(role as InvitationRole)}`,
      });

      navigate(routeMap[role] || "/dashboard");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "A apărut o eroare la înregistrare";
      toast({
        title: "Eroare",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    const identifier = email.trim().toLowerCase();
    if (!identifier) return;

    const allowed = await checkLoginRateLimit(identifier);
    if (!allowed) {
      toast({
        title: "Prea multe încercări",
        description: "Vă rugăm încercați din nou în 15 minute.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await signIn(email, password);
      if (error) {
        await recordLoginAttempt(identifier, false);
        toast({
          title: "Eroare la autentificare",
          description: "Email sau parolă incorectă.",
          variant: "destructive",
        });
      } else {
        await recordLoginAttempt(identifier, true);
      }
    } catch (err: unknown) {
      await recordLoginAttempt(identifier, false);
      const msg = err instanceof Error ? err.message : "A apărut o eroare neașteptată.";
      toast({ title: "Eroare", description: msg, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  // Redirecționare automată dacă userul este deja logat
  useEffect(() => {
    if (user && !loading) {
      navigate("/dashboard");
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Spinner size="lg" className="w-8 h-8 text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      <div className="flex-1 flex flex-col justify-center px-8 lg:px-24">
        <div className="max-w-md w-full mx-auto">
          <div className="flex justify-center mb-8">
            <img src="/logo.png" alt="EduNation - Igniting Minds, Building Futures" className="h-20 w-auto" />
          </div>
          <h2 className="text-3xl font-bold mb-6">
            {isLogin ? "Autentificare" : "Creează Cont"}
          </h2>

          <form onSubmit={isLogin ? handleLogin : handleSignup} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="invitation-code">Cod Invitație</Label>
                <div className="relative">
                  <Input
                    id="invitation-code"
                    value={invitationCode}
                    onChange={(e) => setInvitationCode(e.target.value.toUpperCase())}
                    placeholder="COD-12345"
                    maxLength={20}
                    className={
                      codeError
                        ? "border-red-500"
                        : validatedInvitation
                        ? "border-green-500"
                        : ""
                    }
                    required
                  />
                  {validatingCode && (
                    <Spinner size="sm" className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                {codeError && <p className="text-xs text-red-500">{codeError}</p>}
                {validatedInvitation && (
                  <p className="text-xs text-green-600 font-medium">
                    ✓ Valid: {getRoleLabelRo(validatedInvitation.role)}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="exemplu@email.com"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Parolă</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {!isLogin && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="full-name">Nume Complet</Label>
                  <Input
                    id="full-name"
                    value={
                      validatedInvitation?.first_name != null && validatedInvitation?.last_name != null
                        ? `${validatedInvitation.first_name} ${validatedInvitation.last_name}`.trim()
                        : fullName
                    }
                    onChange={(e) => {
                      const isLocked =
                        (validatedInvitation?.role === "student" || validatedInvitation?.role === "parent") &&
                        validatedInvitation?.first_name != null &&
                        validatedInvitation?.last_name != null;
                      if (!isLocked) setFullName(e.target.value);
                    }}
                    placeholder="Popescu Ion"
                    required
                    readOnly={
                      (validatedInvitation?.role === "student" || validatedInvitation?.role === "parent") &&
                      validatedInvitation?.first_name != null &&
                      validatedInvitation?.last_name != null
                    }
                    className={
                      (validatedInvitation?.role === "student" || validatedInvitation?.role === "parent") &&
                      validatedInvitation?.first_name != null &&
                      validatedInvitation?.last_name != null
                        ? "bg-muted cursor-not-allowed"
                        : ""
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Telefon</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={
                      (validatedInvitation?.role === "student" || validatedInvitation?.role === "parent") &&
                      validatedInvitation?.invited_phone
                        ? validatedInvitation.invited_phone
                        : phone
                    }
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="07xxxxxxxx"
                    readOnly={
                      (validatedInvitation?.role === "student" || validatedInvitation?.role === "parent") &&
                      !!validatedInvitation?.invited_phone
                    }
                    className={
                      (validatedInvitation?.role === "student" || validatedInvitation?.role === "parent") &&
                      !!validatedInvitation?.invited_phone
                        ? "bg-muted cursor-not-allowed"
                        : ""
                    }
                  />
                </div>
              </>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || (!isLogin && !validatedInvitation)}
            >
              {isLoading ? (
                <>
                  <Spinner size="sm" className="w-4 h-4 mr-2 text-current" />
                  Se procesează...
                </>
              ) : isLogin ? (
                "Intră în cont"
              ) : (
                "Înregistrare"
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                // Resetare stare
                setEmail("");
                setPassword("");
                setFullName("");
                setPhone("");
                setInvitationCode("");
                setValidatedInvitation(null);
                setCodeError(null);
              }}
              className="text-sm text-primary hover:underline"
            >
              {isLogin ? "Nu ai cont? Înregistrează-te" : "Ai deja cont? Autentifică-te"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}