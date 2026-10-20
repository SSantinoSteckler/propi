"use client";

import Link from "next/link";
import { ArrowUpRight, Loader2, Plus, SearchX } from "lucide-react";
import type { ReactNode } from "react";
export function Logo() {
  return (
    <Link className="logo" href="/" aria-label="Propi, inicio">
      <span className="logo-mark">
        <svg width="24" height="26" viewBox="0 0 24 26" fill="none" aria-hidden="true">
          <path d="M5 23V10a7 7 0 0 1 14 0v13" stroke="currentColor" strokeWidth="1.8" />
          <path d="m10 23 5-2V9l-5 2v12Z" fill="currentColor" />
          <path d="M3 23h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
      propi<span className="logo-dot">.</span>
    </Link>
  );
}
export function Button({
  children,
  busy,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      {...props}
      disabled={busy || props.disabled}
      className={`btn ${props.className || ""}`}
    >
      {busy ? <Loader2 className="spin" size={17} /> : null}
      {children}
    </button>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <SearchX size={34} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Loading() {
  return (
    <div className="card-grid">
      {[1, 2, 3].map((i) => (
        <div key={i} className="skeleton" style={{ height: 320 }} />
      ))}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function AddLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link className="btn" href={to}>
      <Plus size={17} />
      {children}
    </Link>
  );
}
export function External({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <ArrowUpRight size={15} />
    </a>
  );
}
export function ErrorBox({ error }: { error: unknown }) {
  return (
    <div role="alert" className="notice error">
      {error instanceof Error
        ? error.message
        : "No pudimos cargar los datos. Intentá nuevamente."}
    </div>
  );
}
