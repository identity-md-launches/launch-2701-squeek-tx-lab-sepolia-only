const paths: Record<string, React.ReactNode> = {
  wallet: <><path d="M20 8V5H5a2 2 0 0 0 0 4h16v11H5a2 2 0 0 1-2-2V7"/><path d="M21 12h-6v5h6"/><path d="M17 14.5h.01"/></>,
  arrow: <><path d="M7 17 17 7M7 7h10v10"/></>,
  send: <><path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/></>,
  ping: <><path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z"/></>,
  shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/></>,
  game: <><path d="M7 7h10a4 4 0 0 1 4 4v6a2 2 0 0 1-3 2l-3-3H9l-3 3a2 2 0 0 1-3-2v-6a4 4 0 0 1 4-4Z"/><path d="M6 11h5M8.5 8.5v5M16 11h.01M18 13h.01"/></>,
  rocket: <><path d="M12 15 9 12c1-5 5-9 12-9 0 7-4 11-9 12Z"/><path d="m9 12-5 1 1-5 6-2M12 15l-1 5 5-1 2-6M7 17l-3 3M6 15l-3 3M9 18l-3 3"/><circle cx="16" cy="8" r="1"/></>,
  log: <><path d="M7 3H4v18h16V3h-3M8 3h8v4H8zM8 12h8M8 16h5"/></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2"/></>,
  copy: <><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  settings: <><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/></>,
  network: <><path d="M12 3v5M5 17l4-5M19 17l-4-5"/><circle cx="12" cy="10" r="3"/><circle cx="4" cy="19" r="2"/><circle cx="20" cy="19" r="2"/></>,
  chevron: <path d="m9 5 7 7-7 7"/>,
  download: <><path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>,
};
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.info}</svg>;
}
