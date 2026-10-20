"use client";

import Link from "next/link";
import { ArrowUpRight, BedDouble, Expand, MapPin } from "lucide-react";
import type { Property } from "../types/domain";
import { area, price, statusLabel } from "../lib/utils";
export function PropertyCard({
  property: p,
  username,
  demo = false,
}: {
  property: Property;
  username: string;
  demo?: boolean;
}) {
  return (
    <Link
      className="property-card"
      href={
        demo
          ? `/ejemplo/propiedad/${p.slug}`
          : `/${username}/propiedad/${p.slug}`
      }
    >
      <div className="property-photo">
        {p.images[0]?.url ? (
          <img
            src={p.images[0].url}
            alt={p.images[0].alt || p.title}
            loading="lazy"
          />
        ) : (
          <div className="image-placeholder">Sin fotos todavía</div>
        )}
        <span className="property-badge">
          {p.status === "disponible"
            ? p.operation === "venta"
              ? "En venta"
              : "En alquiler"
            : statusLabel[p.status]}
        </span>
        <span className="card-arrow">
          <ArrowUpRight size={18} />
        </span>
      </div>
      <div className="property-info">
        <span className="property-type">{p.type}</span>
        <div className="property-price">
          {price(p.price, p.currency)}
          {p.operation === "alquiler" && <small> / mes</small>}
        </div>
        <h3>{p.title}</h3>
        <p className="property-location">
          <MapPin size={13} />
          {[p.neighborhood, p.city].filter(Boolean).join(", ")}
        </p>
        <div className="property-features">
          <span>
            <BedDouble size={15} />
            {p.bedrooms} dorm.
          </span>
          <span>
            <Expand size={14} />
            {area(p.total_area)}
          </span>
          <span>{p.rooms} amb.</span>
        </div>
      </div>
    </Link>
  );
}
