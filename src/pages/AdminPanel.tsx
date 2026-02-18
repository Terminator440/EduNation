import { useState, useTransition, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Link2 } from "lucide-react";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { UserManagement } from "@/features/admin/components/UserManagement";
import { AssignmentManagement } from "@/features/admin/components/AssignmentManagement";
import { cn } from "@/lib/utils";

const AdminPanel = () => {
  const { user, activeRole, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"users" | "assignments">("users");
  const [, startTransition] = useTransition();

  // Handle tab change with transition - active state updates instantly, content renders with low priority
  const handleTabChange = useCallback((value: string) => {
    // Update active tab instantly (optimistic update)
    setActiveTab(value as "users" | "assignments");
    
    // Mark content rendering as low priority transition
    startTransition(() => {
      // Transition is handled by React automatically
    });
  }, []);

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
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
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

        {/* Render all tabs simultaneously, hide inactive ones with CSS */}
        <div className="mt-6 relative">
          <div className={cn(activeTab === "users" ? "block" : "hidden")}>
            <UserManagement isActive={activeTab === "users"} />
          </div>
          <div className={cn(activeTab === "assignments" ? "block" : "hidden")}>
            <AssignmentManagement isActive={activeTab === "assignments"} />
          </div>
        </div>
      </Tabs>
    </DashboardLayout>
  );
};

export default AdminPanel;
