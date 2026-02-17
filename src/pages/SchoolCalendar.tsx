import { useMemo, useState, useCallback } from "react";
import { CalendarIcon, ChevronLeft, ChevronRight, PartyPopper, GraduationCap, BookOpen, Plus, type LucideIcon } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useSchoolEventsForMonth } from "@/features/calendar/queries";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const DAYS_RO = ["Lun", "Mar", "Mie", "Joi", "Vin", "Sâm", "Dum"];
const MONTHS_RO = [
  "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
  "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie",
];

type EventType = "holiday" | "event" | "test" | "homework";

const eventTypeConfig: Record<EventType, { color: string; textColor: string; icon: LucideIcon; label: string }> = {
  holiday: { color: "bg-success", textColor: "text-success", icon: PartyPopper, label: "Vacanță/Sărbătoare" },
  event: { color: "bg-primary", textColor: "text-primary", icon: CalendarIcon, label: "Eveniment" },
  test: { color: "bg-destructive", textColor: "text-destructive", icon: GraduationCap, label: "Test/Examen" },
  homework: { color: "bg-warning", textColor: "text-warning", icon: BookOpen, label: "Temă" },
};

const SchoolCalendar = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const onToggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  const { user, activeRole } = useAuth();
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const eventsQuery = useSchoolEventsForMonth(year, month);

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();

  // 0 = Sunday, adjust to Monday start
  let startDay = firstDayOfMonth.getDay() - 1;
  if (startDay === -1) startDay = 6;

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const eventsByDate = useMemo(() => {
    const map = new Map<string, typeof eventsQuery.data>();
    for (const e of eventsQuery.data ?? []) {
      const key = e.event_date;
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [eventsQuery.data]);

  const getEventsForDate = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return eventsByDate.get(dateStr) ?? [];
  };

  const isWeekend = (day: number) => {
    const date = new Date(year, month, day);
    return date.getDay() === 0 || date.getDay() === 6;
  };

  const isToday = (day: number) => {
    const today = new Date();
    return year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
  };

  const getDayType = (day: number): EventType | "weekend" | "school" => {
    const events = getEventsForDate(day);
    if (events.length > 0) {
      // Priority: holiday > test > homework > event
      if (events.some(e => e.type === "holiday")) return "holiday";
      if (events.some(e => e.type === "test")) return "test";
      if (events.some(e => e.type === "homework")) return "homework";
      return "event";
    }
    if (isWeekend(day)) return "weekend";
    return "school";
  };

  const selectedDateEvents = selectedDate ? (eventsByDate.get(selectedDate) ?? []) : [];

  // Calendar grid
  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) calendarDays.push(null);
  for (let day = 1; day <= daysInMonth; day++) calendarDays.push(day);

  const canManage = activeRole === 'secretariat' || activeRole === 'director' || activeRole === 'uat_admin';

  const [newEvent, setNewEvent] = useState({
    event_date: '',
    event_time: '',
    type: 'event' as EventType,
    title: '',
    subject: '',
    description: '',
  });

  const createEvent = async () => {
    if (!user || !newEvent.title || !newEvent.event_date) {
      toast({ title: 'Eroare', description: 'Completează titlul și data.', variant: 'destructive' });
      return;
    }
    
    const { error } = await supabase.from('school_events').insert({
      event_date: newEvent.event_date,
      event_time: newEvent.event_time || null,
      type: newEvent.type,
      title: newEvent.title,
      subject: newEvent.subject || null,
      description: newEvent.description || null,
      created_by: user.id,
    });
    
    if (error) {
      toast({ title: 'Eroare', description: error.message, variant: 'destructive' });
      return;
    }
    
    toast({ title: 'Succes', description: 'Evenimentul a fost adăugat.' });
    // Reset form
    setNewEvent({
      event_date: '',
      event_time: '',
      type: 'event',
      title: '',
      subject: '',
      description: '',
    });
    // Refetch events
    eventsQuery.refetch();
  };

  return (
    <div className="min-h-screen w-full bg-background">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={onToggleSidebar} />

      <main className={cn("w-full min-w-0 transition-all duration-300 will-change-transform pt-14 md:pt-0", sidebarCollapsed ? "ml-0 md:ml-20" : "ml-0 md:ml-64")}>
        <header className="w-full h-16 border-b border-border bg-card flex items-center justify-between px-4 sm:px-6 lg:px-8 sticky top-14 md:top-0 z-30">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Calendar Școlar</h1>
            <p className="text-sm text-muted-foreground">Evenimente și termene</p>
          </div>
          {canManage && (
            <Dialog>
              <DialogTrigger asChild>
                <Button className="gap-2"><Plus className="w-4 h-4" /> Adaugă</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Adaugă eveniment</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Data</Label>
                    <Input type="date" value={newEvent.event_date} onChange={(e) => setNewEvent(v => ({ ...v, event_date: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Ora (opțional)</Label>
                    <Input placeholder="10:00" value={newEvent.event_time} onChange={(e) => setNewEvent(v => ({ ...v, event_time: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Tip</Label>
                    <Select value={newEvent.type} onValueChange={(v) => setNewEvent(s => ({ ...s, type: v as EventType }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="event">Eveniment</SelectItem>
                        <SelectItem value="test">Test</SelectItem>
                        <SelectItem value="homework">Temă</SelectItem>
                        <SelectItem value="holiday">Vacanță/Sărbătoare</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Titlu</Label>
                    <Input value={newEvent.title} onChange={(e) => setNewEvent(v => ({ ...v, title: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Materie (opțional)</Label>
                    <Input value={newEvent.subject} onChange={(e) => setNewEvent(v => ({ ...v, subject: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Descriere (opțional)</Label>
                    <Textarea value={newEvent.description} onChange={(e) => setNewEvent(v => ({ ...v, description: e.target.value }))} />
                  </div>
                  <Button onClick={createEvent}>Salvează</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </header>

        <div className="w-full max-w-screen-xl mx-auto p-4 sm:p-6 lg:p-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="bg-card rounded-2xl border border-border p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-foreground">{MONTHS_RO[month]} {year}</h2>
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></Button>
                    <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="w-4 h-4" /></Button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1 mb-2">
                  {DAYS_RO.map(d => (
                    <div key={d} className="text-center text-sm font-medium text-muted-foreground py-2">{d}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((day, index) => {
                    if (day === null) return <div key={`empty-${index}`} className="aspect-square" />;
                    const dayType = getDayType(day);
                    const events = getEventsForDate(day);
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const isSelected = selectedDate === dateStr;

                    return (
                      <button
                        key={day}
                        onClick={() => setSelectedDate(dateStr)}
                        className={cn(
                          "aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all will-change-transform hover:scale-105",
                          isToday(day) && "ring-2 ring-primary ring-offset-2",
                          isSelected && "ring-2 ring-accent ring-offset-2",
                          dayType === "holiday" && "bg-success/20",
                          dayType === "test" && "bg-destructive/20",
                          dayType === "homework" && "bg-warning/20",
                          dayType === "event" && "bg-primary/20",
                          dayType === "weekend" && "bg-muted/50",
                          dayType === "school" && "bg-secondary/30 hover:bg-secondary/50"
                        )}
                      >
                        <span className={cn(
                          "text-sm font-semibold",
                          dayType === "weekend" && "text-muted-foreground",
                          dayType === "holiday" && "text-success",
                          dayType === "test" && "text-destructive",
                          dayType === "homework" && "text-warning",
                          (dayType === "school" || dayType === "event") && "text-foreground",
                        )}>{day}</span>
                        {events.length > 0 && (
                          <div className="flex gap-0.5 mt-1">
                            {events.slice(0, 3).map((e, i: number) => (
                              <div key={i} className={cn("w-1.5 h-1.5 rounded-full", eventTypeConfig[e.type as EventType].color)} />
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-4 mt-6 pt-6 border-t border-border">
                  {Object.entries(eventTypeConfig).map(([k, cfg]) => (
                    <div key={k} className="flex items-center gap-2">
                      <div className={cn("w-3 h-3 rounded-full", cfg.color)} />
                      <span className="text-sm text-muted-foreground">{cfg.label}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-secondary" />
                    <span className="text-sm text-muted-foreground">Zi de curs</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-muted" />
                    <span className="text-sm text-muted-foreground">Weekend</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-card rounded-2xl border border-border p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">
                  {selectedDate ? selectedDate : "Selectează o zi"}
                </h3>
                {selectedDateEvents.length > 0 ? (
                  <div className="space-y-3">
                    {selectedDateEvents.map((event) => {
                      const cfg = eventTypeConfig[event.type as EventType];
                      const Icon = cfg.icon;
                      return (
                        <div key={event.id} className={cn("p-4 rounded-xl", `${cfg.color}/10`)}>
                          <div className="flex items-center gap-3">
                            <Icon className={cn("w-5 h-5", cfg.textColor)} />
                            <div>
                              <p className="font-medium text-foreground">{event.title}</p>
                              {(event.subject || event.event_time) && (
                                <p className="text-sm text-muted-foreground">
                                  {event.subject ? event.subject : ""}
                                  {event.subject && event.event_time ? " • " : ""}
                                  {event.event_time ? event.event_time : ""}
                                </p>
                              )}
                              {event.description && (
                                <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nu sunt evenimente pentru această zi.</p>
                )}
              </div>

              <div className="bg-card rounded-2xl border border-border p-6">
                <h3 className="text-lg font-semibold text-foreground mb-2">Sfat</h3>
                <p className="text-sm text-muted-foreground">Evenimentele vin din baza de date (Supabase). Dacă nu vezi nimic, adaugă evenimente din Secretariat/Director sau verifică politicile RLS.</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SchoolCalendar;
