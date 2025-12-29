import { FileText } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import ResourceShell from "./ResourceShell";

export default function Documents() {
  return (
    <ResourceShell title="Documente" subtitle="Adeverințe, cereri, formulare" >
      <Alert>
        <FileText className="h-4 w-4" />
        <div>
          <AlertTitle>Nu există încă documente publicate</AlertTitle>
          <AlertDescription>
            Când școala publică documente sau formulare, le vei găsi aici.
          </AlertDescription>
        </div>
      </Alert>
    </ResourceShell>
  );
}
