import { Link } from '@arun-dev/ui';
import type { MouseEvent, ReactNode } from 'react';
import { useSyncExternalStore } from 'react';
import { navigateToUrl } from 'single-spa';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  window.addEventListener('single-spa:routing-event', onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener('single-spa:routing-event', onChange);
  };
}

export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

export function useSearch(): string {
  return useSyncExternalStore(subscribe, () => window.location.search);
}

/** A link that navigates in the page, so single-spa can mount and unmount MFEs. */
export function NavLink({ to, children }: { to: string; children: ReactNode }) {
  const pathname = usePathname();
  const current = to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`);

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    navigateToUrl(to);
  }

  return (
    <Link href={to} onClick={onClick} {...(current ? { 'aria-current': 'page' as const } : {})}>
      {children}
    </Link>
  );
}
