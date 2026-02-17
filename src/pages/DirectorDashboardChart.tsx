import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export type GradeChartDataPoint = { nota: string; count: number };

export default function DirectorDashboardChart({
  data,
}: {
  data: GradeChartDataPoint[];
}) {
  const isEmpty = data.every((d) => d.count === 0);

  return (
    <Card className="content-visibility-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Distribuția notelor
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Număr de note pe fiecare valoare (1–10) în școală
        </p>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <p className="py-12 text-center text-muted-foreground">Nu există note încă.</p>
        ) : (
          <ChartContainer
            config={{
              count: { label: "Note", color: "hsl(var(--primary))" },
            }}
            className="h-[17.5rem] w-full"
          >
            <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="nota"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(v) => v}
              />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
