"use client";

import { useEffect, useState } from "react";

// Transparent over the fly-through / hero image, solid forest once past it.
export default function HeaderShell({ children }: { children: React.ReactNode }) {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const track = document.querySelector<HTMLElement>(".ft-track");
    const update = () => {
      const visibleTrack = track && track.offsetParent !== null;
      setSolid(visibleTrack ? track.getBoundingClientRect().bottom < 80 : window.scrollY > 40);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return (
    <header
      data-solid={solid || undefined}
      className="fixed inset-x-0 top-0 z-40 pt-[env(safe-area-inset-top)] transition-colors duration-300 data-[solid]:bg-forest/90 data-[solid]:shadow-[0_1px_0_rgba(245,232,223,.08)] data-[solid]:backdrop-blur-lg"
    >
      {children}
    </header>
  );
}
