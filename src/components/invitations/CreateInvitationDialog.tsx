import { useState, useEffect } from "react";
import { Copy, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { createInvitation, type InvitationRole, getRoleLabelRo } from "@/lib/invitations";

interface CreateInvitationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  schoolId: string;
  allowedRoles: InvitationRole[];
  classId?: string;
  studentId?: string;
  defaultRole?: InvitationRole;
  title?: string;
  description?: string;
}

export function CreateInvitationDialog({
  open,
  onOpenChange,
  onSuccess,
  schoolId,
  allowedRoles,
  classId,
  studentId,
  defaultRole,
  title = "Creează invitație",
  description = "Generează un cod de invitație pentru un utilizator nou.",
}: CreateInvitationDialogProps) {
  const [role, setRole] = useState<InvitationRole>(defaultRole || allowedRoles[0]);
  const [expiresHours, setExpiresHours] = useState("24");
  const [invitedEmail, setInvitedEmail] = useState("");
  const [invitedPhone, setInvitedPhone] = useState("");
  
  const [creating, setCreating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setGeneratedCode(null);
      setCopied(false);
      setRole(defaultRole || allowedRoles[0]);
      setInvitedEmail("");
      setInvitedPhone("");
    }
  }, [open, defaultRole, allowedRoles]);

  const handleCreate = async () => {
    setCreating(true);

    const result = await createInvitation(role, schoolId, {
      classId,
      studentId,
      expiresHours: parseInt(expiresHours, 10),
      invitedEmail: invitedEmail.trim() || undefined,
      invitedPhone: invitedPhone.trim() || undefined,
    });

    setCreating(false);

    const finalCode = result.plain_code || result.code;

    if (result.success && finalCode) {
      setGeneratedCode(finalCode);
      toast({ title: "Invitație creată!", description: "Copiază codul și trimite-l utilizatorului." });
    } else {
      toast({
        title: "Eroare",
        description: result.error_message || "Nu s-a putut crea invitația.",
        variant: "destructive",
      });
    }
  };

  const handleCopy = async () => {
    if (!generatedCode) return;

    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      toast({ title: "Copiat!", description: "Codul a fost copiat în clipboard." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Eroare", description: "Nu s-a putut copia codul.", variant: "destructive" });
    }
  };

  const handleClose = () => {
    if (generatedCode) {
      onSuccess();
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {!generatedCode ? (
          <>
            <div className="space-y-4 py-4">
              {allowedRoles.length > 1 && (
                <div className="space-y-2">
                  <Label>Rol</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as InvitationRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedRoles.map((r) => (
                        <SelectItem key={r} value={r}>
                          {getRoleLabelRo(r)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Valabilitate</Label>
                <Select value={expiresHours} onValueChange={setExpiresHours}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24">24 ore</SelectItem>
                    <SelectItem value="48">48 ore</SelectItem>
                    <SelectItem value="72">72 ore</SelectItem>
                    <SelectItem value="168">7 zile</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Email (opțional)</Label>
                <Input
                  value={invitedEmail}
                  onChange={(e) => setInvitedEmail(e.target.value)}
                  placeholder="ex: parinte@email.com"
                  type="email"
                />
              </div>

              <div className="space-y-2">
                <Label>Telefon (opțional)</Label>
                <Input
                  value={invitedPhone}
                  onChange={(e) => setInvitedPhone(e.target.value)}
                  placeholder="ex: 07xx xxx xxx"
                  type="tel"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Anulează
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Generează cod
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="py-6">
              <div className="text-center mb-4">
                <p className="text-sm text-muted-foreground mb-2">
                  Codul de invitație pentru {getRoleLabelRo(role)}:
                </p>
                <div className="relative">
                  <Input
                    value={generatedCode}
                    readOnly
                    className="text-center text-2xl font-mono tracking-[0.3em] py-6 bg-muted"
                  />
                </div>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 text-center">
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  ⚠️ Acest cod va fi afișat <strong>o singură dată</strong>. Copiază-l acum!
                </p>
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" className="w-full sm:w-auto" onClick={handleCopy}>
                {copied ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Copiat!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copiază codul
                  </>
                )}
              </Button>
              <Button className="w-full sm:w-auto" onClick={handleClose}>
                Închide
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}