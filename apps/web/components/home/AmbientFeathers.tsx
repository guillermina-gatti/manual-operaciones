import styles from './AmbientFeathers.module.css';

interface FeatherSpec {
  id: string;
  positionClass: string;
  driftClass: string;
  color: string;
  rachisColor: string;
  opacity: number;
  scale: number;
  delay: string;
  flip?: boolean;
  desktopOnly?: boolean;
}

const FEATHERS: readonly FeatherSpec[] = [
  {
    id: 'hero-top-left',
    positionClass: 'top-3 left-[2%] sm:left-[3%]',
    driftClass: styles.driftA,
    color: '#1F5848',
    rachisColor: '#EEF3F0',
    opacity: 0.16,
    scale: 0.95,
    delay: '-4s',
  },
  {
    id: 'hero-top-right',
    positionClass: 'top-3 right-[2%] sm:right-[3%]',
    driftClass: styles.driftB,
    color: '#6FAF86',
    rachisColor: '#1F5848',
    opacity: 0.18,
    scale: 0.88,
    delay: '-12s',
    flip: true,
  },
  {
    id: 'hero-mid-right-terracotta',
    positionClass: 'top-[38%] right-[1.5%]',
    driftClass: styles.driftC,
    color: '#9C5A2E',
    rachisColor: '#FCE9E0',
    opacity: 0.14,
    scale: 0.78,
    delay: '-7s',
    flip: true,
    desktopOnly: true,
  },
  {
    id: 'hero-bottom-left-terracotta',
    positionClass: 'bottom-3 left-[3%] sm:left-[4%]',
    driftClass: styles.driftB,
    color: '#9C5A2E',
    rachisColor: '#FCE9E0',
    opacity: 0.13,
    scale: 0.82,
    delay: '-16s',
  },
  {
    id: 'hero-bottom-right-forest',
    positionClass: 'bottom-3 right-[3%]',
    driftClass: styles.driftA,
    color: '#2E7D5B',
    rachisColor: '#EEF3F0',
    opacity: 0.15,
    scale: 0.72,
    delay: '-9s',
    flip: true,
    desktopOnly: true,
  },
  {
    id: 'hero-far-top-center',
    positionClass: 'top-2 left-[48%]',
    driftClass: styles.driftC,
    color: '#6FAF86',
    rachisColor: '#1F5848',
    opacity: 0.11,
    scale: 0.66,
    delay: '-19s',
    desktopOnly: true,
  },
];

function FeatherSvg({
  color,
  rachisColor,
  flip = false,
}: {
  color: string;
  rachisColor: string;
  flip?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 64 128"
      className="h-24 w-12 sm:h-28 sm:w-14"
      fill="none"
      aria-hidden="true"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path
        d="M35 8C47 21 54 43 49 67C46 80 40 90 32 100L29 89C23 93 17 90 15 82C11 66 14 44 24 25C27 18 31 12 35 8Z"
        fill={color}
      />
      <path
        d="M47 46C42 48 39 50 37 53C41 53 45 53 49 52"
        fill="#F6F7F6"
        fillOpacity="0.45"
      />
      <path
        d="M34 14C31 44 29 76 26 118"
        stroke={rachisColor}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeOpacity="0.65"
      />
    </svg>
  );
}

export function AmbientFeathers() {
  return (
    <div
      data-testid="ambient-feathers"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden select-none"
    >
      {FEATHERS.map((feather) => (
        <div
          key={feather.id}
          className={`absolute ${styles.feather} ${feather.driftClass} ${feather.positionClass} ${
            feather.desktopOnly ? 'hidden sm:block' : ''
          }`}
          style={{
            opacity: feather.opacity,
            animationDelay: feather.delay,
          }}
        >
          <div style={{ transform: `scale(${feather.scale})` }}>
            <FeatherSvg
              color={feather.color}
              rachisColor={feather.rachisColor}
              flip={feather.flip}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
