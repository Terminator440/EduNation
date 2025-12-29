import { Library as LibraryIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import ResourceShell from "./ResourceShell";

export default function Library() {
  return (
    <ResourceShell title="Bibliotecă" subtitle="Lecturi și materiale" >
      <Alert>
        <LibraryIcon className="h-4 w-4" />
        <div>
          <AlertTitle>Nu există încă elemente în bibliotecă</AlertTitle>
          <AlertDescription>
            Școala nu a publicat încă materiale în bibliotecă. Când apar, le vei găsi aici.
          </AlertDescription>
        </div>
      </Alert>
    </ResourceShell>
  );
}
