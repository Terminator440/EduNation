import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Users, Link2 } from "lucide-react";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { UserManagement } from "@/features/admin/components/UserManagement";
import { AssignmentManagement } from "@/features/admin/components/AssignmentManagement";

const AdminPanel = () => {
  const { user, activeRole, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"users" | "assignments">("users");

  // Check if user has admin rights
  const hasAdminRights =
    activeRole === "director" ||
    activeRole === "secretariat" ||
    activeRole === "uat_admin";

  if (!authLoading && (!user || !hasAdminRights)) {
    navigate("/auth");
    return null;
  }

  return (
    <DashboardLayout
      title="Panou Administrare"
      subtitle="Gestionează utilizatorii și asignările școlii"
    >
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="users">
            <Users className="w-4 h-4 mr-2" />
            Utilizatori
          </TabsTrigger>
          <TabsTrigger value="assignments">
            <Link2 className="w-4 h-4 mr-2" />
            Asignări
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-6">
          <UserManagement />
        </TabsContent>

        <TabsContent value="assignments" className="mt-6">
          <AssignmentManagement />
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
};

export default AdminPanel;
