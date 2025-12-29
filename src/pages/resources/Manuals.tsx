import { Book } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import ResourceShell from "./ResourceShell";

export default function Manuals() {
  return (
    <ResourceShell title="Manuale" subtitle="Manuale digitale și fișe" >
      <Alert>
        <Book className="h-4 w-4" />
        <div>
          <AlertTitle>Nu există încă manuale publicate</AlertTitle>
          <AlertDescription>
            Când școala publică manuale digitale pentru clasa ta, le vei găsi aici.
          </AlertDescription>
        </div>
      </Alert>
    </ResourceShell>
  );
}
