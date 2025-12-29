import { BookText } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import ResourceShell from "./ResourceShell";

export default function Magazines() {
  return (
    <ResourceShell title="Reviste" subtitle="Revista școlii și publicații" >
      <Alert>
        <BookText className="h-4 w-4" />
        <div>
          <AlertTitle>Nu există încă reviste publicate</AlertTitle>
          <AlertDescription>
            Școala nu a publicat încă reviste sau publicații. Când apar, le vei găsi aici.
          </AlertDescription>
        </div>
      </Alert>
    </ResourceShell>
  );
}
