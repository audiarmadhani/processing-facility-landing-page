const paths: Record<string, React.ReactNode> = {
  pin: <><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  boot: <><path d="M7 3v9.5c0 .8-.4 1.6-1 2.1L4 16.5V20h16v-2.2c0-1.3-.9-2.4-2.1-2.7L13 14V3" /><path d="M4 17.5h16" /></>,
  hand: <><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12" /><path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V11" /><path d="M14 11V6a1.5 1.5 0 0 1 3 0v7c0 4.4-2.6 8-6.5 8-2.3 0-3.8-1.1-5-3l-2.3-3.6a1.5 1.5 0 0 1 2.4-1.8L8 15" /></>,
  camera: <><path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  shield: <><path d="M12 3 5 6v5.5c0 4.4 3 8.2 7 9.5 4-1.3 7-5.1 7-9.5V6z" /><path d="m9 12 2 2 4-4" /></>,
  heart: <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
};

export default function Icon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {paths[name]}
    </svg>
  );
}
