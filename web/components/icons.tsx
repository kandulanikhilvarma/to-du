// Stroke icons shared by the landing, showcase and about pages.

type IconProps = { className?: string };

export const iconBase = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

export const Icons = {
  tap: (p: IconProps) => (
    <svg {...iconBase} className={p.className}>
      <path d="M9 11V6.5a1.8 1.8 0 0 1 3.6 0V11" />
      <path d="M12.6 11V9.4a1.7 1.7 0 0 1 3.4 0V11" />
      <path d="M16 11v-.8a1.7 1.7 0 0 1 3.4 0V15a6 6 0 0 1-6 6h-1.6a5 5 0 0 1-3.9-1.9L5 15.3a1.7 1.7 0 0 1 2.5-2.2L9 14.6" />
    </svg>
  ),
  timer: (p: IconProps) => (
    <svg {...iconBase} className={p.className}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9.5V13l2.4 1.6M9.5 2.5h5" />
    </svg>
  ),
  people: (p: IconProps) => (
    <svg {...iconBase} className={p.className}>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M2.8 20a6.4 6.4 0 0 1 12.4 0" />
      <path d="M16.2 6a3.2 3.2 0 0 1 0 6.2M17.5 14.4A6.4 6.4 0 0 1 21.4 20" />
    </svg>
  ),
  route: (p: IconProps) => (
    <svg {...iconBase} className={p.className}>
      <circle cx="6" cy="18" r="2.6" />
      <circle cx="18" cy="6" r="2.6" />
      <path d="M8.6 18h5.2a3.6 3.6 0 0 0 0-7.2h-3.6a3.6 3.6 0 0 1 0-7.2h5.2" />
    </svg>
  ),
  wifi: (p: IconProps) => (
    <svg {...iconBase} className={p.className}>
      <path d="M2.5 9.5a14 14 0 0 1 19 0M5.8 13a9.4 9.4 0 0 1 12.4 0M9 16.4a4.8 4.8 0 0 1 6 0" />
      <path d="M12 20h.01" />
    </svg>
  ),
  message: (p: IconProps) => (
    <svg {...iconBase} className={p.className}>
      <path d="M20.5 12a7.8 7.8 0 0 1-11.3 7L4 20.5l1.6-5a7.8 7.8 0 1 1 14.9-3.5Z" />
    </svg>
  ),
  phone: (p: IconProps) => (
    <svg {...iconBase} className={p.className}>
      <path d="M6.3 3.5h3l1.5 3.8-2 1.4a12 12 0 0 0 5.5 5.5l1.4-2 3.8 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.3 5.7a2 2 0 0 1 2-2.2Z" />
    </svg>
  ),
  bluetooth: (p: IconProps) => (
    <svg {...iconBase} className={p.className}>
      <path d="m7 7.5 10 9-5 4v-17l5 4-10 9" />
    </svg>
  ),
  siren: (p: IconProps) => (
    <svg {...iconBase} className={p.className}>
      <path d="M6 18v-4.5a6 6 0 0 1 12 0V18" />
      <path d="M4 18h16v2.5H4zM12 3.5v1.6M4.4 6.6l1.2 1.1M19.6 6.6l-1.2 1.1" />
    </svg>
  ),
  lock: (p: IconProps) => (
    <svg {...iconBase} className={p.className}>
      <rect x="4.5" y="10" width="15" height="10.5" rx="2.2" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    </svg>
  ),
  chart: (p: IconProps) => (
    <svg {...iconBase} className={p.className}>
      <path d="M4 20V4M4 20h16" />
      <path d="M8 16.5V12M12.5 16.5V8M17 16.5v-3" />
    </svg>
  ),
  shield: (p: IconProps) => (
    <svg {...iconBase} className={p.className}>
      <path d="M12 2.5 4.5 5.8v5.6c0 4.6 3.1 8.3 7.5 10.1 4.4-1.8 7.5-5.5 7.5-10.1V5.8Z" />
      <path d="m8.8 12.2 2.2 2.2 4.2-4.4" />
    </svg>
  ),
  beacon: (p: IconProps) => (
    <svg {...iconBase} className={p.className}>
      <circle cx="12" cy="12" r="2.6" />
      <path d="M7.4 7.4a6.5 6.5 0 0 0 0 9.2M16.6 16.6a6.5 6.5 0 0 0 0-9.2M4.4 4.4a10.7 10.7 0 0 0 0 15.2M19.6 19.6a10.7 10.7 0 0 0 0-15.2" />
    </svg>
  ),
  database: (p: IconProps) => (
    <svg {...iconBase} className={p.className}>
      <ellipse cx="12" cy="5.5" rx="7.5" ry="3" />
      <path d="M4.5 5.5v13c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-13M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" />
    </svg>
  ),
  bolt: (p: IconProps) => (
    <svg {...iconBase} className={p.className}>
      <path d="M13 2.5 4.5 13.5H12l-1 8 8.5-11H12Z" />
    </svg>
  ),
  monitor: (p: IconProps) => (
    <svg {...iconBase} className={p.className}>
      <rect x="3" y="4" width="18" height="12.5" rx="2" />
      <path d="M8.5 20.5h7M12 16.5v4" />
    </svg>
  ),
  cloud: (p: IconProps) => (
    <svg {...iconBase} className={p.className}>
      <path d="M7 19h10.5a4 4 0 0 0 .6-8A6 6 0 0 0 6.6 9.6 4.8 4.8 0 0 0 7 19Z" />
    </svg>
  ),
  check: (p: IconProps) => (
    <svg {...iconBase} className={p.className}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  ),
  cross: (p: IconProps) => (
    <svg {...iconBase} className={p.className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9 9 15M9 9l6 6" />
    </svg>
  ),
  code: (p: IconProps) => (
    <svg {...iconBase} className={p.className}>
      <path d="m8 7-5 5 5 5M16 7l5 5-5 5M13.5 4.5l-3 15" />
    </svg>
  ),
  arrow: (p: IconProps) => (
    <svg {...iconBase} className={p.className}>
      <path d="M5 12h13M13 6.5 18.5 12 13 17.5" />
    </svg>
  ),
  mail: (p: IconProps) => (
    <svg {...iconBase} className={p.className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
    </svg>
  ),
  spark: (p: IconProps) => (
    <svg {...iconBase} className={p.className}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
    </svg>
  ),
};
