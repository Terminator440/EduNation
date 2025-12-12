import { useState } from "react";
import { UserCheck, UserX, Clock, Calendar } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import { cn } from "@/lib/utils";

interface AttendanceRecord {
  date: string;
  subject: string;
  status: "present" | "absent" | "late" | "excused";
  teacher: string;
  notes?: string;
}

const mockAttendance: AttendanceRecord[] = [
  { date: "11 Dec 2024", subject: "Matematică", status: "present", teacher: "Prof. Ionescu Maria" },
  { date: "11 Dec 2024", subject: "Limba Română", status: "present", teacher: "Prof. Popescu Ana" },
  { date: "10 Dec 2024", subject: "Fizică", status: "late", teacher: "Prof. Georgescu Ion", notes: "5 minute întârziere" },
  { date: "10 Dec 2024", subject: "Informatică", status: "present", teacher: "Prof. Dumitrescu Vlad" },
  { date: "9 Dec 2024", subject: "Istorie", status: "absent", teacher: "Prof. Marinescu Elena", notes: "Absență nemotivată" },
  { date: "9 Dec 2024", subject: "Geografie", status: "present", teacher: "Prof. Vasilescu Dan" },
  { date: "6 Dec 2024", subject: "Biologie", status: "excused", teacher: "Prof. Stanescu Ioana", notes: "Scutire medicală" },
  { date: "6 Dec 2024", subject: "Chimie", status: "present", teacher: "Prof. Popa Mihai" },
  { date: "5 Dec 2024", subject: "Limba Engleză", status: "present", teacher: "Prof. Brown Sarah" },
  { date: "5 Dec 2024", subject: "Educație Fizică", status: "present", teacher: "Prof. Radu Andrei" },
  { date: "4 Dec 2024", subject: "Matematică", status: "present", teacher: "Prof. Ionescu Maria" },
  { date: "4 Dec 2024", subject: "Limba Română", status: "absent", teacher: "Prof. Popescu Ana", notes: "Absență nemotivată" },
];

const statusConfig = {
  present: { label: "Prezent", icon: UserCheck, color: "bg-success/10 text-success", dot: "bg-success" },
  absent: { label: "Absent", icon: UserX, color: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
  late: { label: "Întârziat", icon: Clock, color: "bg-warning/10 text-warning", dot: "bg-warning" },
  excused: { label: "Motivat", icon: Calendar, color: "bg-primary/10 text-primary", dot: "bg-primary" },
};

const Attendance = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filter, setFilter] = useState<"all" | "absent" | "late" | "excused">("all");

  const totalClasses = mockAttendance.length;
  const presentCount = mockAttendance.filter(a => a.status === "present").length;
  const absentCount = mockAttendance.filter(a => a.status === "absent").length;
  const lateCount = mockAttendance.filter(a => a.status === "late").length;
  const excusedCount = mockAttendance.filter(a => a.status === "excused").length;
  const attendanceRate = ((presentCount + excusedCount) / totalClasses * 100).toFixed(1);

  const filteredAttendance = filter === "all" 
    ? mockAttendance 
    : mockAttendance.filter(a => a.status === filter);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      
      <main className={cn(
        "transition-all duration-300",
        sidebarCollapsed ? "ml-20" : "ml-64"
      )}>
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center px-8 sticky top-0 z-30">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Prezența mea</h1>
            <p className="text-sm text-muted-foreground">Înregistrarea prezenței la cursuri</p>
          </div>
        </header>

        <div className="p-8">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
            <div className="bg-card rounded-2xl p-5 border border-border">
              <p className="text-sm text-muted-foreground">Rata prezență</p>
              <p className="text-2xl font-bold text-success mt-1">{attendanceRate}%</p>
            </div>
            <div className="bg-card rounded-2xl p-5 border border-border">
              <p className="text-sm text-muted-foreground">Prezențe</p>
              <p className="text-2xl font-bold text-foreground mt-1">{presentCount}</p>
            </div>
            <div className="bg-card rounded-2xl p-5 border border-border">
              <p className="text-sm text-muted-foreground">Absențe</p>
              <p className="text-2xl font-bold text-destructive mt-1">{absentCount}</p>
            </div>
            <div className="bg-card rounded-2xl p-5 border border-border">
              <p className="text-sm text-muted-foreground">Întârzieri</p>
              <p className="text-2xl font-bold text-warning mt-1">{lateCount}</p>
            </div>
            <div className="bg-card rounded-2xl p-5 border border-border">
              <p className="text-sm text-muted-foreground">Motivate</p>
              <p className="text-2xl font-bold text-primary mt-1">{excusedCount}</p>
            </div>
          </div>

          {/* Filter */}
          <div className="flex gap-2 mb-6">
            {[
              { key: "all", label: "Toate" },
              { key: "absent", label: "Absențe" },
              { key: "late", label: "Întârzieri" },
              { key: "excused", label: "Motivate" },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setFilter(item.key as typeof filter)}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                  filter === item.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Attendance List */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="p-6 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">Istoric prezență</h3>
            </div>
            <div className="divide-y divide-border">
              {filteredAttendance.map((record, index) => {
                const config = statusConfig[record.status];
                const Icon = config.icon;
                return (
                  <div key={index} className="p-4 hover:bg-secondary/30 transition-colors flex items-center gap-4">
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", config.color)}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{record.subject}</span>
                        <span className={cn("w-2 h-2 rounded-full", config.dot)} />
                        <span className={cn("text-sm", config.color.split(" ")[1])}>{config.label}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{record.teacher}</p>
                      {record.notes && (
                        <p className="text-xs text-muted-foreground mt-1 italic">{record.notes}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">{record.date}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Attendance;
