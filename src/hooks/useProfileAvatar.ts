"use client";

import { useQuery } from "@tanstack/react-query";
import { signImage } from "../services/data";
import type { Profile } from "../types/domain";

export function useProfileAvatar(profile?: Pick<Profile, "id" | "avatar_path">) {
  const path = profile?.avatar_path;
  return useQuery({
    queryKey: ["profile-avatar", profile?.id, path],
    queryFn: async () => {
      const url = await signImage(path!);
      if (!url) throw new Error("No pudimos cargar tu foto de perfil.");
      return url;
    },
    enabled: Boolean(path),
    // Storage firma por diez minutos; renovar antes del vencimiento.
    staleTime: 8 * 60 * 1000,
    refetchInterval: 8 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}
