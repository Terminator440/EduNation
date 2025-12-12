import { useState } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, BookOpen, PartyPopper, Sun, GraduationCap } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface CalendarEvent {
  date: string;
  title: string;
  type: "holiday" | "vacation" | "exam" | "event" | "school";
  description?: string;
}

// Romanian school calendar 2024-2025
const schoolEvents: CalendarEvent[] = [
  // Vacante
  { date: "2024-12-21", title: "Vacanța de iarnă", type: "vacation", description: "21 dec - 7 ian" },
  { date: "2024-12-22", title: "Vacanța de iarnă", type: "vacation" },
  { date: "2024-12-23", title: "Vacanța de iarnă", type: "vacation" },
  { date: "2024-12-24", title: "Vacanța de iarnă", type: "vacation" },
  { date: "2024-12-25", title: "Crăciunul", type: "holiday" },
  { date: "2024-12-26", title: "Crăciunul", type: "holiday" },
  { date: "2024-12-27", title: "Vacanța de iarnă", type: "vacation" },
  { date: "2024-12-28", title: "Vacanța de iarnă", type: "vacation" },
  { date: "2024-12-29", title: "Vacanța de iarnă", type: "vacation" },
  { date: "2024-12-30", title: "Vacanța de iarnă", type: "vacation" },
  { date: "2024-12-31", title: "Revelion", type: "holiday" },
  { date: "2025-01-01", title: "Anul Nou", type: "holiday" },
  { date: "2025-01-02", title: "Anul Nou", type: "holiday" },
  { date: "2025-01-03", title: "Vacanța de iarnă", type: "vacation" },
  { date: "2025-01-04", title: "Vacanța de iarnă", type: "vacation" },
  { date: "2025-01-05", title: "Vacanța de iarnă", type: "vacation" },
  { date: "2025-01-06", title: "Boboteaza", type: "holiday" },
  { date: "2025-01-07", title: "Vacanța de iarnă", type: "vacation" },
  { date: "2025-01-24", title: "Ziua Unirii", type: "holiday" },
  // Examene/teste
  { date: "2024-12-15", title: "Test Matematică", type: "exam", description: "Geometrie - Triunghiuri" },
  { date: "2024-12-18", title: "Olimpiada Informatică", type: "event", description: "Etapa pe școală" },
  { date: "2024-12-19", title: "Test Fizică", type: "exam", description: "Mecanică" },
  // Evenimente
  { date: "2024-12-20", title: "Serbarea de Crăciun", type: "event", description: "Ora 11:00 - Sala festivă" },
];

const DAYS_RO = ["Lun", "Mar", "Mie", "Joi", "Vin", "Sâm", "Dum"];
const MONTHS_RO = [
  "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
  "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"
];

const eventTypeConfig = {
  holiday: { color: "bg-destructive", textColor: "text-destructive", icon: PartyPopper, label: "Sărbătoare legală" },
  vacation: { color: "bg-success", textColor: "text-success", icon: Sun, label: "Vacanță" },
  exam: { color: "bg-warning", textColor: "text-warning", icon: GraduationCap, label: "Test/Examen" },
  event: { color: "bg-primary", textColor: "text-primary", icon: CalendarIcon, label: "Eveniment" },
  school: { color: "bg-secondary", textColor: "text-foreground", icon: BookOpen, label: "Zi de curs" },
};

