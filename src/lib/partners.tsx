import type { ReactNode } from "react";

/**
 * The logo row.
 *
 * Ground rule, same as everywhere else in this project: nothing here may claim
 * a relationship that does not exist. Until commercial partners are signed,
 * this row carries the infrastructure the network genuinely runs on, under the
 * heading "Runs on" — every entry below is a real dependency of this repo, and
 * the marks are AIRTIME's own neutral glyphs rather than anyone's trademark.
 *
 * When real partners exist, replace the entries and pass a different `label`
 * to <LogoRow>. Nothing else has to change.
 */
export interface LogoEntry {
  name: string;
  /** What it actually does here. Shown to screen readers and on hover. */
  role: string;
  href?: string;
  mark: ReactNode;
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const PARTNERS: LogoEntry[] = [
  {
    name: "Robinhood Chain",
    role: "Settlement layer for every airtime purchase",
    href: "https://chain.robinhood.com",
    mark: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
        <rect x="3" y="8.5" width="10" height="7" rx="3.5" {...stroke} />
        <rect x="11" y="8.5" width="10" height="7" rx="3.5" {...stroke} />
      </svg>
    ),
  },
  {
    name: "EVM",
    role: "The AirtimePayments contract runtime",
    mark: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
        <path d="M12 2.5 19 12l-7 9.5L5 12z" {...stroke} />
        <path d="M5 12h14" {...stroke} />
      </svg>
    ),
  },
  {
    name: "Foundry",
    role: "Contract build, test and deploy toolchain",
    href: "https://getfoundry.sh",
    mark: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
        <path d="M12 3 20 7.5v9L12 21 4 16.5v-9z" {...stroke} />
        <circle cx="12" cy="12" r="2.4" {...stroke} />
      </svg>
    ),
  },
  {
    name: "Next.js",
    role: "Application server and route handlers",
    href: "https://nextjs.org",
    mark: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
        <circle cx="12" cy="12" r="9" {...stroke} />
        <path d="M8.5 16V8l7.5 9.2" {...stroke} />
      </svg>
    ),
  },
  {
    name: "React Three Fiber",
    role: "Declarative studio scene graph",
    href: "https://r3f.docs.pmnd.rs",
    mark: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
        <ellipse cx="12" cy="12" rx="9.2" ry="4" {...stroke} />
        <ellipse cx="12" cy="12" rx="9.2" ry="4" transform="rotate(60 12 12)" {...stroke} />
        <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      </svg>
    ),
  },
  {
    name: "three.js",
    role: "WebGL renderer behind every surface",
    href: "https://threejs.org",
    mark: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
        <path d="M12 3 20 7.5v9L12 21 4 16.5v-9z" {...stroke} />
        <path d="M4 7.5 12 12l8-4.5M12 12v9" {...stroke} />
      </svg>
    ),
  },
  {
    name: "PostgreSQL",
    role: "Schedule, inventory and payment ledger",
    href: "https://www.postgresql.org",
    mark: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
        <ellipse cx="12" cy="6" rx="7" ry="3" {...stroke} />
        <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" {...stroke} />
        <path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" {...stroke} />
      </svg>
    ),
  },
  {
    name: "Drizzle",
    role: "Typed schema and migrations",
    href: "https://orm.drizzle.team",
    mark: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
        <path d="M6 15 9.5 6M11 15l3.5-9M16 15l3.5-9" {...stroke} />
        <path d="M4 19h16" {...stroke} />
      </svg>
    ),
  },
  {
    name: "viem · wagmi",
    role: "Wallet connection and RPC reads",
    href: "https://viem.sh",
    mark: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
        <path d="M3 12h3l2.5-6 3.5 12 3-9 2 3h4" {...stroke} />
      </svg>
    ),
  },
  {
    name: "Playwright",
    role: "End-to-end proof of the whole purchase path",
    href: "https://playwright.dev",
    mark: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
        <circle cx="12" cy="12" r="9" {...stroke} />
        <path d="M10 8.5 16 12l-6 3.5z" {...stroke} />
      </svg>
    ),
  },
];
