import { useState } from "react";
import { GraduationCap, UserCircle, Calendar, TrendingUp } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import StatsCard from "@/components/dashboard/StatsCard";
import GradesTable from "@/components/dashboard/GradesTable";
import UpcomingEvents from "@/components/dashboard/UpcomingEvents";
import QuickActions from "@/components/dashboard/QuickActions";
import { cn } from "@/lib/utils";

// Demo data
const mockGrades = [
  { subject: "Matematică", grades: [9, 10, 8, 9], average: 9.0, teacher: "Prof. Ionescu Maria" },
  { subject: "Limba Română", grades: [8, 9, 9, 10], average: 9.0, teacher: "Prof. Popescu Ana" },
  { subject: "Fizică", grades: [10, 9, 10], average: 9.67, teacher: "Prof. Georgescu Ion" },
  { subject: "Informatică", grades: [10, 10, 10, 9], average: 9.75, teacher: "Prof. Dumitrescu Vlad" },
  { subject: "Istorie", grades: [7, 8, 9], average: 8.0, teacher: "Prof. Marinescu Elena" },
];

const mockEvents = [
  { id: "1", title: "Test Matematică", date: "15 Dec", time: "10:00", type: "test" as const, subject: "Geometrie - Triunghiuri" },
  { id: "2", title: "Temă Română", date: "13 Dec", type: "homework" as const, subject: "Eseu argumentativ" },
  { id: "3", title: "Vacanța de iarnă", date: "21 Dec - 7 Ian", type: "holiday" as const },
  { id: "4", title: "Olimpiada de Informatică", date: "18 Dec", time: "09:00", type: "event" as const },
];

const Dashboard = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      
      <main className={cn(
        "transition-all duration-300",
        sidebarCollapsed ? "ml-20" : "ml-64"
      )}>
        {/* Header */}
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-8 sticky top-0 z-30">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Bună ziua, Alexandru! 👋</h1>
            <p className="text-sm text-muted-foreground">Clasa a X-a B • Liceul Teoretic „Nicolae Bălcescu"</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-primary-foreground font-semibold">
              AP
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-8">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatsCard
              title="Media Generală"
              value="9.08"
              subtitle="Semestrul I"
              icon={TrendingUp}
              variant="primary"
              trend={{ value: 3, isPositive: true }}
            />
            <StatsCard
              title="Note primite"
              value="18"
              subtitle="Luna aceasta"
              icon={GraduationCap}
              variant="success"
            />
            <StatsCard
              title="Prezență"
              value="96%"
              subtitle="2 absențe"
              icon={UserCircle}
              variant="accent"
            />
            <StatsCard
              title="Evenimente"
              value="4"
              subtitle="Săptămâna aceasta"
              icon={Calendar}
              variant="warning"
            />
          </div>

          {/* Main content */}
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <GradesTable grades={mockGrades} />
            </div>
            <div className="space-y-6">
              <UpcomingEvents events={mockEvents} />
              <QuickActions />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