const SchoolCalendar = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date(2024, 11, 12)); // December 2024
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();
  
  // Get the day of week (0 = Sunday, adjust to Monday start)
  let startDay = firstDayOfMonth.getDay() - 1;
  if (startDay === -1) startDay = 6;

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const getEventsForDate = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return schoolEvents.filter(e => e.date === dateStr);
  };

  const isWeekend = (day: number) => {
    const date = new Date(year, month, day);
    return date.getDay() === 0 || date.getDay() === 6;
  };

  const isToday = (day: number) => {
    const today = new Date();
    return year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
  };

  const getDayType = (day: number): "holiday" | "vacation" | "exam" | "event" | "school" | "weekend" | null => {
    const events = getEventsForDate(day);
    if (events.length > 0) {
      // Priority: holiday > vacation > exam > event
      if (events.some(e => e.type === "holiday")) return "holiday";
      if (events.some(e => e.type === "vacation")) return "vacation";
      if (events.some(e => e.type === "exam")) return "exam";
      if (events.some(e => e.type === "event")) return "event";
    }
    if (isWeekend(day)) return "weekend";
    return "school";
  };

  const selectedDateEvents = selectedDate 
    ? schoolEvents.filter(e => e.date === selectedDate)
    : [];

  // Calendar grid
  const calendarDays = [];
  for (let i = 0; i < startDay; i++) {
    calendarDays.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      
      <main className={cn(
        "transition-all duration-300",
        sidebarCollapsed ? "ml-20" : "ml-64"
      )}>
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center px-8 sticky top-0 z-30">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Calendar Școlar</h1>
            <p className="text-sm text-muted-foreground">Anul școlar 2024-2025</p>
          </div>
        </header>

        <div className="p-8">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Calendar */}
            <div className="lg:col-span-2">
              <div className="bg-card rounded-2xl border border-border p-6">
                {/* Month navigation */}
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-foreground">
                    {MONTHS_RO[month]} {year}
                  </h2>
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={prevMonth}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={nextMonth}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Days header */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {DAYS_RO.map(day => (
                    <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar grid */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((day, index) => {
                    if (day === null) {
                      return <div key={`empty-${index}`} className="aspect-square" />;
                    }

                    const dayType = getDayType(day);
                    const events = getEventsForDate(day);
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const isSelected = selectedDate === dateStr;

                    return (
                      <button
                        key={day}
                        onClick={() => setSelectedDate(dateStr)}
                        className={cn(
                          "aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all hover:scale-105",
                          isToday(day) && "ring-2 ring-primary ring-offset-2",
                          isSelected && "ring-2 ring-accent ring-offset-2",
                          dayType === "holiday" && "bg-destructive/20",
                          dayType === "vacation" && "bg-success/20",
                          dayType === "exam" && "bg-warning/20",
                          dayType === "event" && "bg-primary/20",
                          dayType === "weekend" && "bg-muted/50",
                          dayType === "school" && "bg-secondary/30 hover:bg-secondary/50"
                        )}
                      >
                        <span className={cn(
                          "text-sm font-semibold",
                          dayType === "weekend" && "text-muted-foreground",
                          dayType === "holiday" && "text-destructive",
                          dayType === "vacation" && "text-success",
                          (dayType === "school" || dayType === "exam" || dayType === "event") && "text-foreground"
                        )}>
                          {day}
                        </span>
                        {events.length > 0 && (
                          <div className="flex gap-0.5 mt-1">
                            {events.slice(0, 3).map((e, i) => (
                              <div 
                                key={i} 
                                className={cn(
                                  "w-1.5 h-1.5 rounded-full",
                                  eventTypeConfig[e.type].color
                                )} 
                              />
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-4 mt-6 pt-6 border-t border-border">
                  {Object.entries(eventTypeConfig).filter(([key]) => key !== "school").map(([key, config]) => (
                    <div key={key} className="flex items-center gap-2">
                      <div className={cn("w-3 h-3 rounded-full", config.color)} />
                      <span className="text-sm text-muted-foreground">{config.label}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-secondary" />
                    <span className="text-sm text-muted-foreground">Weekend</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar with events */}
            <div className="space-y-6">
              {/* Selected date events */}
              <div className="bg-card rounded-2xl border border-border p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">
                  {selectedDate 
                    ? `${parseInt(selectedDate.split('-')[2])} ${MONTHS_RO[parseInt(selectedDate.split('-')[1]) - 1]}`
                    : "Selectează o zi"
                  }
                </h3>
                {selectedDateEvents.length > 0 ? (
                  <div className="space-y-3">
                    {selectedDateEvents.map((event, index) => {
                      const config = eventTypeConfig[event.type];
                      const Icon = config.icon;
                      return (
                        <div key={index} className={cn("p-4 rounded-xl", `${config.color}/10`)}>
                          <div className="flex items-center gap-3">
                            <Icon className={cn("w-5 h-5", config.textColor)} />
                            <div>
                              <p className="font-medium text-foreground">{event.title}</p>
                              {event.description && (
                                <p className="text-sm text-muted-foreground">{event.description}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : selectedDate ? (
                  <p className="text-muted-foreground text-sm">Zi normală de curs</p>
                ) : (
                  <p className="text-muted-foreground text-sm">Click pe o zi pentru detalii</p>
                )}
              </div>

              {/* Upcoming events */}
              <div className="bg-card rounded-2xl border border-border p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Evenimente următoare</h3>
                <div className="space-y-3">
                  {schoolEvents
                    .filter(e => new Date(e.date) >= new Date(2024, 11, 12))
                    .slice(0, 5)
                    .map((event, index) => {
                      const config = eventTypeConfig[event.type];
                      const Icon = config.icon;
                      const eventDate = new Date(event.date);
                      return (
                        <div key={index} className="flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/30 transition-colors">
                          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", `${config.color}/20`)}>
                            <Icon className={cn("w-5 h-5", config.textColor)} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground text-sm truncate">{event.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {eventDate.getDate()} {MONTHS_RO[eventDate.getMonth()]}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SchoolCalendar;
