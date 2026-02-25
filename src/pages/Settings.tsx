import { useState, useEffect, useCallback, useTransition } from "react";
import { User, Bell, Shield, Palette, Sun, Moon, Lock, Info, FileDown, Trash2, Mail } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getSchoolName } from "@/features/schools/services/schools.service";
import { exportMyData, softDeleteMyAccount } from "@/lib/gdpr";
import { isDemoUser } from "@/lib/demo";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Roles that can edit their own Name, Surname, Phone. Students/Parents are read-only. */
const CAN_EDIT_PERSONAL_INFO: string[] = [
  "teacher", "homeroom_teacher", "secretariat", "director", "uat_admin", "developer",
];

const Settings = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  /** Tab selectat pentru feedback vizual instant (buton „apăsat”); conținutul trece în activeTab prin startTransition. */
  const [selectedTab, setSelectedTab] = useState("profile");
  const { activeRole, user, profile, refetchProfile } = useAuth();
  
  // Email din sesiunea Auth (sursa de adevăr)
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  
  useEffect(() => {
    const fetchAuthEmail = async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user?.email) {
        setAuthEmail(data.user.email);
      }
    };
    fetchAuthEmail();
  }, []);

  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });

  // Password form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordErrors, setPasswordErrors] = useState({
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const applyDark = stored === 'dark' || (stored !== 'light' && prefersDark);
    const id = requestAnimationFrame(() => {
      const root = document.documentElement;
      if (applyDark) {
        root.classList.add('dark');
        setIsDark(true);
      } else {
        root.classList.remove('dark');
        setIsDark(false);
      }
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const setTheme = (dark: boolean) => {
    requestAnimationFrame(() => {
      const root = document.documentElement;
      if (dark) {
        root.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        root.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
      setIsDark(dark);
    });
    toast({
      title: "Temă schimbată",
      description: `Tema ${dark ? 'întunecată' : 'luminoasă'} a fost aplicată.`,
    });
  };

  const [notifications, setNotifications] = useState({
    grades: true,
    attendance: true,
    events: true,
    messages: false,
  });

  const [gdprExporting, setGdprExporting] = useState(false);
  const [deleteAccountDialogOpen, setDeleteAccountDialogOpen] = useState(false);
  const [deleteAccountPending, setDeleteAccountPending] = useState(false);

  // Profile form (Name, Surname, Phone) - populated from profile
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  const canEditPersonalInfo = activeRole ? CAN_EDIT_PERSONAL_INFO.includes(activeRole) : false;

  // School and class labels (read-only, from invitation/signup data)
  const [schoolLabel, setSchoolLabel] = useState("");
  const [classLabel, setClassLabel] = useState("");

  useEffect(() => {
    if (!profile) return;
    const parts = (profile.full_name ?? "").trim().split(/\s+/);
    const first = parts[0] ?? "";
    const last = parts.slice(1).join(" ") ?? "";
    setFirstName(first);
    setLastName(last);
    setPhone(profile.phone ?? "");
  }, [profile]);

  useEffect(() => {
    if (!user || !profile) return;
    const loadSchoolAndClass = async () => {
      const schoolId = profile.school_id;
      if (schoolId) {
        const name = await getSchoolName(schoolId);
        setSchoolLabel(name);
      }
      if (!schoolId) return;

      const { data: student } = await supabase
        .from("students")
        .select("class_id, classes(name, year, section)")
        .eq("user_id", user.id)
        .eq("school_id", schoolId)
        .maybeSingle();
      const cls = (student as { classes?: { name: string; year: number; section: string } | null } | null)?.classes;
      if (cls) setClassLabel(`${cls.name} (${cls.year}${cls.section})`);
    };
    loadSchoolAndClass();
  }, [user?.id, profile?.school_id]);

  const handleSave = async () => {
    if (!user?.id) return;
    setProfileSaving(true);
    try {
      // FIX: Am adăugat paranteze pentru a separa operatorul || de ??
      const fullName = ([firstName.trim(), lastName.trim()].filter(Boolean).join(" ") || profile?.full_name) ?? "";
      
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName, phone: phone.trim() || null })
        .eq("id", user.id);
      if (error) throw error;
      await refetchProfile();
      toast({
        title: "Setări salvate",
        description: "Modificările au fost salvate cu succes.",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Nu s-au putut salva modificările.";
      toast({
        title: "Eroare",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setProfileSaving(false);
    }
  };

  // Password validation
  const validatePassword = () => {
    const errors = { newPassword: "", confirmPassword: "" };
    let isValid = true;

    if (!passwordForm.newPassword) {
      errors.newPassword = "Parola nouă este obligatorie";
      isValid = false;
    } else if (passwordForm.newPassword.length < 6) {
      errors.newPassword = "Parola trebuie să aibă cel puțin 6 caractere";
      isValid = false;
    }

    if (!passwordForm.confirmPassword) {
      errors.confirmPassword = "Confirmarea parolei este obligatorie";
      isValid = false;
    } else if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      errors.confirmPassword = "Parolele nu coincid";
      isValid = false;
    }

    setPasswordErrors(errors);
    return isValid;
  };

  const handlePasswordChange = () => {
    if (validatePassword()) {
      toast({
        title: "Parolă schimbată",
        description: "Parola a fost actualizată cu succes.",
      });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPasswordErrors({ newPassword: "", confirmPassword: "" });
    }
  };

  const isPasswordFormValid = 
    passwordForm.currentPassword.length > 0 &&
    passwordForm.newPassword.length >= 6 &&
    passwordForm.confirmPassword.length > 0 &&
    passwordForm.newPassword === passwordForm.confirmPassword;

  const tabs = [
    { id: "profile", label: "Profil", icon: User },
    { id: "notifications", label: "Notificări", icon: Bell },
    { id: "security", label: "Securitate", icon: Shield },
    { id: "gdpr", label: "Date și cont", icon: FileDown },
    { id: "appearance", label: "Aspect", icon: Palette },
    { id: "support", label: "Suport", icon: Mail },
  ];

  const handleTabChange = useCallback((tabId: string) => {
    setSelectedTab(tabId);
    startTransition(() => {
      setActiveTab(tabId);
    });
  }, []);

  const onToggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  const isDeveloper = activeRole === 'developer';

  return (
    <div className="min-h-screen w-full bg-background">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={onToggleSidebar} />
      
      <main className={cn(
        "w-full min-w-0 transition-all duration-300",
        "pt-14 md:pt-0", sidebarCollapsed ? "ml-0 md:ml-20" : "ml-0 md:ml-64"
      )}>
        <header className="w-full h-16 border-b border-border bg-card flex items-center px-4 sm:px-6 lg:px-8 sticky top-14 md:top-0 z-30">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Setări</h1>
            <p className="text-sm text-muted-foreground">Configurează-ți contul</p>
          </div>
        </header>

        <div className="w-full max-w-screen-xl mx-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-4xl">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
              {/* Tabs */}
              <div className="md:col-span-1">
                <nav className="space-y-1" role="tablist" aria-label="Secțiuni setări">
                  {tabs.map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => handleTabChange(tab.id)}
                      aria-selected={selectedTab === tab.id}
                      aria-busy={isPending && selectedTab === tab.id}
                      role="tab"
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors active:scale-[0.98]",
                        selectedTab === tab.id
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                      )}
                    >
                      <tab.icon className="w-5 h-5 shrink-0" />
                      <span className="font-medium">{tab.label}</span>
                      {isPending && selectedTab === tab.id && (
                        <Spinner size="sm" className="ml-auto h-4 w-4 text-primary-foreground" aria-hidden />
                      )}
                    </button>
                  ))}
                </nav>
              </div>

              {/* Content – actualizat cu prioritate scăzută (startTransition) ca UI-ul să rămână responsiv */}
              <div className="md:col-span-3" aria-busy={isPending} aria-live="polite">
                <div className={cn("bg-card rounded-2xl border border-border p-6 transition-opacity duration-150", isPending && "opacity-90")}>
                  <div role="tabpanel" aria-hidden={activeTab !== "profile"} className={cn(activeTab !== "profile" && "hidden")}>
                    <div className="space-y-6">
                      <div>
                        <h2 className="text-lg font-semibold text-foreground mb-4">Informații personale</h2>
                        <div className="flex items-center gap-6 mb-6">
                          <div className="w-20 h-20 rounded-full bg-gradient-primary flex items-center justify-center text-primary-foreground text-2xl font-bold">
                            {firstName.charAt(0)}{lastName.charAt(0)}
                          </div>
                          <Button variant="outline">Schimbă poza</Button>
                        </div>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="firstName">Prenume</Label>
                          <Input
                            id="firstName"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            disabled={!canEditPersonalInfo}
                            readOnly={!canEditPersonalInfo}
                            className={cn("mt-1", !canEditPersonalInfo && "bg-muted/50 cursor-not-allowed")}
                          />
                        </div>
                        <div>
                          <Label htmlFor="lastName">Nume</Label>
                          <Input
                            id="lastName"
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            disabled={!canEditPersonalInfo}
                            readOnly={!canEditPersonalInfo}
                            className={cn("mt-1", !canEditPersonalInfo && "bg-muted/50 cursor-not-allowed")}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <div className="flex items-center gap-2">
                            <Label htmlFor="email">Email</Label>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Email-ul este gestionat de sistemul de autentificare</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <div className="relative">
                            <Input 
                              id="email" 
                              type="email" 
                              value={authEmail || user?.email || "Email indisponibil"}
                              className="mt-1 w-full pr-10 bg-muted/50 text-muted-foreground cursor-not-allowed" 
                              disabled
                              readOnly
                            />
                            <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          </div>
                        </div>
                        <div className={isDeveloper ? "sm:col-span-2" : ""}>
                          <Label htmlFor="phone">Telefon</Label>
                          <div className="relative">
                            <Input
                              id="phone"
                              type="tel"
                              value={phone}
                              onChange={(e) => setPhone(e.target.value)}
                              disabled={!canEditPersonalInfo}
                              readOnly={!canEditPersonalInfo}
                              className={cn("mt-1", !canEditPersonalInfo && "bg-muted/50 cursor-not-allowed pr-10")}
                            />
                            {!canEditPersonalInfo && (
                              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {!isDeveloper && (
                        <>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Label htmlFor="school">Școala</Label>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Câmp informativ – se modifică doar de către administrație</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            <div className="relative">
                              <Input 
                                id="school" 
                                value={schoolLabel || "—"} 
                                className="mt-1 pr-10 bg-muted/50 text-muted-foreground cursor-not-allowed" 
                                disabled 
                                readOnly
                              />
                              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Label htmlFor="class">Clasa</Label>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Câmp informativ – se modifică doar de către administrație</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            <div className="relative">
                              <Input 
                                id="class" 
                                value={classLabel || "—"} 
                                className="mt-1 pr-10 bg-muted/50 text-muted-foreground cursor-not-allowed" 
                                disabled 
                                readOnly
                              />
                              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            </div>
                          </div>
                        </>
                      )}
                      
                      <div className="pt-4 border-t border-border">
                        <Button
                          variant="hero"
                          onClick={handleSave}
                          disabled={profileSaving || !canEditPersonalInfo}
                          className="w-full"
                        >
                          {profileSaving ? "Se salvează..." : "Salvează modificările"}
                        </Button>
                        {!canEditPersonalInfo && (
                          <p className="text-sm text-muted-foreground mt-2">
                            Informațiile personale (nume, prenume, telefon) sunt read-only. Doar personalul școlar le poate modifica.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div role="tabpanel" aria-hidden={activeTab !== "notifications"} className={cn(activeTab !== "notifications" && "hidden")}>
                    <div className="space-y-6">
                      <h2 className="text-lg font-semibold text-foreground mb-4">Preferințe notificări</h2>
                      <div className="space-y-4">
                        {[
                          { key: "grades", label: "Note noi", description: "Primește notificări când primești o notă nouă" },
                          { key: "attendance", label: "Prezență", description: "Alerte pentru absențe sau întârzieri" },
                          { key: "events", label: "Evenimente", description: "Reminder-uri pentru teste și evenimente" },
                          { key: "messages", label: "Mesaje", description: "Notificări pentru mesaje de la profesori" },
                        ].map(item => (
                          <div key={item.key} className="flex items-center justify-between p-4 rounded-xl bg-secondary/30">
                            <div>
                              <p className="font-medium text-foreground">{item.label}</p>
                              <p className="text-sm text-muted-foreground">{item.description}</p>
                            </div>
                            <Switch
                              checked={notifications[item.key as keyof typeof notifications]}
                              onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, [item.key]: checked }))}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="pt-4 border-t border-border">
                        <Button variant="hero" onClick={handleSave} className="w-full">
                          Salvează preferințele
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div role="tabpanel" aria-hidden={activeTab !== "security"} className={cn(activeTab !== "security" && "hidden")}>
                    <div className="space-y-6">
                      <h2 className="text-lg font-semibold text-foreground mb-4">Securitate cont</h2>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="currentPassword">Parola curentă</Label>
                          <Input 
                            id="currentPassword" 
                            type="password" 
                            className="mt-1" 
                            value={passwordForm.currentPassword}
                            onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="newPassword">Parola nouă</Label>
                          <Input 
                            id="newPassword" 
                            type="password" 
                            className={cn("mt-1", passwordErrors.newPassword && "border-destructive")}
                            value={passwordForm.newPassword}
                            onChange={(e) => {
                              setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }));
                              if (passwordErrors.newPassword) {
                                setPasswordErrors(prev => ({ ...prev, newPassword: "" }));
                              }
                            }}
                          />
                          {passwordErrors.newPassword && (
                            <p className="text-sm text-destructive mt-1">{passwordErrors.newPassword}</p>
                          )}
                        </div>
                        <div>
                          <Label htmlFor="confirmPassword">Confirmă parola</Label>
                          <Input 
                            id="confirmPassword" 
                            type="password" 
                            className={cn("mt-1", passwordErrors.confirmPassword && "border-destructive")}
                            value={passwordForm.confirmPassword}
                            onChange={(e) => {
                              setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }));
                              if (passwordErrors.confirmPassword) {
                                setPasswordErrors(prev => ({ ...prev, confirmPassword: "" }));
                              }
                            }}
                          />
                          {passwordErrors.confirmPassword && (
                            <p className="text-sm text-destructive mt-1">{passwordErrors.confirmPassword}</p>
                          )}
                        </div>
                      </div>
                      <div className="pt-4 border-t border-border">
                        <Button 
                          variant="hero" 
                          onClick={handlePasswordChange} 
                          className="w-full"
                          disabled={!isPasswordFormValid}
                        >
                          Schimbă parola
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div role="tabpanel" aria-hidden={activeTab !== "gdpr"} className={cn(activeTab !== "gdpr" && "hidden")}>
                    <div className="space-y-6">
                      <h2 className="text-lg font-semibold text-foreground mb-4">GDPR – Date personale și cont</h2>
                      <p className="text-sm text-muted-foreground">
                        Puteți exporta toate datele dvs. personale (profil, roluri, note, prezență) sau șterge contul (anonimizare date).
                      </p>
                      <div className="flex flex-col gap-4">
                        <Button
                          variant="outline"
                          onClick={async () => {
                            setGdprExporting(true);
                            try {
                              const data = await exportMyData();
                              const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                              const a = document.createElement("a");
                              a.href = URL.createObjectURL(blob);
                              a.download = `date_personale_${new Date().toISOString().slice(0, 10)}.json`;
                              a.click();
                              URL.revokeObjectURL(a.href);
                              toast({ title: "Export realizat", description: "Fișierul JSON a fost descărcat." });
                            } catch (e) {
                              toast({
                                title: "Eroare",
                                description: e instanceof Error ? e.message : "Export eșuat",
                                variant: "destructive",
                              });
                            } finally {
                              setGdprExporting(false);
                            }
                          }}
                          disabled={gdprExporting}
                        >
                          <FileDown className="w-4 h-4 mr-2" />
                          {gdprExporting ? "Se exportă..." : "Exportă datele mele (JSON)"}
                        </Button>
                        <div className="border border-destructive/50 rounded-lg p-4">
                          <p className="text-sm font-medium text-destructive mb-2">Zone de pericol</p>
                          <p className="text-sm text-muted-foreground mb-4">
                            Ștergerea contului anonimizează datele din profil. Nu puteți reveni la acest cont.
                          </p>
                          <Button
                            variant="destructive"
                            onClick={() => {
                              if (isDemoUser(authEmail ?? user?.email)) {
                                toast({
                                  title: "Cont demo",
                                  description: "Conturile demo nu pot fi șterse.",
                                  variant: "destructive",
                                });
                                return;
                              }
                              setDeleteAccountDialogOpen(true);
                            }}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Șterge contul
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <AlertDialog open={deleteAccountDialogOpen} onOpenChange={setDeleteAccountDialogOpen}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Șterge contul?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Contul va fi anonimizat (datele din profil vor fi șterse). Această acțiune nu poate fi anulată.
                          Veți fi deconectat după confirmare.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Anulează</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={async () => {
                            setDeleteAccountPending(true);
                            try {
                              await softDeleteMyAccount();
                              await supabase.auth.signOut();
                              toast({ title: "Cont șters", description: "Datele au fost anonimizate." });
                              setDeleteAccountDialogOpen(false);
                              window.location.href = "/";
                            } catch (e) {
                              toast({
                                title: "Eroare",
                                description: e instanceof Error ? e.message : "Ștergere eșuată",
                                variant: "destructive",
                              });
                            } finally {
                              setDeleteAccountPending(false);
                            }
                          }}
                          disabled={deleteAccountPending}
                        >
                          {deleteAccountPending ? "Se procesează..." : "Șterge contul"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <div role="tabpanel" aria-hidden={activeTab !== "appearance"} className={cn(activeTab !== "appearance" && "hidden")}>
                    <div className="space-y-6">
                      <h2 className="text-lg font-semibold text-foreground mb-4">Aspect aplicație</h2>
                      <div className="space-y-4">
                        <div className="p-4 rounded-xl bg-secondary/30">
                          <p className="font-medium text-foreground mb-2">Temă</p>
                          <p className="text-sm text-muted-foreground mb-4">
                            Alege între tema luminoasă și cea întunecată
                          </p>
                          <div className="flex gap-4">
                            <button 
                              onClick={() => setTheme(false)}
                              className={cn(
                                "flex-1 p-4 rounded-xl border-2 bg-card transition-all",
                                !isDark ? "border-primary ring-2 ring-primary/20" : "border-border opacity-60 hover:opacity-80"
                              )}
                            >
                              <div className="w-full h-12 bg-white rounded-lg mb-3 flex items-center justify-center border">
                                <Sun className="w-6 h-6 text-amber-500" />
                              </div>
                              <p className="text-sm font-medium text-foreground">Luminoasă</p>
                            </button>
                            <button 
                              onClick={() => setTheme(true)}
                              className={cn(
                                "flex-1 p-4 rounded-xl border-2 bg-card transition-all",
                                isDark ? "border-primary ring-2 ring-primary/20" : "border-border opacity-60 hover:opacity-80"
                              )}
                            >
                              <div className="w-full h-12 bg-slate-900 rounded-lg mb-3 flex items-center justify-center">
                                <Moon className="w-6 h-6 text-slate-300" />
                              </div>
                              <p className="text-sm font-medium text-foreground">Întunecată</p>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div role="tabpanel" aria-hidden={activeTab !== "support"} className={cn(activeTab !== "support" && "hidden")}>
                    <div className="space-y-6">
                      <h2 className="text-lg font-semibold text-foreground mb-4">Contact suport</h2>
                      <p className="text-sm text-muted-foreground mb-4">
                        Pentru asistență tehnică, întrebări despre facturare sau probleme cu contul, contactați echipa noastră.
                      </p>
                      <div className="p-4 rounded-xl bg-muted/50 border border-border">
                        <p className="font-medium text-foreground mb-1">Email suport</p>
                        <a href="mailto:support@edunation.ro" className="text-primary hover:underline">
                          support@edunation.ro
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Settings;