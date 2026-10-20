import ProfileEditor from "@/features/profile/ProfileEditor";
import PrivateArea from "@/components/PrivateArea";
export const metadata = {
  title: "Tu perfil, paso a paso | Propi",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <PrivateArea>
      <ProfileEditor onboarding />
    </PrivateArea>
  );
}
