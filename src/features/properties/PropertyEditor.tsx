"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from "lucide-react";
import type { z } from "zod";
import { propertySchema } from "../../lib/validation";
import {
  getProperty,
  saveProperty,
  uploadImage,
  addPropertyImage,
  removePropertyImage,
  updatePropertyImage,
} from "../../services/data";
import { errorMessage, statusLabel } from "../../lib/utils";
import { useAuth } from "../auth/AuthProvider";
import { PageHeading, Button, ErrorBox } from "../../components/ui";
type Values = z.infer<typeof propertySchema>;
export default function PropertyEditor() {
  const { id } = useParams<{ id: string }>();
  const editing = !!id;
  const { session } = useAuth();
  const client = useQueryClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [section, setSection] = useState(1);
  const query = useQuery({
    queryKey: ["property", id],
    queryFn: () => getProperty(id!),
    enabled: editing,
  });
  const {
    register,
    reset,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(propertySchema),
    defaultValues: {
      type: "departamento",
      operation: "venta",
      currency: "USD",
      status: "borrador",
      province: "Buenos Aires",
      city: "",
      neighborhood: "",
      address: "",
      show_address: false,
      total_area: 0,
      covered_area: 0,
      rooms: 1,
      bedrooms: 0,
      bathrooms: 1,
      garages: 0,
      age: null,
    },
  });
  useEffect(() => {
    if (query.data) reset({ ...query.data, address: query.data.address || "" });
  }, [query.data, reset]);
  async function submit(values: Values) {
    setBusy(true);
    try {
      const saved = await saveProperty(values, id);
      await client.invalidateQueries({ queryKey: ["properties"] });
      await client.invalidateQueries({ queryKey: ["property", id] });
      toast.success(
        values.status === "borrador"
          ? "Borrador guardado."
          : "Propiedad guardada.",
      );
      if (!editing) {
        router.replace(`/dashboard/propiedades/${saved.id}`);
        setSection(3);
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function images(files: FileList | null) {
    if (!files || !query.data) return;
    if (query.data.images.length + files.length > 15) {
      toast.error("Podés cargar hasta 15 imágenes.");
      return;
    }
    setImageBusy(true);
    try {
      for (const [i, file] of Array.from(files).entries()) {
        const path = await uploadImage(file, session!.user.id, id!);
        try {
          await addPropertyImage({
            property_id: id!,
            path,
            alt: "",
            position:
              Math.max(
                -1,
                ...query.data.images.map((image) => image.position),
              ) +
              1 +
              i,
          });
        } catch (e) {
          toast.error(
            `La imagen se subió pero no se pudo asociar. ${errorMessage(e)}`,
          );
          throw e;
        }
      }
      toast.success("Fotos cargadas.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setImageBusy(false);
      await client.invalidateQueries({ queryKey: ["property", id] });
      client.invalidateQueries({ queryKey: ["properties"] });
    }
  }
  async function move(index: number, direction: number) {
    const list = query.data!.images;
    const other = list[index + direction];
    if (!other) return;
    setImageBusy(true);
    try {
      await updatePropertyImage(list[index].id, {
        position: other.position,
      });
      await updatePropertyImage(other.id, { position: list[index].position });
      await client.invalidateQueries({ queryKey: ["property", id] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setImageBusy(false);
    }
  }
  const field = (name: keyof Values, label: string, type = "text") => (
    <label>
      {label}
      <input
        type={type}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "any" : undefined}
        {...register(name, {
          setValueAs:
            type === "number"
              ? (v) => (v === "" && name === "age" ? null : v)
              : undefined,
        })}
      />
      {errors[name] && (
        <small className="field-error">{errors[name]?.message}</small>
      )}
    </label>
  );
  if (query.isError) return <ErrorBox error={query.error} />;
  return (
    <>
      <Link className="back-link" href="/dashboard/propiedades">
        <ArrowLeft size={15} />
        Mis propiedades
      </Link>
      <PageHeading
        title={
          editing
            ? "Cada detalle cuenta."
            : "Un nuevo espacio, una nueva historia."
        }
        description="Guardá la propiedad y después sumá las fotografías."
      />
      <div className="editor-tabs">
        {["Información", "Características", "Fotografías"].map((label, i) => (
          <button
            key={label}
            className={section === i + 1 ? "active" : ""}
            onClick={() => setSection(i + 1)}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>
      <form
        className="form-panel"
        onSubmit={handleSubmit(submit, () => {
          setSection(1);
          toast.error("Revisá los campos marcados antes de guardar.");
        })}
        noValidate
      >
        <section className={section === 1 ? "" : "hidden"}>
          <h2>El primer vistazo</h2>
          {field("title", "Título de la propiedad")}
          <label>
            Descripción
            <textarea rows={5} {...register("description")} />
            {errors.description && (
              <small className="field-error">
                {errors.description.message}
              </small>
            )}
          </label>
          <div className="form-grid">
            <label>
              Tipo de inmueble
              <select {...register("type")}>
                {[
                  "departamento",
                  "casa",
                  "PH",
                  "terreno",
                  "local",
                  "oficina",
                  "otro",
                ].map((v) => (
                  <option value={v} key={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Operación
              <select {...register("operation")}>
                <option value="venta">Venta</option>
                <option value="alquiler">Alquiler</option>
              </select>
            </label>
            {field("price", "Precio", "number")}
            <label>
              Moneda
              <select {...register("currency")}>
                <option value="USD">Dólares (USD)</option>
                <option value="ARS">Pesos (ARS)</option>
              </select>
            </label>
            {field("province", "Provincia")}
            {field("city", "Ciudad o localidad")}
            {field("neighborhood", "Barrio")}
            {field("address", "Dirección (opcional)")}
          </div>
          <label className="checkbox-label">
            <input type="checkbox" {...register("show_address")} />
            Publicar la dirección exacta
          </label>
          <p className="form-note">
            Si desactivás esta opción, solo se publican barrio, localidad y
            provincia.
          </p>
        </section>
        <section className={section === 2 ? "" : "hidden"}>
          <h2>El espacio, en detalle</h2>
          <div className="form-grid">
            {field("total_area", "Superficie total (m²)", "number")}
            {field("covered_area", "Superficie cubierta (m²)", "number")}
            {field("rooms", "Ambientes", "number")}
            {field("bedrooms", "Dormitorios", "number")}
            {field("bathrooms", "Baños", "number")}
            {field("garages", "Cocheras", "number")}
            {field("age", "Antigüedad en años (opcional)", "number")}
          </div>
        </section>
        <section className={section === 3 ? "" : "hidden"}>
          <h2>Fotos que invitan a conocer</h2>
          <p>
            Hasta 15 imágenes. La primera se usa como portada. Se optimizan a
            WebP antes de subirlas.
          </p>
          {editing ? (
            <>
              <label className="upload-zone">
                <Camera size={30} />
                <strong>
                  {imageBusy
                    ? "Procesando fotografías…"
                    : "Elegí las fotos de la propiedad"}
                </strong>
                <span>JPG, PNG o WebP · Hasta 8 MB por imagen</span>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  disabled={imageBusy}
                  onChange={(e) => {
                    images(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              <div className="image-manager">
                {query.data?.images.map((image, i) => (
                  <div key={image.id}>
                    <img
                      src={image.url}
                      alt={image.alt || `Fotografía ${i + 1}`}
                    />
                    {i === 0 && (
                      <span className="image-cover-tag">Principal</span>
                    )}
                    <label>
                      Descripción de la imagen
                      <input
                        aria-label={`Texto alternativo de la foto ${i + 1}`}
                        defaultValue={image.alt}
                        maxLength={300}
                        onBlur={async (e) => {
                          if (e.target.value !== image.alt) {
                            try {
                              await updatePropertyImage(image.id, {
                                alt: e.target.value,
                              });
                              toast.success("Descripción guardada.");
                            } catch (err) {
                              toast.error(errorMessage(err));
                            }
                          }
                        }}
                      />
                    </label>
                    <div>
                      <Button
                        type="button"
                        className="btn-outline btn-small"
                        aria-label="Mover imagen antes"
                        disabled={i === 0 || imageBusy}
                        onClick={() => move(i, -1)}
                      >
                        <ChevronLeft size={14} />
                      </Button>
                      <Button
                        type="button"
                        className="btn-outline btn-small"
                        aria-label="Mover imagen después"
                        disabled={
                          i === (query.data?.images.length || 0) - 1 ||
                          imageBusy
                        }
                        onClick={() => move(i, 1)}
                      >
                        <ChevronRight size={14} />
                      </Button>
                      <Button
                        type="button"
                        className="btn-outline btn-small danger"
                        aria-label="Eliminar imagen"
                        disabled={imageBusy}
                        onClick={async () => {
                          if (!window.confirm("¿Eliminar esta imagen?")) return;
                          setImageBusy(true);
                          try {
                            await removePropertyImage(image);
                          } catch (e) {
                            toast.error(errorMessage(e));
                          } finally {
                            await client.invalidateQueries({
                              queryKey: ["property", id],
                            });
                            client.invalidateQueries({
                              queryKey: ["properties"],
                            });
                            setImageBusy(false);
                          }
                        }}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="notice">
              Guardá la información de la propiedad para habilitar la carga
              segura de fotos.
            </div>
          )}
        </section>
        <div className="property-save-bar">
          <label>
            Estado
            <select {...register("status")}>
              {Object.entries(statusLabel).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <div className="inline-actions">
            <Button
              type="submit"
              className="btn-outline"
              busy={busy}
              onClick={() => setValue("status", "borrador")}
            >
              Guardar borrador
            </Button>
            <Button type="submit" busy={busy}>
              Guardar propiedad
            </Button>
          </div>
        </div>
        <p className="form-note">
          Disponible, reservada, vendida y alquilada cuentan para el límite del
          plan. Las vendidas y alquiladas se muestran según tu configuración.
        </p>
      </form>
      {editing && (
        <Link
          className="text-link"
          href={`/dashboard/propiedades/${id}/preview`}
        >
          Previsualizar ficha <ArrowRight size={15} />
        </Link>
      )}
    </>
  );
}
