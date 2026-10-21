import { ArrowUpRight, Mail } from "lucide-react";
import { SUPPORT_EMAIL } from "../lib/contact";

export function ContactCard() {
  if (!SUPPORT_EMAIL) return null;
  return (
    <section className="contact-card" aria-label="Contacto con Propi">
      <div>
        <span className="eyebrow">ESTAMOS DEL OTRO LADO</span>
        <h2>Hablemos.</h2>
        <p>Para consultas, soporte, reportes de contenido o solicitudes sobre tus datos personales, escribinos por email.</p>
      </div>
      <a className="contact-email" href={`mailto:${SUPPORT_EMAIL}`}>
        <Mail size={19} aria-hidden="true" />
        <span>{SUPPORT_EMAIL}</span>
        <ArrowUpRight size={18} aria-hidden="true" />
      </a>
    </section>
  );
}
