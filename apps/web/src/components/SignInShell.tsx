import { type ReactNode, useId, useState } from 'react';

/** The SedHub mark: an "S" made of two hexagon ribbons, blue above and green below. */
export function SedHubMark({ size = 44, className }: { size?: number; className?: string }) {
  const ribbon = 'M24 4 42 14.4V21L24 10.6 12.6 17.2 24 23.8 18.3 27.1 6 20V14.4Z';
  // Own gradient ids per logo: another copy may sit in a hidden panel, where its gradients don't paint.
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 48 52" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-blue`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#38a0ff" />
          <stop offset="1" stopColor="#1546d6" />
        </linearGradient>
        <linearGradient id={`${id}-green`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#13a24c" />
          <stop offset="1" stopColor="#3ee07b" />
        </linearGradient>
      </defs>
      <path d={ribbon} fill={`url(#${id}-blue)`} />
      <path d={ribbon} fill={`url(#${id}-green)`} transform="rotate(180 24 26)" />
    </svg>
  );
}

const iconProps = {
  width: 34,
  height: 34,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const FEATURES: { label: ReactNode; icon: ReactNode }[] = [
  {
    label: (
      <>
        Projects &amp; Tasks
        <br />
        (JIRA Lite)
      </>
    ),
    icon: (
      <svg {...iconProps}>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 3h6v3H9zM8 11l1.5 1.5L12 10M8 16l1.5 1.5L12 15M14 11h3M14 16h3" />
      </svg>
    ),
  },
  {
    label: (
      <>
        Resource
        <br />
        Management
      </>
    ),
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="8" r="3" />
        <circle cx="5.5" cy="10" r="2.2" />
        <circle cx="18.5" cy="10" r="2.2" />
        <path d="M6.5 20a5.5 5.5 0 0 1 11 0M2 19a3.5 3.5 0 0 1 4.6-3.3M22 19a3.5 3.5 0 0 0-4.6-3.3" />
      </svg>
    ),
  },
  {
    label: (
      <>
        Reports &amp;
        <br />
        Insights
      </>
    ),
    icon: (
      <svg {...iconProps}>
        <rect x="4" y="12" width="4" height="8" rx="1" />
        <rect x="10" y="8" width="4" height="12" rx="1" />
        <rect x="16" y="4" width="4" height="16" rx="1" />
      </svg>
    ),
  },
  {
    label: (
      <>
        Sprints &amp;
        <br />
        Collaboration
      </>
    ),
    icon: (
      <svg {...iconProps}>
        <path d="m12 3 9 5-9 5-9-5ZM3 12l9 5 9-5M3 16l9 5 9-5" />
      </svg>
    ),
  },
];

/** A glass office block drawn in lines, for the bottom of the brand panel. */
function Building() {
  const cols = 9;
  const rows = 10;
  return (
    <svg
      viewBox="0 0 400 260"
      className="pointer-events-none absolute bottom-0 left-0 w-[min(88%,560px,55vh)] opacity-80"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5aa4ff" stopOpacity=".55" />
          <stop offset="1" stopColor="#0b2a78" stopOpacity=".2" />
        </linearGradient>
      </defs>
      <path d="M40 260V70l150-50v240Z" fill="url(#glass)" stroke="#8fc2ff" strokeOpacity=".5" />
      <path
        d="M190 260V20l90 40v200Z"
        fill="#0d2f86"
        fillOpacity=".55"
        stroke="#8fc2ff"
        strokeOpacity=".4"
      />
      {Array.from({ length: rows }, (_, r) => (
        <path
          key={`r${r}`}
          d={`M40 ${85 + r * 18}l150 ${-50 + r * 0}`}
          stroke="#cfe5ff"
          strokeOpacity=".28"
          transform={`translate(0 ${0})`}
        />
      ))}
      {Array.from({ length: cols }, (_, c) => (
        <path
          key={`c${c}`}
          d={`M${40 + (c + 1) * 16.6} ${70 - (c + 1) * 5.5}V260`}
          stroke="#cfe5ff"
          strokeOpacity=".22"
        />
      ))}
      {Array.from({ length: 6 }, (_, c) => (
        <path
          key={`s${c}`}
          d={`M${200 + c * 14} ${24 + c * 6.2}V260`}
          stroke="#9cc8ff"
          strokeOpacity=".2"
        />
      ))}
      <path
        d="M0 260c40-30 70-40 110-28s70 20 120 4 90-10 170 24Z"
        fill="#06194f"
        fillOpacity=".85"
      />
    </svg>
  );
}

