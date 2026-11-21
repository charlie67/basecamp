import type { ReactNode, SVGProps } from 'react';

// Stroke icons for the controls, drawn on a 24px grid and sized by the caller's
// class. They take the text colour, so a button's state colours its icon too.
function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

type IconProps = SVGProps<SVGSVGElement>;

export function MapIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
      <path d="M9 4v14M15 6v14" />
    </Icon>
  );
}

export function SunriseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 18a5 5 0 0 1 10 0" />
      <path d="M3 18h18M12 2v6M9 5l3-3 3 3M4.2 10.2l1.4 1.4M19.8 10.2l-1.4 1.4" />
    </Icon>
  );
}

export function SunsetIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 18a5 5 0 0 1 10 0" />
      <path d="M3 18h18M12 2v6M9 5l3 3 3-3M4.2 10.2l1.4 1.4M19.8 10.2l-1.4 1.4" />
    </Icon>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </Icon>
  );
}

export function LayersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3 2 8l10 5 10-5-10-5z" />
      <path d="m2 13 10 5 10-5" />
      <path d="m2 17.5 10 5 10-5" />
    </Icon>
  );
}

export function LocateIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </Icon>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Icon>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m15 18-6-6 6-6" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9 18 6-6-6-6" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

export function ChevronUpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 15 6-6 6 6" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 12 5 5L20 7" />
    </Icon>
  );
}

export function SpinnerIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
      <path fill="currentColor" opacity="0.75" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  );
}
