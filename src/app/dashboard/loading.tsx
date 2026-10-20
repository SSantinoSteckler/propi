import { Loading } from "@/components/ui";
export default function LoadingPage() {
  return (
    <div
      className="container section"
      role="status"
      aria-label="Cargando página"
    >
      <Loading />
    </div>
  );
}