/** Help and Support at the top right: short answers, since there is no help site yet. */
function HelpLinks() {
  const [open, setOpen] = useState<'help' | 'support' | null>(null);
  const text = {
    help: 'Sign in with your company email and the password you were given. New accounts may be asked to choose a new password first.',
    support: 'For access, a new account or a password reset, contact your SedHub administrator.',
  };
  const btn = 'inline-flex items-center gap-1.5 text-[13px] text-[#1f2b4d] hover:text-teal';
  return (
    <div className="relative flex items-center justify-end gap-4 px-6 pt-[clamp(0.75rem,2.2vh,1.25rem)] text-sm sm:px-10">
      <button
        type="button"
        className={btn}
        aria-expanded={open === 'help'}
        onClick={() => setOpen(open === 'help' ? null : 'help')}
      >
        <svg {...iconProps} width={18} height={18} strokeWidth={1.8}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.4M12 17h.01" />
        </svg>
        Help
      </button>
      <span className="h-5 w-px bg-line" aria-hidden />
      <button
        type="button"
        className={btn}
        aria-expanded={open === 'support'}
        onClick={() => setOpen(open === 'support' ? null : 'support')}
      >
        <svg {...iconProps} width={18} height={18} strokeWidth={1.8}>
          <path d="M4 13v-1a8 8 0 0 1 16 0v1M4 13h3v5H5a1 1 0 0 1-1-1ZM20 13h-3v5h2a1 1 0 0 0 1-1Z" />
          <path d="M17 18c0 1.5-1.5 2.5-4 2.5" />
        </svg>
        Support
      </button>
      {open && (
        <p
          role="status"
          className="absolute top-12 right-6 z-10 max-w-xs rounded-md border border-line bg-panel px-3 py-2 text-xs text-ink shadow-lg sm:right-10"
        >
          {text[open]}
        </p>
      )}
    </div>
  );
}

/** Small trust badges under the card; each states something the app really does. */
function Badges() {
  const badge = (icon: ReactNode, label: ReactNode) => (
    <span className="flex items-center gap-2.5 text-xs leading-tight text-[#3b4867]">
      <span className="text-[#3b4867]">{icon}</span>
      <span>{label}</span>
    </span>
  );
  const shield = (
    <svg {...iconProps} width={26} height={26} strokeWidth={1.5}>
      <path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
  const lock = (
    <svg {...iconProps} width={26} height={26} strokeWidth={1.5}>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2" />
    </svg>
  );
  const items = [
    badge(
      shield,
      <>
        Secure sign-in
        <br />
        (hashed passwords)
      </>,
    ),
    badge(
      lock,
      <>
        Role-Based
        <br />
        Access Control
      </>,
    ),
    badge(
      shield,
      <>
        Private to
        <br />
        your company
      </>,
    ),
  ];
  return (
    <ul className="mx-auto mt-[clamp(1rem,3vh,2rem)] flex [@media(max-height:700px)]:mt-3 max-w-[460px] flex-wrap items-center justify-center gap-x-5 gap-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex items-center gap-5">
          {i > 0 && <span className="hidden h-9 w-px bg-[#cfd6e4] sm:block" aria-hidden />}
          {item}
        </li>
      ))}
    </ul>
  );
}

/**
 * Sign-in layout from the SedHub design: a blue brand panel with the product's areas on the left
 * (hidden on small screens), and the sign-in card on a light background on the right.
 */
export function SignInShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-[#f4f6fb] lg:grid-cols-[minmax(0,44fr)_minmax(0,56fr)]">
      <aside className="relative hidden overflow-hidden bg-[radial-gradient(120%_90%_at_10%_0%,#123a9c_0%,#0a2a7a_45%,#061c55_100%)] text-white lg:block [clip-path:ellipse(100%_120%_at_0%_50%)]">
        {/* Faint flowing lines, as in the design. */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full opacity-30"
          viewBox="0 0 600 800"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {Array.from({ length: 14 }, (_, i) => (
            <path
              key={i}
              d={`M0 ${380 + i * 9}C150 ${300 + i * 12} 330 ${520 - i * 6} 600 ${400 + i * 10}`}
              fill="none"
              stroke="#6fb0ff"
              strokeWidth=".6"
            />
          ))}
        </svg>
        <div className="relative z-10 flex flex-col gap-10 px-14 pt-16">
          <div className="flex items-center gap-5">
            <SedHubMark size={60} />
            <div>
              <p className="text-4xl font-bold tracking-tight">SedHub</p>
              <p className="mt-1 text-base text-white/90">Work · Resources · Delivery</p>
            </div>
          </div>
          <span className="h-[3px] w-11 bg-white/90" aria-hidden />
          <h2 className="max-w-md text-2xl leading-tight font-semibold">
            Enterprise Work &amp; Resource Management Platform
          </h2>
          <ul className="grid max-w-lg grid-cols-4 gap-2 text-center text-[13px] leading-snug">
            {FEATURES.map((f, i) => (
              <li
                key={i}
                className={`flex flex-col items-center gap-2.5 ${i === 2 ? 'border-l border-white/20' : ''}`}
              >
                {f.icon}
                <span>{f.label}</span>
              </li>
            ))}
          </ul>
        </div>
        <Building />
      </aside>
      <main className="flex min-h-dvh flex-col">
        <HelpLinks />
        <div className="flex flex-1 flex-col justify-center px-4 py-[clamp(0.75rem,3vh,2rem)] sm:px-10 [@media(max-height:700px)]:py-2">
          <div className="mx-auto w-full max-w-[460px] lg:mr-auto lg:ml-[clamp(0.5rem,3vw,3rem)]">
            {children}
            <Badges />
          </div>
        </div>
      </main>
    </div>
  );
}
