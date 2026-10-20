import type { Metadata } from "next";
import PrivateArea from "@/components/PrivateArea";
import DashboardLayout from "@/components/DashboardLayout";
export const metadata: Metadata = {
  title: "Tu espacio | Propi",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <PrivateArea>
      <DashboardLayout>{children}</DashboardLayout>
    </PrivateArea>
  );
}
