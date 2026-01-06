import { useState } from "react";
import { Copy, RotateCcw, XCircle, Clock, CheckCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { toast } from "@/hooks/use-toast";
import {
  type Invitation,
  type InvitationStatus,
  getInvitationStatus,
  getRoleLabelRo,
  getStatusLabelRo,
  getStatusColor,
  revokeInvitation,
} from "@/lib/invitations";
import { formatDistanceToNow } from "date-fns";
import { ro } from "date-fns/locale";

interface InvitationsListProps {
  invitations: Invitation[];
  onRefresh: () => void;
  onRegenerate?: (invitation: Invitation) => void;
  showRole?: boolean;
  showClass?: boolean;
  showStudent?: boolean;
  loading?: boolean;
}

const statusIcons: Record<InvitationStatus, React.ReactNode> = {
  pending: <Clock className="w-4 h-4 text-primary" />,
  used: <CheckCircle className="w-4 h-4 text-green-500" />,
  expired: <AlertTriangle className="w-4 h-4 text-amber-500" />,
  revoked: <XCircle className="w-4 h-4 text-destructive" />,
};

export function InvitationsList({
  invitations,
  onRefresh,
  onRegenerate,
  showRole = true,
  showClass = false,
  showStudent = false,
  loading = false,
}: InvitationsListProps) {
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [selectedInvitation, setSelectedInvitation] = useState<Invitation | null>(null);
  const [revoking, setRevoking] = useState(false);

  const handleRevoke = async () => {
    if (!selectedInvitation) return;

    setRevoking(true);
    const success = await revokeInvitation(selectedInvitation.id);
    setRevoking(false);

    if (success) {
      toast({ title: "Invitație revocată", description: "Codul nu mai poate fi folosit." });
      onRefresh();
    } else {
      toast({
        title: "Eroare",
        description: "Nu s-a putut revoca invitația.",
        variant: "destructive",
      });
    }

    setRevokeDialogOpen(false);
    setSelectedInvitation(null);
  };

  const handleCopyCode = (inv: Invitation) => {
    // Note: We can't copy the plain code as we only store the hash
    // This would need to be called right after creation when we have the plain code
    toast({
      title: "Info",
      description: "Codul poate fi copiat doar la momentul generării.",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (invitations.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Nu există invitații.
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            {showRole && <TableHead>Rol</TableHead>}
            {showClass && <TableHead>Clasă</TableHead>}
            {showStudent && <TableHead>Elev</TableHead>}
            <TableHead>Status</TableHead>
            <TableHead>Expiră</TableHead>
            <TableHead>Folosiri</TableHead>
            <TableHead className="text-right">Acțiuni</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invitations.map((inv) => {
            const status = getInvitationStatus(inv);
            const canRevoke = status === "pending";
            const canRegenerate = status !== "pending" && onRegenerate;

            return (
              <TableRow key={inv.id}>
                {showRole && (
                  <TableCell className="font-medium">{getRoleLabelRo(inv.role)}</TableCell>
                )}
                {showClass && (
                  <TableCell>{(inv as any).class_name || "-"}</TableCell>
                )}
                {showStudent && (
                  <TableCell>{(inv as any).student_name || "-"}</TableCell>
                )}
                <TableCell>
                  <div className="flex items-center gap-2">
                    {statusIcons[status]}
                    <Badge variant={getStatusColor(status)}>{getStatusLabelRo(status)}</Badge>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {status === "pending" ? (
                    formatDistanceToNow(new Date(inv.expires_at), {
                      addSuffix: true,
                      locale: ro,
                    })
                  ) : (
                    new Date(inv.expires_at).toLocaleDateString("ro-RO")
                  )}
                </TableCell>
                <TableCell>
                  {inv.current_uses} / {inv.max_uses}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {canRevoke && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedInvitation(inv);
                          setRevokeDialogOpen(true);
                        }}
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                    )}
                    {canRegenerate && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onRegenerate(inv)}
                      >
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revocă invitația?</AlertDialogTitle>
            <AlertDialogDescription>
              Codul de invitație nu va mai putea fi folosit. Această acțiune nu poate fi anulată.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Anulează</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke} disabled={revoking}>
              {revoking ? "Se revocă..." : "Revocă"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
