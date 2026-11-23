/** Inline icon set. 1.5px stroke, 24px grid, currentColor. No icon font, no emoji. */

interface IconProps {
  size?: number;
}

function svgProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
}

export function SunIcon({ size = 17 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.2v2.1M12 19.7v2.1M2.2 12h2.1M19.7 12h2.1M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M19.1 4.9l-1.5 1.5M6.4 17.6l-1.5 1.5" />
    </svg>
  );
}

export function MoonIcon({ size = 17 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M20.5 13.3A8.6 8.6 0 0 1 10.7 3.5a8.6 8.6 0 1 0 9.8 9.8z" />
    </svg>
  );
}

export function PlayIcon({ size = 17 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="currentColor" stroke="none">
      <path d="M8.4 5.2a1 1 0 0 1 1.52-.85l8.1 6.8a1 1 0 0 1 0 1.7l-8.1 6.8a1 1 0 0 1-1.52-.85z" />
    </svg>
  );
}

export function PauseIcon({ size = 17 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="currentColor" stroke="none">
      <rect x="7" y="5" width="4" height="14" rx="1.1" />
      <rect x="13.5" y="5" width="4" height="14" rx="1.1" />
    </svg>
  );
}

export function StopIcon({ size = 17 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="currentColor" stroke="none">
      <rect x="6.5" y="6.5" width="11" height="11" rx="1.6" />
    </svg>
  );
}

export function CloseIcon({ size = 14 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function WarnIcon({ size = 15 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M10.6 3.9 2.5 18a1.6 1.6 0 0 0 1.4 2.4h16.2A1.6 1.6 0 0 0 21.5 18L13.4 3.9a1.6 1.6 0 0 0-2.8 0z" />
      <path d="M12 9v4.4M12 17h.01" />
    </svg>
  );
}

export function InfoIcon({ size = 15 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

export function ImageIcon({ size = 15 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <circle cx="8.6" cy="10" r="1.6" />
      <path d="M3.6 17.2l4.5-4.3a1.8 1.8 0 0 1 2.5 0l3.4 3.3M13.4 15l1.8-1.7a1.8 1.8 0 0 1 2.5 0l2.7 2.6" />
    </svg>
  );
}

export function ExportIcon({ size = 15 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M12 3.5v11M8.2 7.3 12 3.5l3.8 3.8" />
      <path d="M4.5 14.5v3.2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3.2" />
    </svg>
  );
}

/** Save to file: a floppy-free take — arrow into a tray, same family as ExportIcon. */
export function SaveIcon({ size = 15 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M5 4.5h9.5L19 9v10.5H5z" />
      <path d="M8 4.5v4h6v-4M8 19.5v-5h8v5" />
    </svg>
  );
}

/** Open from file: a folder outline. */
export function FolderIcon({ size = 15 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M3.5 6.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2.5h8a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" />
    </svg>
  );
}
