import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { toFriendlySupabaseError } from "@/utils/supabaseErrors";

const TARGET_ROLE_OPTIONS = [
  { value: "__all__", label: "Toată lumea" },
  { value: "student", label: "Elevi" },
  { value: "parent", label: "Părinți" },
  { value: "teacher", label: "Profesori" },
  { value: "homeroom_teacher", label: "Diriginți" },
  { value: "secretariat", label: "Secretariat" },
  { value: "director", label: "Directori" },
] as const;

interface CreateAnnouncementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  authorId: string;
  schoolId?: string | null;
}

export function CreateAnnouncementDialog({
  open,
  onOpenChange,
  onCreated,
  authorId,
  schoolId: _schoolId,
}: CreateAnnouncementDialogProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [targetRole, setTargetRole] = useState<string>("__all__");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) {
      setTitle("");
      setContent("");
      setTargetRole("__all__");
    }
  }, [open]);

  const canSubmit = title.trim().length > 0 && content.trim().length > 0;

  const handleCreate = async () => {
    if (!canSubmit) return;

    setCreating(true);
    try {
      const payload = {
        title: title.trim(),
        content: content.trim(),
        created_by: authorId,
        target_role: targetRole === "__all__" ? null : targetRole,
      };

      const { error } = await supabase.from("announcements").insert(payload);

      if (error) throw error;

      toast({
        title: "Anunț publicat",
        description: "Anunțul a fost adăugat cu succes.",
      });

      onCreated?.();
      onOpenChange(false);
    } catch (e: unknown) {
      toast({
        title: "Eroare la publicare",
        description: toFriendlySupabaseError(e),
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Publică anunț</DialogTitle>
          <DialogDescription>
            Creează un anunț nou vizibil pentru utilizatorii școlii.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="ann-title">Titlu *</Label>
            <Input
              id="ann-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Ședință cu părinții"
            />
          </div>

          <div className="space-y-2">
            <Label>Vizibil pentru</Label>
            <Select value={targetRole} onValueChange={setTargetRole}>
              <SelectTrigger>
                <SelectValue placeholder="Toată lumea" />
              </SelectTrigger>
              <SelectContent>
                {TARGET_ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ann-content">Conținut *</Label>
            <Textarea
              id="ann-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Scrie mesajul anunțului..."
              className="min-h-[140px] resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anulează
          </Button>
          <Button onClick={handleCreate} disabled={creating || !canSubmit}>
            {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Publică
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
