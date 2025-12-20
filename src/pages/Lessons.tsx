import { useMemo, useState } from "react";
import { BookOpen, Search, Sparkles, Plus, ChevronRight } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useLessonsForCurrentUser, LessonRow } from "@/features/calendar/queries";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const statusConfig = {
  planned: { label: "Planificat", color: "bg-secondary text-muted-foreground" },
  'in-progress': { label: "În progres", color: "bg-warning/10 text-warning" },
  completed: { label: "Finalizat", color: "bg-success/10 text-success" },
} as const;

const Lessons = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState("Toate");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLesson, setSelectedLesson] = useState<LessonRow | null>(null);

  const { user, activeRole } = useAuth();
  const lessonsQuery = useLessonsForCurrentUser(activeRole, user?.id ?? null);

  const subjects = useMemo(() => {
    const set = new Set<string>();
    for (const l of lessonsQuery.data ?? []) {
      set.add(l.subject?.name ?? 'Fără materie');
    }
    return ["Toate", ...Array.from(set).sort((a, b) => a.localeCompare(b, 'ro'))];
  }, [lessonsQuery.data]);

  const filteredLessons = useMemo(() => {
    const rows = lessonsQuery.data ?? [];
    return rows.filter(lesson => {
      const subjectName = lesson.subject?.name ?? 'Fără materie';
      const matchesSubject = selectedSubject === "Toate" || subjectName === selectedSubject;
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q ||
        lesson.title.toLowerCase().includes(q) ||
        subjectName.toLowerCase().includes(q);
      return matchesSubject && matchesSearch;
    });
  }, [lessonsQuery.data, selectedSubject, searchQuery]);

  const canCreate = activeRole === 'teacher' || activeRole === 'homeroom_teacher' || activeRole === 'secretariat' || activeRole === 'director';

  const [createOpen, setCreateOpen] = useState(false);
  const [newLesson, setNewLesson] = useState({
    title: '',
    description: '',
    lesson_date: new Date().toISOString().slice(0, 10),
    status: 'planned' as LessonRow['status'],
    class_id: '',
    subject_id: '' as string | null,
  });

  const classesQuery = useMemo(() => ({ enabled: Boolean(user?.id) }), [user?.id]);

  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [subjectsForClass, setSubjectsForClass] = useState<{ id: string; name: string }[]>([]);

  const loadClasses = async () => {
    if (!user) return;
    let q = supabase.from('classes').select('id,name').order('name', { ascending: true });
    if (activeRole === 'teacher' || activeRole === 'homeroom_teacher') {
      q = q.eq('teacher_id', user.id);
    }
    const { data, error } = await q;
    if (error) {
      toast({ title: 'Eroare', description: error.message, variant: 'destructive' });
      return;
    }
    setClasses(data ?? []);
  };

  const loadSubjectsFor = async (classId: string) => {
    const { data, error } = await supabase.from('subjects').select('id,name').eq('class_id', classId).order('name', { ascending: true });
    if (error) {
      toast({ title: 'Eroare', description: error.message, variant: 'destructive' });
      return;
    }
    setSubjectsForClass(data ?? []);
  };

  const createLesson = async () => {
    if (!user) return;
    if (!newLesson.title || !newLesson.class_id) {
      toast({ title: 'Eroare', description: 'Titlul și clasa sunt obligatorii.', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('lessons').insert({
      class_id: newLesson.class_id,
      subject_id: newLesson.subject_id || null,
      title: newLesson.title,
      description: newLesson.description || null,
      lesson_date: newLesson.lesson_date,
      status: newLesson.status,
      created_by: user.id,
    });
    if (error) {
      toast({ title: 'Eroare', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Salvat', description: 'Lecția a fost adăugată.' });
    setCreateOpen(false);
    setNewLesson({ title: '', description: '', lesson_date: new Date().toISOString().slice(0, 10), status: 'planned', class_id: '', subject_id: '' });
    await lessonsQuery.refetch();
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

      <main className={cn("transition-all duration-300", sidebarCollapsed ? "ml-20" : "ml-64")}>
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-8 sticky top-0 z-30">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Lecții și Materiale</h1>
            <p className="text-sm text-muted-foreground">Din baza de date (Supabase)</p>
          </div>
          {canCreate && (
            <Dialog open={createOpen} onOpenChange={async (open) => {
              setCreateOpen(open);
              if (open) await loadClasses();
            }}>
              <DialogTrigger asChild>
                <Button className="gap-2"><Plus className="w-4 h-4" /> Adaugă</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Adaugă lecție</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Clasă</Label>
                    <Select value={newLesson.class_id} onValueChange={async (v) => {
                      setNewLesson(s => ({ ...s, class_id: v, subject_id: '' }));
                      await loadSubjectsFor(v);
                    }}>
                      <SelectTrigger><SelectValue placeholder="Selectează clasa" /></SelectTrigger>
                      <SelectContent>
                        {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Materie (opțional)</Label>
                    <Select value={newLesson.subject_id ?? ''} onValueChange={(v) => setNewLesson(s => ({ ...s, subject_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Selectează materia" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Fără materie</SelectItem>
                        {subjectsForClass.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Titlu</Label>
                    <Input value={newLesson.title} onChange={(e) => setNewLesson(s => ({ ...s, title: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Data</Label>
                    <Input type="date" value={newLesson.lesson_date} onChange={(e) => setNewLesson(s => ({ ...s, lesson_date: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={newLesson.status} onValueChange={(v) => setNewLesson(s => ({ ...s, status: v as any }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="planned">Planificat</SelectItem>
                        <SelectItem value="in-progress">În progres</SelectItem>
                        <SelectItem value="completed">Finalizat</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Descriere (opțional)</Label>
                    <Textarea value={newLesson.description} onChange={(e) => setNewLesson(s => ({ ...s, description: e.target.value }))} />
                  </div>
                  <Button onClick={createLesson}>Salvează</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </header>

        <div className="p-8">
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
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

              <div className="grid sm:grid-cols-2 gap-4">
                {filteredLessons.map(lesson => {
                  const subjectName = lesson.subject?.name ?? 'Fără materie';
                  const cfg = statusConfig[lesson.status];
                  return (
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
                            <p className="text-xs text-muted-foreground">{subjectName}</p>
                            <p className="text-xs text-muted-foreground">{lesson.lesson_date}</p>
                          </div>
                        </div>
                        <span className={cn("px-2 py-1 rounded-full text-xs font-medium", cfg.color)}>
                          {cfg.label}
                        </span>
                      </div>

                      <h3 className="font-semibold text-foreground mb-2">{lesson.title}</h3>
                      {lesson.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{lesson.description}</p>
                      )}

                      <div className="flex items-center justify-between mt-4">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Sparkles className="w-4 h-4 text-accent" />
                          AI: rezumat/quiz (roadmap)
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  );
                })}
              </div>

              {filteredLessons.length === 0 && (
                <div className="text-sm text-muted-foreground">Nu există lecții pentru filtrul curent.</div>
              )}
            </div>

            <div className="space-y-6">
              <div className="bg-card rounded-2xl border border-border p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">Detalii</h3>
                {selectedLesson ? (
                  <div className="space-y-2">
                    <p className="font-medium">{selectedLesson.title}</p>
                    <p className="text-sm text-muted-foreground">{selectedLesson.subject?.name ?? 'Fără materie'} • {selectedLesson.lesson_date}</p>
                    {selectedLesson.description && (
                      <p className="text-sm text-muted-foreground">{selectedLesson.description}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Selectează o lecție din listă.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Lessons;
