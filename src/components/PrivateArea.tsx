"use client";
import { Protected } from "../features/auth/AuthProvider";
export default function PrivateArea({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Protected>{children}</Protected>;
}
