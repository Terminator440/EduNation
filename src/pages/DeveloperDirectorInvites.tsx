import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Copy, Check, Loader2, Plus, RefreshCw } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { 
  createInvitation, 
  getInvitationStatus, 
  getStatusLabelRo, 
  getStatusColor,
  type Invitation 
} from "@/lib/invitations";
import { useAuditLog } from "@/hooks/useAuditLog";
import { format } from "date-fns";
import { ro } from "date-fns/locale";

interface School {
  id: string;
  name: string;
  code: string | null;
}

const DeveloperDirectorInvites = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { toast } = useToast();
  const { activeRole, user } = useAuth();
  const { logAction } = useAuditLog();
  const navigate = useNavigate();

  // Redirect if not developer
  useEffect(() => {
    if (activeRole && activeRole !== 'developer') {
      navigate('/dashboard');
    }
  }, [activeRole, navigate]);

  // State
  const [schools, setSchools] = useState<School[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>("");
  const [intendedFor, setIntendedFor] = useState("");
  const [expiresHours, setExpiresHours] = useState("168"); // 7 days default
  const [maxUses, setMaxUses] = useState("1");
  
  const [creating, setCreating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [generatedForName, setGeneratedForName] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const [invitations, setInvitations] = useState<(Invitation & { intended_for?: string | null })[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(true);

  // Fetch schools
  useEffect(() => {
    const fetchSchools = async () => {
      setLoadingSchools(true);
      const { data, error } = await supabase
        .from("schools")
        .select("id, name, code")
        .order("name");
      
      if (error) {
        console.error("Error fetching schools:", error);
        toast({
          title: "Eroare",
          description: "Nu s-au putut încărca școlile.",
          variant: "destructive",
        });
      } else {
        setSchools(data || []);
      }
      setLoadingSchools(false);
    };

    fetchSchools();
  }, [toast]);

  // Fetch director invitations
  const fetchInvitations = async () => {
    setLoadingInvitations(true);
    const { data, error } = await supabase
      .from("invitations")
      .select("id, code_hash, role, school_id, class_id, student_id, created_by_user_id, expires_at, max_uses, current_uses, used_at, used_by_user_id, revoked_at, created_at, intended_for")
      .eq("role", "director")
      .order("created_at", { ascending: false })
      .limit(50);
    
    if (error) {
      console.error("Error fetching invitations:", error);
    } else {
      setInvitations((data as (Invitation & { intended_for?: string | null })[]) || []);
    }
    setLoadingInvitations(false);
  };

  useEffect(() => {
    fetchInvitations();
  }, []);

  // Create invitation
  const handleCreate = async () => {
    if (!selectedSchoolId) {
      toast({
        title: "Eroare",
        description: "Selectează o școală.",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);
    setGeneratedCode(null);

    const result = await createInvitation("director", selectedSchoolId, {
      expiresHours: parseInt(expiresHours, 10),
      maxUses: parseInt(maxUses, 10),
      intendedFor: intendedFor.trim() || undefined,
    });

    setCreating(false);

    if (result.success && result.plain_code) {
      setGeneratedForName(intendedFor.trim() || getSchoolName(selectedSchoolId));
      setGeneratedCode(result.plain_code);
      
      // Audit log
      await logAction({
        action: "developer_create_director_invitation",
        entityType: "invitation",
        entityId: result.invitation_id,
        details: {
          school_id: selectedSchoolId,
          expires_hours: parseInt(expiresHours, 10),
          max_uses: parseInt(maxUses, 10),
        },
      });

      toast({
        title: "Invitație creată!",
        description: "Copiază codul și trimite-l directorului.",
      });

      // Refresh list
      // Reset form
      setIntendedFor("");
      fetchInvitations();
    } else {
      toast({
        title: "Eroare",
        description: result.error_message || "Nu s-a putut crea invitația.",
        variant: "destructive",
      });
    }
  };

  // Copy code
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

  // Get school name by id
  const getSchoolName = (schoolId: string) => {
    const school = schools.find(s => s.id === schoolId);
    return school?.name || "Necunoscută";
  };

  if (activeRole !== 'developer') {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      
      <main className={cn(
        "transition-all duration-300",
        sidebarCollapsed ? "ml-20" : "ml-64"
      )}>
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center px-8 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-xl font-semibold text-foreground">Invitații Director</h1>
              <p className="text-sm text-muted-foreground">Generează coduri de invitație pentru directori</p>
            </div>
          </div>
        </header>

        <div className="p-8">
          <div className="max-w-4xl mx-auto space-y-8">
            {/* Create invitation form */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="w-5 h-5" />
                  Generează invitație nouă
                </CardTitle>
                <CardDescription>
                  Creează un cod de invitație pentru un director. Codul poate fi folosit o singură dată pentru înregistrare.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {!generatedCode ? (
                  <>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Școala *</Label>
                        <Select 
                          value={selectedSchoolId} 
                          onValueChange={setSelectedSchoolId}
                          disabled={loadingSchools}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={loadingSchools ? "Se încarcă..." : "Selectează școala"} />
                          </SelectTrigger>
                          <SelectContent>
                            {schools.map((school) => (
                              <SelectItem key={school.id} value={school.id}>
                                {school.name} {school.code && `(${school.code})`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Numele directorului (opțional)</Label>
                        <Input 
                          value={intendedFor}
                          onChange={(e) => setIntendedFor(e.target.value)}
                          placeholder="ex: Ion Popescu"
                        />
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
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
                            <SelectItem value="720">30 zile</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Utilizări maxime</Label>
                        <Select value={maxUses} onValueChange={setMaxUses}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 utilizare</SelectItem>
                            <SelectItem value="5">5 utilizări</SelectItem>
                            <SelectItem value="10">10 utilizări</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <Button onClick={handleCreate} disabled={creating || !selectedSchoolId}>
                      {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Generează cod de invitație
                    </Button>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-6">
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="text-center sm:text-left">
                          <p className="text-sm text-muted-foreground">Invitație pentru:</p>
                          <p className="text-lg font-semibold text-foreground">{generatedForName}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="bg-background border-2 border-primary/30 rounded-lg px-4 py-2">
                            <span className="text-2xl font-mono tracking-[0.2em] text-primary font-bold">
                              {generatedCode}
                            </span>
                          </div>
                          <Button variant="outline" size="icon" onClick={handleCopy}>
                            {copied ? (
                              <Check className="w-4 h-4 text-green-500" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 text-center">
                      <p className="text-sm text-amber-700 dark:text-amber-400">
                        ⚠️ Acest cod va fi afișat <strong>o singură dată</strong>. Copiază-l acum!
                      </p>
                    </div>

                    <div className="flex justify-center">
                      <Button onClick={() => { setGeneratedCode(null); setGeneratedForName(""); }}>
                        Generează altă invitație
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Invitations list */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Invitații generate</CardTitle>
                    <CardDescription>
                      Istoricul invitațiilor pentru directori
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchInvitations} disabled={loadingInvitations}>
                    <RefreshCw className={cn("w-4 h-4 mr-2", loadingInvitations && "animate-spin")} />
                    Actualizează
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loadingInvitations ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : invitations.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    Nu există invitații de director generate.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Director / Școala</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Utilizări</TableHead>
                        <TableHead>Expiră</TableHead>
                        <TableHead>Creat la</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invitations.map((inv) => {
                        const status = getInvitationStatus(inv);
                        return (
                          <TableRow key={inv.id}>
                            <TableCell>
                              <div className="flex flex-col">
                                {inv.intended_for && (
                                  <span className="font-semibold text-foreground">{inv.intended_for}</span>
                                )}
                                <span className={inv.intended_for ? "text-sm text-muted-foreground" : "font-medium"}>
                                  {getSchoolName(inv.school_id)}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={getStatusColor(status)}>
                                {getStatusLabelRo(status)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {inv.current_uses} / {inv.max_uses}
                            </TableCell>
                            <TableCell>
                              {format(new Date(inv.expires_at), "dd MMM yyyy, HH:mm", { locale: ro })}
                            </TableCell>
                            <TableCell>
                              {format(new Date(inv.created_at), "dd MMM yyyy, HH:mm", { locale: ro })}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default DeveloperDirectorInvites;
