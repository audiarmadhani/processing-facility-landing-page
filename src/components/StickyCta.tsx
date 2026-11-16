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
      className={`fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 rounded-full bg-cream py-4 text-center font-medium text-forest shadow-xl shadow-black/30 transition duration-300 sm:hidden ${
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"
      }`}
    >
      {label}
    </a>
  );
}
