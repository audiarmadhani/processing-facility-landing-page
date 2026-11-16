"use client";

import { useEffect, useState } from "react";

// Phone-only floating "Register" button; hides once the form is on screen.
export default function StickyCta({ label }: { label: string }) {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const target = document.getElementById("register");
    if (!target) return;
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting && e.boundingClientRect.top > 0), { threshold: 0 });
    io.observe(target);
    return () => io.disconnect();
  }, []);
  return (
    <a
      href="#register"
      // Kept well under 80% of the screen width: iOS 26 Safari paints its toolbar with the
      // background of wider fixed elements near the bottom edge (it turned the bar cream).
      className={`fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-40 -translate-x-1/2 whitespace-nowrap rounded-full bg-cream px-7 py-3.5 text-center font-medium text-forest shadow-xl shadow-black/30 transition duration-300 sm:hidden ${
        show ? "opacity-100" : "pointer-events-none translate-y-6 opacity-0"
      }`}
    >
      {label}
    </a>
  );
}
