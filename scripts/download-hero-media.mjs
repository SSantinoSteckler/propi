import { mkdir, readFile, writeFile } from "node:fs/promises";

const configPath = new URL("../src/lib/hero-media.json", import.meta.url);
const media = JSON.parse(await readFile(configPath, "utf8"));
const original = "https://videos.pexels.com/video-files/5744424/5744424-uhd_3840_2160_30fps.mp4";
const hd = original.replace("uhd_3840_2160", "hd_1280_720");
const posterUrl = "https://images.pexels.com/videos/5744424/a-house-art-at-home-villa-5744424.jpeg?auto=compress&w=1600";

async function download(url, type, limit) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!response.headers.get("content-type")?.includes(type)) throw new Error("Tipo de archivo inesperado.");
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new Error("El archivo supera el límite de tamaño para la portada.");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > limit) throw new Error("Tamaño de archivo inválido.");
  return bytes;
}

try {
  let video;
  try {
    video = await download(hd, "video/mp4", 12 * 1024 * 1024);
  } catch (error) {
    if (error.cause) throw error;
    video = await download(original, "video/mp4", 12 * 1024 * 1024);
  }
  const poster = await download(posterUrl, "image/", 2 * 1024 * 1024);
  const directory = new URL("../public/media/", import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL("hero-interior.mp4", directory), video);
  await writeFile(new URL("hero-interior.jpg", directory), poster);
  await writeFile(configPath, JSON.stringify({ ...media, video: "/media/hero-interior.mp4", poster: "/media/hero-interior.jpg" }, null, 2) + "\n");
  console.log(`Video y portada guardados localmente (${(video.byteLength / 1024 / 1024).toFixed(1)} MB).`);
} catch (error) {
  console.error(`No se pudieron descargar los archivos: ${error.cause?.code || error.message}. Se conserva la fuente actual.`);
  process.exitCode = 1;
}
