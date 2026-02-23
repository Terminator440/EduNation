/**
 * Wizard onboarding școală: 1) Creează școală 2) Invită admin (director) 3) Clase 4) Materii.
 * Vizibil doar pentru uat_admin / developer.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createSchool,
  createDirectorInvitation,
  createClasses,
  createSubjects,
  type SchoolOnboardingStep1,
  type SchoolOnboardingStep2,
} from "../schoolOnboarding.service";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Building2, UserPlus, GraduationCap, BookOpen, CheckCircle } from "lucide-react";

const STEPS = [
  { id: 1, title: "Școala", icon: Building2 },
  { id: 2, title: "Admin (director)", icon: UserPlus },
  { id: 3, title: "Clase", icon: GraduationCap },
  { id: 4, title: "Materii", icon: BookOpen },
];

export function SchoolOnboardingWizard() {
  const { activeRole } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [step1, setStep1] = useState<SchoolOnboardingStep1>({ name: "", code: "" });
  const [step2, setStep2] = useState<SchoolOnboardingStep2>({ adminEmail: "", adminName: "" });
  const [classNames, setClassNames] = useState("");
  const [subjectNames, setSubjectNames] = useState("");
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [invitationCode, setInvitationCode] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const isAdmin = activeRole === "uat_admin" || activeRole === "developer";
  if (!isAdmin) return null;

  const handleStep1 = async () => {
    if (!step1.name.trim()) {
      toast.error("Introdu numele școlii.");
      return;
    }
    setLoading(true);
    try {
      const id = await createSchool(step1);
      setSchoolId(id);
      toast.success("Școala a fost creată.");
      setStep(2);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Eroare la creare școală");
    } finally {
      setLoading(false);
    }
  };

  const handleStep2 = async () => {
    if (!step2.adminEmail.trim() || !step2.adminName.trim()) {
      toast.error("Completează email și numele directorului.");
      return;
    }
    if (!schoolId) return;
    setLoading(true);
    try {
      const { code } = await createDirectorInvitation(schoolId, step2);
      setInvitationCode(code);
      toast.success("Invitația a fost creată. Trimite codul directorului.");
      setStep(3);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Eroare la creare invitație");
    } finally {
      setLoading(false);
    }
  };

  const handleStep3 = async () => {
    if (!schoolId) return;
    const names = classNames.split(/[\n,;]/).map((s) => s.trim()).filter(Boolean);
    setLoading(true);
    try {
      const count = await createClasses(schoolId, names);
      toast.success(count ? `${count} clase create.` : "Nicio clasă adăugată.");
      setStep(4);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Eroare la creare clase");
    } finally {
      setLoading(false);
    }
  };

  const handleStep4 = async () => {
    if (!schoolId) return;
    const names = subjectNames.split(/[\n,;]/).map((s) => s.trim()).filter(Boolean);
    setLoading(true);
    try {
      const count = await createSubjects(schoolId, names);
      toast.success(count ? `${count} materii create.` : "Nicio materie adăugată.");
      setDone(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Eroare la creare materii");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Onboarding finalizat
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Școala a fost creată. Invitația pentru director: <strong>{invitationCode ?? "—"}</strong>
          </p>
          <p className="text-xs text-muted-foreground">
            Trimite codul directorului; acesta poate crea cont pe pagina de autentificare folosind codul.
          </p>
          <Button variant="outline" onClick={() => { setDone(false); setStep(1); setSchoolId(null); setInvitationCode(null); }}>
            Începe altă școală
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Onboarding școală nouă</CardTitle>
        <div className="flex gap-2 flex-wrap mt-2">
          {STEPS.map((s) => (
            <span
              key={s.id}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${step === s.id ? "bg-primary text-primary-foreground" : "bg-muted"}`}
            >
              <s.icon className="h-3 w-3" />
              {s.title}
            </span>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 1 && (
          <>
            <div>
              <Label>Nume școală</Label>
              <Input value={step1.name} onChange={(e) => setStep1((p) => ({ ...p, name: e.target.value }))} placeholder="ex. Liceul X" />
            </div>
            <div>
              <Label>Cod (opțional)</Label>
              <Input value={step1.code} onChange={(e) => setStep1((p) => ({ ...p, code: e.target.value }))} placeholder="ex. LIX" />
            </div>
            <Button onClick={handleStep1} disabled={loading}>Creează școala</Button>
          </>
        )}
        {step === 2 && (
          <>
            <div>
              <Label>Email director</Label>
              <Input type="email" value={step2.adminEmail} onChange={(e) => setStep2((p) => ({ ...p, adminEmail: e.target.value }))} placeholder="director@școala.ro" />
            </div>
            <div>
              <Label>Nume director</Label>
              <Input value={step2.adminName} onChange={(e) => setStep2((p) => ({ ...p, adminName: e.target.value }))} placeholder="Nume Prenume" />
            </div>
            <Button onClick={handleStep2} disabled={loading}>Creează invitație</Button>
          </>
        )}
        {step === 3 && (
          <>
            <div>
              <Label>Clase (câte una per linie sau separate prin virgulă)</Label>
              <textarea
                className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={classNames}
                onChange={(e) => setClassNames(e.target.value)}
                placeholder="10A&#10;10B&#10;11A"
              />
            </div>
            <Button onClick={handleStep3} disabled={loading}>Salvează clase</Button>
          </>
        )}
        {step === 4 && (
          <>
            <div>
              <Label>Materii (câte una per linie sau separate prin virgulă)</Label>
              <textarea
                className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={subjectNames}
                onChange={(e) => setSubjectNames(e.target.value)}
                placeholder="Matematică&#10;Română&#10;Istorie"
              />
            </div>
            <Button onClick={handleStep4} disabled={loading}>Finalizează</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
