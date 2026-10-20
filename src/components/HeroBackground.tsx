"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import media from "../lib/hero-media.json";

export function HeroBackground() {
  const container = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [allowed, setAllowed] = useState(false);
  const [visible, setVisible] = useState(true);
  const [failed, setFailed] = useState(false);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
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
    if (visible && !paused) void element.play().catch(() => setPaused(true));
    else element.pause();
  }, [allowed, visible, paused]);

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
      {allowed && !failed && started && (
        <button type="button" className="hero-playback" onClick={() => setPaused(!paused)}
          aria-label={paused ? "Reproducir video de fondo" : "Pausar video de fondo"}>
          {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
          <span>{paused ? "Reproducir fondo" : "Pausar fondo"}</span>
        </button>
      )}
    </div>
  );
}
