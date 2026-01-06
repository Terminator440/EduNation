import { useState, useEffect } from "react";
import { Key, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateInvitationCode, getRoleLabelRo, type Invitation } from "@/lib/invitations";

interface InvitationCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  onValidation: (valid: boolean, invitation?: Invitation) => void;
  error?: string;
  disabled?: boolean;
}

export function InvitationCodeInput({
  value,
  onChange,
  onValidation,
  error,
  disabled,
}: InvitationCodeInputProps) {
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    invitation?: Invitation;
    error?: string;
  } | null>(null);

  // Normalize input
  const normalizeCode = (v: string) =>
    v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

  // Debounced validation
  useEffect(() => {
    const normalized = normalizeCode(value);
    if (normalized.length < 8) {
      setValidationResult(null);
      onValidation(false);
      return;
    }

    const timer = setTimeout(async () => {
      setValidating(true);
      const result = await validateInvitationCode(normalized);
      setValidationResult(result);
      onValidation(result.valid, result.invitation);
      setValidating(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [value, onValidation]);

  const displayError = error || validationResult?.error;

  return (
    <div className="space-y-2">
      <Label htmlFor="invitationCode">Cod de invitație *</Label>
      <div className="relative">
        <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input
          id="invitationCode"
          type="text"
          placeholder="XXXX-XXXX-XXXX"
          value={value}
          onChange={(e) => onChange(normalizeCode(e.target.value))}
          className={`pl-10 pr-10 uppercase font-mono tracking-wider ${
            displayError ? "border-destructive" : ""
          } ${validationResult?.valid ? "border-green-500" : ""}`}
          maxLength={12}
          autoComplete="one-time-code"
          disabled={disabled}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {validating && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
          {!validating && validationResult?.valid && (
            <CheckCircle className="w-5 h-5 text-green-500" />
          )}
          {!validating && validationResult && !validationResult.valid && (
            <XCircle className="w-5 h-5 text-destructive" />
          )}
        </div>
      </div>

      {displayError && <p className="text-sm text-destructive">{displayError}</p>}

      {validationResult?.valid && validationResult.invitation && (
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <p className="text-sm text-green-700 dark:text-green-400 font-medium">
            ✓ Cod valid pentru rol: {getRoleLabelRo(validationResult.invitation.role)}
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Codul de 12 caractere primit de la administrator. Fără cod nu te poți înregistra.
      </p>
    </div>
  );
}
