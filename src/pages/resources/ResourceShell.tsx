import { ReactNode } from "react";
import DashboardLayout from "@/components/layouts/DashboardLayout";

type Props = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

export default function ResourceShell({ title, subtitle, children }: Props) {
  return (
    <DashboardLayout title={title} subtitle={subtitle}>
      {children}
    </DashboardLayout>
  );
}
