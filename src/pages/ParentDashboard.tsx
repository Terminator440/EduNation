import { useState } from "react";
import { GraduationCap, UserCircle, Calendar, TrendingUp, Users, ChevronDown } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import StatsCard from "@/components/dashboard/StatsCard";
import GradesTable from "@/components/dashboard/GradesTable";
import UpcomingEvents from "@/components/dashboard/UpcomingEvents";
import RoleSwitcher from "@/components/RoleSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const mockChildren = [
  { id: "1", name: "Popescu Alexandru", class: "X-A", average: 9.08 },
  { id: "2", name: "Popescu Maria", class: "VII-B", average: 8.75 },
];

const mockGrades = {
  "1": [
    { subject: "Matematică", grades: [9, 10, 8, 9], average: 9.0, teacher: "Prof. Ionescu Maria" },
    { subject: "Limba Română", grades: [8, 9, 9, 10], average: 9.0, teacher: "Prof. Popescu Ana" },
    { subject: "Fizică", grades: [10, 9, 10], average: 9.67, teacher: "Prof. Georgescu Ion" },
    { subject: "Informatică", grades: [10, 10, 10, 9], average: 9.75, teacher: "Prof. Dumitrescu Vlad" },
  ],
  "2": [
    { subject: "Matematică", grades: [8, 9, 8], average: 8.33, teacher: "Prof. Ionescu Maria" },
    { subject: "Limba Română", grades: [9, 9, 8, 9], average: 8.75, teacher: "Prof. Popescu Ana" },
    { subject: "Istorie", grades: [9, 10, 9], average: 9.33, teacher: "Prof. Marinescu Elena" },
  ],
};

const mockEvents = [
  { id: "1", title: "Test Matematică", date: "15 Dec", time: "10:00", type: "test" as const, subject: "Geometrie - Triunghiuri" },
  { id: "2", title: "Ședință părinți", date: "18 Dec", time: "17:00", type: "event" as const },
  { id: "3", title: "Vacanța de iarnă", date: "21 Dec - 7 Ian", type: "holiday" as const },
];

const ParentDashboard = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeChildId, setActiveChildId] = useState(mockChildren[0].id);
  const { user, profile } = useAuth();

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Utilizator';
  const activeChild = mockChildren.find(c => c.id === activeChildId) || mockChildren[0];
  const childGrades = mockGrades[activeChildId as keyof typeof mockGrades] || [];

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      
      <main className={cn(
        "transition-all duration-300",
        sidebarCollapsed ? "ml-20" : "ml-64"
      )}>
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-8 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-xl font-semibold text-foreground">Bună ziua, {displayName}! 👋</h1>
              <p className="text-sm text-muted-foreground">Panou Părinte</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <RoleSwitcher />
            <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-primary-foreground font-semibold">
              {displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
          </div>
        </header>

        <div className="p-8">
          {/* Child Selector */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Copiii mei
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2 min-w-64 justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-sm font-semibold text-primary">
                            {activeChild.name.split(' ').map(n => n[0]).join('')}
                          </span>
                        </div>
                        <div className="text-left">
                          <p className="font-medium">{activeChild.name}</p>
                          <p className="text-xs text-muted-foreground">Clasa {activeChild.class}</p>
                        </div>
                      </div>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64">
                    {mockChildren.map((child) => (
                      <DropdownMenuItem
                        key={child.id}
                        onClick={() => setActiveChildId(child.id)}
                        className={cn(
                          "flex items-center gap-2 cursor-pointer",
                          child.id === activeChildId && "bg-primary/10"
                        )}
                      >
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-sm font-semibold text-primary">
                            {child.name.split(' ').map(n => n[0]).join('')}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">{child.name}</p>
                          <p className="text-xs text-muted-foreground">Clasa {child.class}</p>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <div className="flex-1 grid grid-cols-3 gap-4">
                  {mockChildren.map((child) => (
                    <button
                      key={child.id}
                      onClick={() => setActiveChildId(child.id)}
                      className={cn(
                        "p-4 rounded-lg border transition-all text-left",
                        child.id === activeChildId
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <p className="font-medium text-foreground">{child.name}</p>
                      <p className="text-sm text-muted-foreground">Clasa {child.class}</p>
                      <p className="text-sm font-semibold text-primary mt-1">Media: {child.average}</p>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats for active child */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatsCard
              title="Media Generală"
              value={activeChild.average.toFixed(2)}
              subtitle={`${activeChild.name} - Semestrul I`}
              icon={TrendingUp}
              variant="primary"
              trend={{ value: 3, isPositive: true }}
            />
            <StatsCard
              title="Note primite"
              value={childGrades.reduce((acc, g) => acc + g.grades.length, 0).toString()}
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
              value="3"
              subtitle="Săptămâna aceasta"
              icon={Calendar}
              variant="warning"
            />
          </div>

          {/* Main content */}
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <GradesTable grades={childGrades} />
            </div>
            <div className="space-y-6">
              <UpcomingEvents events={mockEvents} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ParentDashboard;
