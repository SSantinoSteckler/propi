"use client";

import { useEffect, useRef, useState } from "react";
import media from "../lib/hero-media.json";

export function HeroBackground() {
  const container = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [allowed, setAllowed] = useState(false);
  const [visible, setVisible] = useState(true);
  const [failed, setFailed] = useState(false);
  const [started, setStarted] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = window.matchMedia("(min-width: 900px)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    // En celulares y con ahorro de datos se conserva la portada estática.
    const update = () => setAllowed(!reduced.matches && desktop.matches && !connection?.saveData);
    update();
    reduced.addEventListener("change", update);
    desktop.addEventListener("change", update);
    return () => {
      reduced.removeEventListener("change", update);
      desktop.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    let inView = true;
    const update = () => setVisible(inView && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; update(); });
    if (container.current) observer.observe(container.current);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (visible) void element.play().catch(() => setFailed(true));
    else element.pause();
  }, [allowed, visible]);

  return (
    <div className="hero-film" ref={container}>
      <div className="hero-film-media" aria-hidden="true">
        {!posterFailed && <img className="hero-film-poster" src={media.poster} alt="" fetchPriority="high" onError={() => setPosterFailed(true)} />}
        {allowed && !failed && (
          <video ref={video} className={started ? "is-playing" : ""}
            src={media.video} poster={media.poster} muted loop playsInline autoPlay
            preload="metadata" tabIndex={-1}
            onPlay={() => setStarted(true)} onError={() => setFailed(true)} />
        )}
      </div>
    </div>
  );
}
