import { PortfolioView } from "@/screens/Public";
import { demoPortfolio } from "@/lib/demo";
export const metadata = {
  title: "Portfolio de ejemplo | Propi",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <PortfolioView data={demoPortfolio} demo />;
}
