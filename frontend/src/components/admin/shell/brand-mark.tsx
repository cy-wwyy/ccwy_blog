/** Nova 四圆标识：全部用 --nova-brand 的不同透明度，暗色下自动跟随 */
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <circle cx="16.4" cy="13.6" r="9.1" fill="var(--nova-brand)" />
      <circle cx="27.9" cy="20.6" r="6.9" fill="var(--nova-brand)" opacity="0.78" />
      <circle cx="15.4" cy="27.4" r="6.4" fill="var(--nova-brand)" opacity="0.55" />
      <circle cx="25.4" cy="30.2" r="3.6" fill="var(--nova-brand)" opacity="0.35" />
    </svg>
  );
}
