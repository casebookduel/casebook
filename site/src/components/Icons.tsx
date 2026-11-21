// Authored icons: one 1.6px stroke, round joins, sized by the text around them.
type P = { size?: number; label?: string };
const svg = (size: number, label: string | undefined, d: React.ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6}
    strokeLinecap="round" strokeLinejoin="round" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    {d}
  </svg>
);
export const Check = ({ size = 18, label = "right" }: P) => svg(size, label, <><circle cx="10" cy="10" r="7.6" /><path d="M6.6 10.3l2.3 2.3 4.6-5" /></>);
export const Cross = ({ size = 18, label = "wrong" }: P) => svg(size, label, <><circle cx="10" cy="10" r="7.6" /><path d="M7.4 7.4l5.2 5.2M12.6 7.4l-5.2 5.2" /></>);
export const Arrow = ({ size = 18, label }: P) => svg(size, label, <path d="M4 10h12M11.5 5.5L16 10l-4.5 4.5" />);
export const Copy = ({ size = 16, label }: P) => svg(size, label, <><rect x="7" y="7" width="9.5" height="9.5" rx="2" /><path d="M13 7V5.2A1.7 1.7 0 0 0 11.3 3.5H5.2A1.7 1.7 0 0 0 3.5 5.2v6.1A1.7 1.7 0 0 0 5.2 13H7" /></>);
export const Back = ({ size = 18, label }: P) => svg(size, label, <path d="M16 10H4M8.5 5.5L4 10l4.5 4.5" />);
// Brand marks of the two networks we link to, filled rather than stroked, as their owners draw them.
export const XLogo = ({ size = 17 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23zm-1.16 17.52h1.83L7.08 4.13H5.12z" /></svg>
);
export const GitHubMark = ({ size = 17 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" /></svg>
);
