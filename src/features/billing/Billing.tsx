"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CreditCard, ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button, ErrorBox, PageHeading } from "../../components/ui";
import { db } from "../../lib/supabase";
import type { BillingStatus } from "../../lib/billing/types";
import { billingPresentation } from "../../lib/billing/presentation";

async function billingApi<T>(path: string, payload?: unknown): Promise<T> {
  const { data } = await db().auth.getSession();
  if (!data.session) throw new Error("Ingresá nuevamente a tu cuenta.");
  const response = await fetch(`/api/billing/${path}`, {
    method: payload ? "POST" : "GET", cache: "no-store",
    headers: { Authorization: `Bearer ${data.session.access_token}`, ...(payload ? { "Content-Type": "application/json" } : {}) },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "No pudimos consultar tu facturación.");
  return result as T;
}
const money = (value: number) => `AR$ ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(value)}`;
const date = (value: string) => new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(value));
const labels: Record<string,string> = { pending: "Pendiente de autorización", authorized: "Autorización recibida", paused: "En pausa", cancelled: "Cancelada", canceled: "Cancelada", rejected: "Rechazado", approved: "Aprobado", in_process: "En proceso", refunded: "Reintegrado", charged_back: "Contracargo", cancelled_payment: "Cancelado" };

export default function Billing({ returning = false }: { returning?: boolean }) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false), [polls, setPolls] = useState(0);
  const query = useQuery({ queryKey: ["billing"], queryFn: () => billingApi<BillingStatus>("status?refresh=1"),
    refetchInterval: (q) => returning && polls < 12 && !q.state.data?.entitlements.premium ? 5000 : false,
  });
  useEffect(() => { if (returning && query.dataUpdatedAt) setPolls((n) => n + 1); }, [query.dataUpdatedAt, returning]);
  useEffect(() => {
    if (query.data) client.setQueryData(["plan"], { plan: query.data.entitlements.plan });
  }, [query.data, client]);
  const data = query.data, agreement = data?.agreement;
  const premium = data?.entitlements.premium;
  const view = data ? billingPresentation(data) : null;
  const canceled = view?.canceled;
  async function subscribe(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    try {
      const email = String(new FormData(event.currentTarget).get("payer_email") || "");
      const result = await billingApi<{ checkout_url: string }>("subscribe", { payer_email: email });
      window.location.assign(result.checkout_url);
    } catch (error) { toast.error(error instanceof Error ? error.message : "No pudimos iniciar la suscripción."); setBusy(false); await query.refetch(); }
  }
  async function cancel() {
    setBusy(true);
    try {
      const result = await billingApi<{ canceled: boolean }>("cancel", { confirm: true });
      toast.success(result.canceled ? "La solicitud o suscripción de Premium quedó cancelada. No habrá nuevos cobros de ese acuerdo." : "Recibimos tu solicitud. Estamos verificando el estado.");
      setConfirm(false); await query.refetch();
    } catch (error) { toast.error(error instanceof Error ? error.message : "No pudimos cancelar la renovación."); }
    finally { setBusy(false); }
  }
  return (
    <>
      <PageHeading eyebrow="TU CUENTA, CON CLARIDAD" title={returning ? "Estamos verificando tu suscripción" : "Planes y facturación"}
        description="Revisá tu plan, los cobros y la renovación desde un solo lugar."
        action={<Button className="btn-outline" busy={query.isFetching} onClick={() => { setPolls(0); void query.refetch(); }}><RefreshCw size={16} />Actualizar estado</Button>} />
      {query.isError && <ErrorBox error={query.error} />}
      {query.isPending && <div className="skeleton" style={{ height: 280 }} role="status">Consultando tu cuenta…</div>}
      {data && <>
        {data.temporary_price && <div className="notice" role="status">Precio temporal de prueba: {money(data.catalog.amount)} por mes para nuevas suscripciones. Es un cobro real y recurrente; podés cancelar la renovación desde acá.</div>}
        {returning && <div className="notice" role="status">{premium ? "Premium ya está habilitado en tu cuenta." : polls >= 12 ? "La confirmación está demorando. Podés volver más tarde o actualizar el estado; no hace falta contratar otra vez." : "Volver de Mercado Pago no confirma el pago. Estamos consultando la autorización y el cobro."}</div>}
        {agreement?.sync_error && <div className="notice error" role="alert">Hay una verificación pendiente. Conservamos el último estado validado y no vamos a crear otra suscripción mientras se resuelve.</div>}
        <div className="billing-grid">
          <section className="form-panel">
            <span className="eyebrow">TU PLAN ACTUAL</span>
            <h2>{premium ? "Premium" : "Free"}</h2>
            <p>{premium ? "Tenés acceso a las funciones Premium." : "Tu portfolio profesional, sin costo mensual. Free no tiene cobros ni renovación."}</p>
            {data.entitlements.access_until && <p>Acceso ya abonado hasta el <strong>{date(data.entitlements.access_until)}</strong>.</p>}
            {!premium && view?.open && <p>Tenés una solicitud o suscripción de Premium en gestión. Podés consultar su estado más abajo.</p>}
            {premium && canceled && <div className="notice">Tu acceso ya pagado se conserva. La renovación de Premium está cancelada.</div>}
          </section>
          <section className="form-panel billing-upgrade">
            <span className="eyebrow">MÁS ESPACIO PARA TU CATÁLOGO</span>
            <h2>{data.catalog.name}</h2>
            <p className="billing-price">{money(data.catalog.amount)} <small>/ mes</small></p>
            <ul className="billing-benefits">{["Más propiedades y colecciones publicadas", "Color y portada personalizados", "Portfolio, WhatsApp, reseñas y métricas básicas"].map((text) => <li key={text}><Check size={16} />{text}</li>)}</ul>
            <small>Hasta 1.000 propiedades publicadas y 1.000 colecciones activas como límite técnico. Las estadísticas avanzadas todavía no están implementadas.</small>
            {!premium && <form onSubmit={subscribe}>
              <label>Email de tu cuenta de Mercado Pago<input name="payer_email" type="email" autoComplete="email" required maxLength={254} placeholder="El email con el que vas a pagar" disabled={busy || !view?.canCheckout} /></label>
              <p className="form-note">Puede ser distinto del email con el que ingresás a Propi. No te pedimos datos de tarjeta.</p>
              <Button type="submit" busy={busy} disabled={!view?.canCheckout}><CreditCard size={17} />{view?.checkoutPending ? "Continuar solicitud de Premium" : "Contratar Premium"}<ExternalLink size={15} /></Button>
              <p className="form-note">Renovación automática mensual. Revisás y autorizás los cobros en Mercado Pago; podés cancelar la renovación desde acá.</p>
            </form>}
            {!premium && (view?.priceConflict ? <div className="notice">Tenés una solicitud o suscripción de Premium con otro importe. Revisala más abajo antes de contratar al precio actual. No modificamos su importe automáticamente.</div> : !data.available && <div className="notice">La contratación todavía no está habilitada. Tu plan actual sigue disponible.</div>)}
            <p className="billing-security"><ShieldCheck size={16} />El pago se completa en el sitio de Mercado Pago.</p>
          </section>
        </div>
        {agreement && <section className="form-panel">
          <span className="eyebrow">{view?.checkoutPending ? "SOLICITUD DE PREMIUM" : "SUSCRIPCIÓN DE PREMIUM"}</span>
          <h2>{agreement.creation_state === "failed" ? "No se pudo iniciar Premium" : agreement.creation_state !== "ready" ? "Estamos verificando la solicitud" : labels[agreement.status] || "Estado en revisión"}</h2>
          {agreement.creation_state !== "failed" && <p>Importe de este acuerdo de Premium: {money(agreement.amount)} por mes.</p>}
          {view?.checkoutPending && <p>La contratación todavía no se completó. Esta solicitud no cambia tu plan actual ni confirma un pago.</p>}
          {agreement.status === "authorized" && !premium && <div className="notice">La autorización está registrada. Para habilitar Premium necesitamos confirmar un cobro aprobado con acceso vigente.</div>}
          {agreement.next_payment_date && agreement.status === "authorized" && !canceled && <p>Próximo intento de cobro informado por Mercado Pago: {date(agreement.next_payment_date)}.</p>}
          {agreement.status === "paused" && <p>La suscripción está pausada en Mercado Pago. El acceso depende del período ya abonado.</p>}
          {canceled && <p>Este acuerdo de Premium está cancelado y no tiene renovación. Tus propiedades y colecciones se conservan.</p>}
          {view?.canCancel && <div className="billing-cancel">
            {!confirm ? <Button className="btn-outline" onClick={() => setConfirm(true)}>{view.cancelLabel}</Button> : <div role="group" aria-label="Confirmar cancelación de Premium">
              <p>{view.checkoutPending ? "Vamos a cancelar esta solicitud de Premium en Mercado Pago. Tu plan actual no cambia." : "Vamos a cancelar la suscripción de Premium en Mercado Pago para detener futuros cobros. El acceso ya pagado se conserva hasta su vencimiento, salvo reintegros o contracargos."} No se borra tu catálogo.</p>
              <div className="inline-actions"><Button busy={busy} onClick={cancel}>Confirmar cancelación</Button><Button disabled={busy} className="btn-outline" onClick={() => setConfirm(false)}>Volver</Button></div>
            </div>}
          </div>}
        </section>}
        <section className="form-panel">
          <h2>Historial de cobros</h2>
          {!data.payments.length ? <p>Todavía no hay cobros registrados. Los intentos pendientes no activan Premium.</p> : <div className="billing-history">{data.payments.map((payment) => <div key={payment.id}>
            <span>{payment.paid_at ? date(payment.paid_at) : "Sin fecha de aprobación"}</span><strong>{money(Number(payment.amount))}</strong><span>{labels[payment.status] || "En revisión"}</span>
          </div>)}</div>}
        </section>
        <p className="form-note">Free conserva hasta cinco propiedades publicadas y una colección activa. Si volvés a Free con más contenido, podés editarlo o retirarlo; se bloquean nuevas publicaciones que superen el límite. <Link href="/terminos">Ver términos</Link>.</p>
      </>}
    </>
  );
}
