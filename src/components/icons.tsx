import type { SVGProps } from "react";

/**
 * Единый набор иконок: сетка 24, штрих 1.6, цвет наследуется от текста.
 * Иконки нарисованы здесь, а не взяты юникодом — глифы разъезжаются между шрифтами.
 */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </Icon>
  );
}

export function BackIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M15 5 8 12l7 7" />
    </Icon>
  );
}

export function SendIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4.5 12 20 4.5 15.5 20l-4-6.5z" />
      <path d="m4.5 12 7 1.5" />
    </Icon>
  );
}

export function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
    </Icon>
  );
}

export function LockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="5" y="10.5" width="14" height="9" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </Icon>
  );
}

export function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </Icon>
  );
}

export function DoubleCheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="m2 12.5 4.5 4.5L16 7" />
      <path d="m12 16 6.5-7.5" />
    </Icon>
  );
}

export function AlertIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5" />
      <path d="M12 15.8v.2" />
    </Icon>
  );
}

export function InboxIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 13.5 6.2 5.8A2 2 0 0 1 8.1 4.3h7.8a2 2 0 0 1 1.9 1.5L20 13.5" />
      <path d="M4 13.5h4l1.2 2.4h5.6l1.2-2.4h4v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
    </Icon>
  );
}

export function ChatIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M20 12.5c0 3.6-3.6 6.5-8 6.5-.9 0-1.8-.1-2.6-.35L5 20l1.2-3.1C4.85 15.75 4 14.2 4 12.5 4 8.9 7.6 6 12 6s8 2.9 8 6.5z" />
    </Icon>
  );
}

export function UsersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19.5c0-2.8 2.5-5 5.5-5s5.5 2.2 5.5 5" />
      <path d="M16 6.2a3 3 0 0 1 0 5.6" />
      <path d="M17.5 14.9c1.8.6 3 2.2 3 4.1" />
    </Icon>
  );
}

export function BoltIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M13 3 5.5 13.5H11l-1 7.5L18.5 10H13z" />
    </Icon>
  );
}

export function SparkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 4.5c.6 3.4 2.1 4.9 5.5 5.5-3.4.6-4.9 2.1-5.5 5.5-.6-3.4-2.1-4.9-5.5-5.5 3.4-.6 4.9-2.1 5.5-5.5z" />
      <path d="M17.5 15.5c.3 1.4.9 2 2.3 2.3-1.4.3-2 .9-2.3 2.3-.3-1.4-.9-2-2.3-2.3 1.4-.3 2-.9 2.3-2.3z" />
    </Icon>
  );
}

export function WalletIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4.5 8.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z" />
      <path d="M4.5 10.5h12a1.5 1.5 0 0 1 1.5 1.5v2a1.5 1.5 0 0 1-1.5 1.5h-12" />
      <path d="M15 13v.2" />
    </Icon>
  );
}

export function ReportIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4.5 19.5h15" />
      <rect x="6" y="11" width="3.5" height="5.5" rx="1" />
      <rect x="11.5" y="6.5" width="3.5" height="10" rx="1" />
      <path d="M18.5 13v3.5" />
    </Icon>
  );
}

export function TeamIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="8.5" r="3" />
      <path d="M4.5 19.5c0-2.8 2.5-5 5.5-5s5.5 2.2 5.5 5" />
      <path d="M18 8v5" />
      <path d="M15.5 10.5h5" />
    </Icon>
  );
}

export function MegaphoneIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 10.5v3a1.5 1.5 0 0 0 1.5 1.5H8l6 4V6.5l-6 4H5.5A1.5 1.5 0 0 0 4 12z" />
      <path d="M17.5 9.5a4 4 0 0 1 0 5" />
      <path d="M8 15v4.5" />
    </Icon>
  );
}

export function TemplateIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="4.5" y="4" width="15" height="16" rx="2" />
      <path d="M8 9h8" />
      <path d="M8 12.5h8" />
      <path d="M8 16h4" />
    </Icon>
  );
}

export function LogoutIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M14 5.5H7.5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2H14" />
      <path d="M17 15l3-3-3-3" />
      <path d="M20 12h-8.5" />
    </Icon>
  );
}

export function ChannelIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
      <path d="M10.5 7.5H14a2.5 2.5 0 0 1 2.5 2.5v3.5" />
      <path d="M13.5 13.5 11 11" />
    </Icon>
  );
}

export function OrderIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6 4.5h9l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1z" />
      <path d="M15 4.5v3h3" />
      <path d="M8.5 12h7" />
      <path d="M8.5 15.5h4.5" />
    </Icon>
  );
}

export function DownloadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 4.5v10" />
      <path d="m8 11 4 4 4-4" />
      <path d="M5 19.5h14" />
    </Icon>
  );
}

export function AttachmentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M18 11.5 12.4 17a3.6 3.6 0 0 1-5.1-5.1l6.4-6.4a2.4 2.4 0 0 1 3.4 3.4l-6.4 6.4a1.2 1.2 0 0 1-1.7-1.7l5.6-5.6" />
    </Icon>
  );
}

export function SunIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </Icon>
  );
}

export function MoonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2Z" />
    </Icon>
  );
}
