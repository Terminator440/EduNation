import { BookOpen, Brain, Calendar, FileText } from "lucide-react";
import { Link } from "react-router-dom";

const actions = [
  {
    icon: BookOpen,
    label: "Vezi lecțiile",
    description: "Accesează materialele",
    href: "/dashboard/lessons",
    color: "primary",
  },
  {
    icon: Brain,
    label: "Explicații AI",
    description: "Înțelege mai ușor",
    href: "/dashboard/lessons",
    color: "accent",
  },
  {
    icon: Calendar,
    label: "Calendar",
    description: "Planifică-ți timpul",
    href: "/dashboard/calendar",
    color: "success",
  },
  {
    icon: FileText,
    label: "Manuale",
    description: "Cărți digitale",
    href: "/dashboard/lessons",
    color: "warning",
  },
];

const QuickActions = () => {
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
      <div className="grid grid-cols-2 gap-3">
        {actions.map((action) => (
          <Link
            key={action.label}
            to={action.href}
            className="group flex flex-col items-center p-4 rounded-xl border border-border hover:border-primary/30 hover:shadow-md transition-all"
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-colors ${getColorClasses(action.color)}`}>
              <action.icon className="w-6 h-6" />
            </div>
            <span className="font-medium text-foreground text-sm text-center">{action.label}</span>
            <span className="text-xs text-muted-foreground text-center mt-0.5">{action.description}</span>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default QuickActions;
