import { useState, useEffect } from "react";
import { User, Bell, Shield, Palette, LogOut, Sun, Moon } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

const Settings = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark') {
      document.documentElement.classList.add('dark');
      setIsDark(true);
    } else if (stored === 'light') {
      document.documentElement.classList.remove('dark');
      setIsDark(false);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.classList.add('dark');
      setIsDark(true);
    }
  }, []);

  const setTheme = (dark: boolean) => {
    if (dark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setIsDark(true);
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setIsDark(false);
    }
    toast({
      title: "Temă schimbată",
      description: `Tema ${dark ? 'întunecată' : 'luminoasă'} a fost aplicată.`,
    });
  };

  const [notifications, setNotifications] = useState({
    grades: true,
    attendance: true,
    events: true,
    messages: false,
  });

  const handleSave = () => {
    toast({
      title: "Setări salvate",
      description: "Modificările au fost salvate cu succes.",
    });
  };

  const handleLogout = () => {
    toast({
      title: "Deconectat",
      description: "Ai fost deconectat cu succes.",
    });
    navigate("/");
  };

  const tabs = [
    { id: "profile", label: "Profil", icon: User },
    { id: "notifications", label: "Notificări", icon: Bell },
    { id: "security", label: "Securitate", icon: Shield },
    { id: "appearance", label: "Aspect", icon: Palette },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      
      <main className={cn(
        "transition-all duration-300",
        sidebarCollapsed ? "ml-20" : "ml-64"
      )}>
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center px-8 sticky top-0 z-30">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Setări</h1>
            <p className="text-sm text-muted-foreground">Configurează-ți contul</p>
          </div>
        </header>

        <div className="p-8">
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-4 gap-8">
              {/* Tabs */}
              <div className="md:col-span-1">
                <nav className="space-y-1">
                  {tabs.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors",
                        activeTab === tab.id
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                      )}
                    >
                      <tab.icon className="w-5 h-5" />
                      <span className="font-medium">{tab.label}</span>
                    </button>
                  ))}
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-destructive hover:bg-destructive/10 transition-colors mt-4"
                  >
                    <LogOut className="w-5 h-5" />
                    <span className="font-medium">Deconectare</span>
                  </button>
                </nav>
              </div>

              {/* Content */}
              <div className="md:col-span-3">
                <div className="bg-card rounded-2xl border border-border p-6">
                  {activeTab === "profile" && (
                    <div className="space-y-6">
                      <div>
                        <h2 className="text-lg font-semibold text-foreground mb-4">Informații personale</h2>
                        <div className="flex items-center gap-6 mb-6">
                          <div className="w-20 h-20 rounded-full bg-gradient-primary flex items-center justify-center text-primary-foreground text-2xl font-bold">
                            AP
                          </div>
                          <Button variant="outline">Schimbă poza</Button>
                        </div>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="firstName">Prenume</Label>
                          <Input id="firstName" defaultValue="Alexandru" className="mt-1" />
                        </div>
                        <div>
                          <Label htmlFor="lastName">Nume</Label>
                          <Input id="lastName" defaultValue="Popescu" className="mt-1" />
                        </div>
                        <div>
                          <Label htmlFor="email">Email</Label>
                          <Input id="email" type="email" defaultValue="alexandru.popescu@scoala.ro" className="mt-1" />
                        </div>
                        <div>
                          <Label htmlFor="phone">Telefon</Label>
                          <Input id="phone" type="tel" defaultValue="+40 700 000 000" className="mt-1" />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="school">Școala</Label>
                        <Input id="school" defaultValue='Liceul Teoretic "Nicolae Bălcescu"' className="mt-1" disabled />
                      </div>
                      <div>
                        <Label htmlFor="class">Clasa</Label>
                        <Input id="class" defaultValue="a X-a B" className="mt-1" disabled />
                      </div>
                      <Button variant="hero" onClick={handleSave}>Salvează modificările</Button>
                    </div>
                  )}

                  {activeTab === "notifications" && (
                    <div className="space-y-6">
                      <h2 className="text-lg font-semibold text-foreground mb-4">Preferințe notificări</h2>
                      <div className="space-y-4">
                        {[
                          { key: "grades", label: "Note noi", description: "Primește notificări când primești o notă nouă" },
                          { key: "attendance", label: "Prezență", description: "Alerte pentru absențe sau întârzieri" },
                          { key: "events", label: "Evenimente", description: "Reminder-uri pentru teste și evenimente" },
                          { key: "messages", label: "Mesaje", description: "Notificări pentru mesaje de la profesori" },
                        ].map(item => (
                          <div key={item.key} className="flex items-center justify-between p-4 rounded-xl bg-secondary/30">
                            <div>
                              <p className="font-medium text-foreground">{item.label}</p>
                              <p className="text-sm text-muted-foreground">{item.description}</p>
                            </div>
                            <Switch
                              checked={notifications[item.key as keyof typeof notifications]}
                              onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, [item.key]: checked }))}
                            />
                          </div>
                        ))}
                      </div>
                      <Button variant="hero" onClick={handleSave}>Salvează preferințele</Button>
                    </div>
                  )}

                  {activeTab === "security" && (
                    <div className="space-y-6">
                      <h2 className="text-lg font-semibold text-foreground mb-4">Securitate cont</h2>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="currentPassword">Parola curentă</Label>
                          <Input id="currentPassword" type="password" className="mt-1" />
                        </div>
                        <div>
                          <Label htmlFor="newPassword">Parola nouă</Label>
                          <Input id="newPassword" type="password" className="mt-1" />
                        </div>
                        <div>
                          <Label htmlFor="confirmPassword">Confirmă parola</Label>
                          <Input id="confirmPassword" type="password" className="mt-1" />
                        </div>
                      </div>
                      <Button variant="hero" onClick={handleSave}>Schimbă parola</Button>
                    </div>
                  )}

                  {activeTab === "appearance" && (
                    <div className="space-y-6">
                      <h2 className="text-lg font-semibold text-foreground mb-4">Aspect aplicație</h2>
                      <div className="space-y-4">
                        <div className="p-4 rounded-xl bg-secondary/30">
                          <p className="font-medium text-foreground mb-2">Temă</p>
                          <p className="text-sm text-muted-foreground mb-4">
                            Alege între tema luminoasă și cea întunecată
                          </p>
                          <div className="flex gap-4">
                            <button 
                              onClick={() => setTheme(false)}
                              className={cn(
                                "flex-1 p-4 rounded-xl border-2 bg-card transition-all",
                                !isDark ? "border-primary ring-2 ring-primary/20" : "border-border opacity-60 hover:opacity-80"
                              )}
                            >
                              <div className="w-full h-12 bg-white rounded-lg mb-3 flex items-center justify-center border">
                                <Sun className="w-6 h-6 text-amber-500" />
                              </div>
                              <p className="text-sm font-medium text-foreground">Luminoasă</p>
                            </button>
                            <button 
                              onClick={() => setTheme(true)}
                              className={cn(
                                "flex-1 p-4 rounded-xl border-2 bg-card transition-all",
                                isDark ? "border-primary ring-2 ring-primary/20" : "border-border opacity-60 hover:opacity-80"
                              )}
                            >
                              <div className="w-full h-12 bg-slate-900 rounded-lg mb-3 flex items-center justify-center">
                                <Moon className="w-6 h-6 text-slate-300" />
                              </div>
                              <p className="text-sm font-medium text-foreground">Întunecată</p>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Settings;
