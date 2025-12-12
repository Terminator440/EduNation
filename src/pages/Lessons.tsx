import { useState } from "react";
import { BookOpen, Brain, FileText, Play, ChevronRight, Search, Sparkles } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Lesson {
  id: string;
  subject: string;
  title: string;
  chapter: string;
  duration: string;
  hasAI: boolean;
  status: "completed" | "in-progress" | "not-started";
}

const mockLessons: Lesson[] = [
  { id: "1", subject: "Matematică", title: "Funcții trigonometrice", chapter: "Capitolul 3", duration: "45 min", hasAI: true, status: "completed" },
  { id: "2", subject: "Matematică", title: "Ecuații trigonometrice", chapter: "Capitolul 3", duration: "50 min", hasAI: true, status: "in-progress" },
  { id: "3", subject: "Fizică", title: "Legile lui Newton", chapter: "Mecanică", duration: "40 min", hasAI: true, status: "completed" },
  { id: "4", subject: "Fizică", title: "Lucru mecanic și energie", chapter: "Mecanică", duration: "55 min", hasAI: true, status: "not-started" },
  { id: "5", subject: "Informatică", title: "Algoritmi de sortare", chapter: "Algoritmi", duration: "60 min", hasAI: true, status: "completed" },
  { id: "6", subject: "Informatică", title: "Grafuri și arbori", chapter: "Structuri de date", duration: "65 min", hasAI: true, status: "in-progress" },
  { id: "7", subject: "Limba Română", title: "Ion - analiza personajelor", chapter: "Liviu Rebreanu", duration: "50 min", hasAI: true, status: "completed" },
  { id: "8", subject: "Limba Română", title: "Moara cu noroc - teme și motive", chapter: "Ioan Slavici", duration: "45 min", hasAI: true, status: "not-started" },
  { id: "9", subject: "Istorie", title: "Primul Război Mondial", chapter: "Secolul XX", duration: "55 min", hasAI: false, status: "completed" },
  { id: "10", subject: "Biologie", title: "Sistemul nervos", chapter: "Anatomie", duration: "50 min", hasAI: true, status: "not-started" },
];

const subjects = ["Toate", "Matematică", "Fizică", "Informatică", "Limba Română", "Istorie", "Biologie"];

const statusConfig = {
  "completed": { label: "Finalizat", color: "bg-success/10 text-success" },
  "in-progress": { label: "În progres", color: "bg-warning/10 text-warning" },
  "not-started": { label: "Neînceput", color: "bg-secondary text-muted-foreground" },
};

const Lessons = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState("Toate");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);

  const filteredLessons = mockLessons.filter(lesson => {
    const matchesSubject = selectedSubject === "Toate" || lesson.subject === selectedSubject;
    const matchesSearch = lesson.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          lesson.subject.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSubject && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      
      <main className={cn(
        "transition-all duration-300",
        sidebarCollapsed ? "ml-20" : "ml-64"
      )}>
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center px-8 sticky top-0 z-30">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Lecții și Materiale</h1>
            <p className="text-sm text-muted-foreground">Accesează conținutul din programă</p>
          </div>
        </header>

        <div className="p-8">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Lessons list */}
            <div className="lg:col-span-2 space-y-6">
              {/* Search and filter */}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Caută lecții..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {subjects.map(subject => (
                    <button
                      key={subject}
                      onClick={() => setSelectedSubject(subject)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                        selectedSubject === subject
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      )}
                    >
                      {subject}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lessons grid */}
              <div className="grid sm:grid-cols-2 gap-4">
                {filteredLessons.map(lesson => (
                  <div
                    key={lesson.id}
                    onClick={() => setSelectedLesson(lesson)}
                    className={cn(
                      "bg-card rounded-2xl border border-border p-5 cursor-pointer transition-all hover:shadow-md hover:border-primary/30",
                      selectedLesson?.id === lesson.id && "ring-2 ring-primary"
                    )}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          <BookOpen className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{lesson.subject}</p>
                          <p className="text-xs text-muted-foreground">{lesson.chapter}</p>
                        </div>
                      </div>
                      {lesson.hasAI && (
                        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10">
                          <Sparkles className="w-3 h-3 text-accent" />
                          <span className="text-xs font-medium text-accent">AI</span>
                        </div>
                      )}
                    </div>
                    <h3 className="font-semibold text-foreground mb-2">{lesson.title}</h3>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{lesson.duration}</span>
                      <span className={cn("text-xs px-2 py-1 rounded-full", statusConfig[lesson.status].color)}>
                        {statusConfig[lesson.status].label}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Lesson details */}
            <div className="space-y-6">
              {selectedLesson ? (
                <>
                  <div className="bg-card rounded-2xl border border-border p-6">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                      <span>{selectedLesson.subject}</span>
                      <ChevronRight className="w-4 h-4" />
                      <span>{selectedLesson.chapter}</span>
                    </div>
                    <h2 className="text-xl font-bold text-foreground mb-4">{selectedLesson.title}</h2>
                    
                    <div className="space-y-3">
                      <Button variant="hero" className="w-full" size="lg">
                        <Play className="w-4 h-4" />
                        Începe lecția
                      </Button>
                      
                      {selectedLesson.hasAI && (
                        <Button variant="outline" className="w-full" size="lg">
                          <Brain className="w-4 h-4" />
                          Explicație AI
                        </Button>
                      )}
                      
                      <Button variant="secondary" className="w-full" size="lg">
                        <FileText className="w-4 h-4" />
                        Manual digital
                      </Button>
                    </div>
                  </div>

                  {selectedLesson.hasAI && (
                    <div className="bg-gradient-to-br from-accent/10 to-primary/10 rounded-2xl border border-accent/20 p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <Sparkles className="w-5 h-5 text-accent" />
                        <h3 className="font-semibold text-foreground">Explicație AI disponibilă</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-4">
                        Această lecție are o explicație generată de AI, care rezumă conceptele cheie într-un limbaj ușor de înțeles.
                      </p>
                      <div className="bg-card/50 rounded-xl p-4">
                        <p className="text-sm text-foreground italic">
                          "Această lecție acoperă {selectedLesson.title.toLowerCase()}. Vei învăța conceptele fundamentale și vei vedea exemple practice aplicate..."
                        </p>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-card rounded-2xl border border-border p-6 text-center">
                  <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-semibold text-foreground mb-2">Selectează o lecție</h3>
                  <p className="text-sm text-muted-foreground">
                    Click pe o lecție din listă pentru a vedea detaliile și a accesa materialele.
                  </p>
                </div>
              )}

              {/* Quick stats */}
              <div className="bg-card rounded-2xl border border-border p-6">
                <h3 className="font-semibold text-foreground mb-4">Progresul tău</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Lecții finalizate</span>
                      <span className="font-medium text-foreground">
                        {mockLessons.filter(l => l.status === "completed").length}/{mockLessons.length}
                      </span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-primary rounded-full transition-all"
                        style={{ width: `${(mockLessons.filter(l => l.status === "completed").length / mockLessons.length) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">În progres</span>
                      <span className="font-medium text-warning">
                        {mockLessons.filter(l => l.status === "in-progress").length}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Lessons;
