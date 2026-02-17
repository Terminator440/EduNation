import { memo } from "react";
import { BookOpen, Calendar, FileText, ClipboardList } from "lucide-react";
import { Link } from "react-router-dom";

const actions = [
  {
    icon: BookOpen,
    label: "Materiale",
    description: "Accesează resurse",
    href: "/dashboard/lessons",
    color: "primary",
  },
  {
    icon: ClipboardList,
    label: "Condică",
    description: "Ore predate",
    href: "/teacher",
    color: "accent",
  },
  {
    icon: Calendar,
    label: "Calendar",
    description: "Evenimente și teste",
    href: "/dashboard/calendar",
    color: "success",
  },
  {
    icon: FileText,
    label: "Rapoarte",
    description: "Export / print",
    href: "/reports",
    color: "warning",
  },
];

const QuickActions = memo(function QuickActions() {
  const getColorClasses = (color: string) => {
    switch (color) {
      case "primary":
        return "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground";
      case "accent":
        return "bg-accent/10 text-accent group-hover:bg-accent group-hover:text-accent-foreground";
      case "success":
        return "bg-success/10 text-success group-hover:bg-success group-hover:text-success-foreground";
      case "warning":
        return "bg-warning/10 text-warning group-hover:bg-warning group-hover:text-warning-foreground";
      default:
        return "bg-secondary text-muted-foreground";
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-6">
      <h3 className="text-lg font-semibold text-foreground mb-4">Acțiuni rapide</h3>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {actions.map((action) => (
          <Link
            key={action.label}
            to={action.href}
            className="group flex flex-col items-center p-4 rounded-xl border border-border hover:border-primary/30 transition-colors"
          >
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-colors ${getColorClasses(
                action.color
              )}`}
            >
              <action.icon className="w-6 h-6" />
            </div>
            <span className="font-medium text-foreground text-sm text-center">{action.label}</span>
            <span className="text-xs text-muted-foreground text-center mt-0.5">{action.description}</span>
          </Link>
        ))}
      </div>
    </div>
  );
});

export default QuickActions;
