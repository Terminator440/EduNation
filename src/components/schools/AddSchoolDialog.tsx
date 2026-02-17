import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
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
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { toFriendlySupabaseError } from "@/utils/supabaseErrors";

interface AddSchoolDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSchoolAdded: (school: { id: string; name: string; code: string | null }) => void;
}

const AddSchoolDialog = ({ open, onOpenChange, onSchoolAdded }: AddSchoolDialogProps) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const resetForm = () => {
    setName("");
    setCode("");
    setAddress("");
    setPhone("");
    setEmail("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast({
        title: "Eroare",
        description: "Numele școlii este obligatoriu.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    const { data, error } = await supabase
      .from("schools")
      .insert({
        name: name.trim(),
        code: code.trim() || null,
        address: address.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
      })
      .select("id, name, code")
      .single();

    setSaving(false);

    if (error) {
      console.error("Error creating school:", error);
      toast({
        title: "Eroare",
        description: toFriendlySupabaseError(error),
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Școală adăugată!",
      description: `Școala "${data.name}" a fost adăugată cu succes.`,
    });

    onSchoolAdded(data);
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adaugă școală nouă</DialogTitle>
          <DialogDescription>
            Completează datele școlii pentru a o adăuga în sistem.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="school-name">Numele școlii *</Label>
            <Input
              id="school-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Liceul Teoretic Mihai Eminescu"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="school-code">Cod SIIIR (opțional)</Label>
            <Input
              id="school-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ex: 123456"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="school-address">Adresă (opțional)</Label>
            <Input
              id="school-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="ex: Str. Principală nr. 1, București"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="school-phone">Telefon (opțional)</Label>
              <Input
                id="school-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="ex: 021 123 4567"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="school-email">Email (opțional)</Label>
              <Input
                id="school-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ex: contact@scoala.ro"
              />
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Anulează
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving && <Spinner size="sm" className="w-4 h-4 mr-2 text-current" />}
              Adaugă școala
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddSchoolDialog;
