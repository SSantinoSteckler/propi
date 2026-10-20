"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard,
  House,
  Layers,
  MessageSquare,
  ChartNoAxesCombined,
  Globe,
  Settings,
  LogOut,
  Menu,
  ArrowUpRight,
  CircleDot,
  CreditCard,
} from "lucide-react";
import { Logo } from "./ui";
import { getProfile, getPlan } from "../services/data";
import { db } from "../lib/supabase";
import { useProfileAvatar } from "../hooks/useProfileAvatar";
import { ThemeToggle } from "../features/theme/ThemeProvider";
const links = [
  ["", "Resumen", LayoutDashboard],
  ["propiedades", "Mis propiedades", House],
  ["colecciones", "Colecciones", Layers],
  ["resenas", "Reseñas", MessageSquare],
  ["estadisticas", "Estadísticas", ChartNoAxesCombined],
  ["portfolio", "Mi portfolio", Globe],
  ["billing", "Planes y facturación", CreditCard],
  ["configuracion", "Configuración", Settings],
] as const;
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = useQuery({ queryKey: ["profile"], queryFn: getProfile });
  const plan = useQuery({ queryKey: ["plan"], queryFn: getPlan });
  const avatar = useProfileAvatar(profile.data);
  const [failedAvatar, setFailedAvatar] = useState<string>();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const client = useQueryClient();
  return (
    <div className="dashboard-layout">
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <Logo />
        <span className="sidebar-label">TU ESPACIO DE TRABAJO</span>
        <nav>
          {links.map(([path, label, Icon]) => (
            <Link
              key={path}
              href={`/dashboard${path ? `/${path}` : ""}`}
              className={
                (
                  path === ""
                    ? pathname === "/dashboard"
                    : pathname === `/dashboard/${path}` ||
                      pathname.startsWith(`/dashboard/${path}/`)
                )
                  ? "active"
                  : ""
              }
              aria-current={
                (
                  path === ""
                    ? pathname === "/dashboard"
                    : pathname.startsWith(`/dashboard/${path}`)
                )
                  ? "page"
                  : undefined
              }
              onClick={() => setOpen(false)}
            >
              <Icon size={19} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="plan-notice">
            <CircleDot size={18} />
            <strong>
              Tu plan {plan.data?.plan === "pro" ? "Pro" : "Free"}
            </strong>
            <p>
              {plan.data?.plan === "pro"
                ? "Más espacio para tu catálogo y personalización."
                : "Hasta 5 propiedades y una colección activa."}
            </p>
            <Link href="/dashboard/billing">
              Ver mi plan <ArrowUpRight size={14} />
            </Link>
          </div>
          <button
            className="logout"
            onClick={async () => {
              const { error } = await db().auth.signOut();
              if (error) {
                toast.error("No se pudo cerrar la sesión.");
                return;
              }
              client.clear();
              router.push("/login");
            }}
          >
            <LogOut size={18} />
            Cerrar sesión
          </button>
        </div>
      </aside>
      {open && (
        <button
          className="sidebar-overlay"
          aria-label="Cerrar menú"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="dashboard-main">
        <header className="dashboard-topbar">
          <button
            className="icon-btn mobile-menu"
            aria-label="Abrir menú"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <Menu />
          </button>
          <span className="workspace-location">
            Mi escritorio <span aria-hidden="true">/</span>{" "}
            <strong>{links.find(([path]) => path && pathname.startsWith(`/dashboard/${path}`))?.[1] || "Resumen"}</strong>
          </span>
          <div>
            <ThemeToggle />
            {profile.data?.published && (
              <Link className="portfolio-shortcut" aria-label="Ver mi portfolio" href={`/${profile.data.username}`} target="_blank">
                Ver mi portfolio <ArrowUpRight size={15} />
              </Link>
            )}
            <Link
              href="/dashboard/portfolio"
              className="user-avatar"
              aria-label="Editar mi perfil"
              title={profile.data?.first_name ? `Perfil de ${profile.data.first_name}` : "Mi perfil"}
            >
              {avatar.data && failedAvatar !== avatar.data ? (
                <img
                  src={avatar.data}
                  alt="Tu foto de perfil"
                  onError={() => setFailedAvatar(avatar.data)}
                />
              ) : (
                <span>{`${profile.data?.first_name?.[0] || "P"}${profile.data?.last_name?.[0] || ""}`}</span>
              )}
            </Link>
          </div>
        </header>
        <main className="dashboard-content">{children}</main>
        <footer className="dashboard-footer">
          Tu trabajo tiene un lugar propio. <strong>propi.</strong>
        </footer>
      </div>
    </div>
  );
}
