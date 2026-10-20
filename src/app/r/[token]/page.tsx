import { ReviewForm } from "@/features/reviews/Reviews";
export const metadata = {
  title: "Compartí tu experiencia | Propi",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <ReviewForm />;
}
