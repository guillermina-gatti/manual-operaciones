// The shape of what is about to appear, while it loads (DESIGN.md 6.6): one grey block per height.
// It is decorative; the text for screen readers goes in the ScreenState that holds it.
export function Skeleton({ heights }: { heights: string[] }) {
  return (
    <ul aria-hidden="true" className="flex animate-pulse flex-col gap-4 motion-reduce:animate-none">
      {heights.map((height, index) => (
        <li key={index} className={`${height} rounded-2xl bg-borde`} />
      ))}
    </ul>
  );
}
