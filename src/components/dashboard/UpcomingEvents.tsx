import { Calendar, BookOpen, FileText, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Event {
  id: string;
  title: string;
  date: string;
  time?: string;
  type: "test" | "homework" | "event" | "holiday";
  subject?: string;
}

interface UpcomingEventsProps {
  events: Event[];
}

const UpcomingEvents = ({ events }: UpcomingEventsProps) => {
  const getEventStyles = (type: Event["type"]) => {
    switch (type) {
      case "test":
        return {
          icon: FileText,
          bg: "bg-destructive/10",
          text: "text-destructive",
          border: "border-destructive/20",
        };
      case "homework":
        return {
          icon: BookOpen,
          bg: "bg-warning/10",
          text: "text-warning",
          border: "border-warning/20",
        };
      case "event":
        return {
          icon: Calendar,
          bg: "bg-primary/10",
          text: "text-primary",
          border: "border-primary/20",
        };
      case "holiday":
        return {
          icon: Clock,
          bg: "bg-success/10",
          text: "text-success",
          border: "border-success/20",
        };
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Evenimente următoare</h3>
          <p className="text-sm text-muted-foreground mt-1">Ce urmează în calendar</p>
        </div>
        <Calendar className="w-5 h-5 text-muted-foreground" />
      </div>

      <div className="space-y-3">
        {events.map((event) => {
          const styles = getEventStyles(event.type);
          const Icon = styles.icon;
          
          return (
            <div
              key={event.id}
              className={cn(
                "flex items-start gap-4 p-4 rounded-xl border transition-colors hover:bg-secondary/30",
                styles.border
              )}
            >
              <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                styles.bg
              )}>
                <Icon className={cn("w-5 h-5", styles.text)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{event.title}</p>
                {event.subject && (
                  <p className="text-sm text-muted-foreground">{event.subject}</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-muted-foreground">{event.date}</span>
                  {event.time && (
                    <>
                      <span className="text-muted-foreground">•</span>
                      <span className="text-sm text-muted-foreground">{event.time}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default UpcomingEvents;
