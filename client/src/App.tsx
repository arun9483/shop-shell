import { Alert, Button, Heading, Paragraph, Spinner } from '@arun-dev/ui';
import { Suspense, useEffect, useState, type ComponentType } from 'react';
import styles from './App.module.css';
import { ErrorBoundary } from './ErrorBoundary';
import { activeMfe, MFE_ERROR_EVENT, MFE_ROOT_ID } from './mfes';
import { NavLink, usePathname } from './routing';
import { ThemeSwitcher } from './ThemeSwitcher';
import { lazyWithTimeout } from './timeouts';
import { announceSignOut, useUser } from './user';

// Each Shell feature is its own chunk, loaded on its first visit.
const features: Record<string, ComponentType> = {
  '/': lazyWithTimeout(() => import('./features/Home')),
  '/help': lazyWithTimeout(() => import('./features/Help')),
  '/test-error': lazyWithTimeout(() => import('./features/TestError')),
};

function useFailedMfes(): ReadonlySet<string> {
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const onError = (event: Event) => {
      const name: unknown = (event as CustomEvent).detail;
      if (typeof name === 'string') setFailed((names) => new Set(names).add(name));
    };
    window.addEventListener(MFE_ERROR_EVENT, onError);
    return () => {
      window.removeEventListener(MFE_ERROR_EVENT, onError);
    };
  }, []);
  return failed;
}

function Unavailable({ what }: { what: string }) {
  return (
    <Alert.Root tone="error">
      <Alert.Title>{what} is unavailable</Alert.Title>
      <Alert.Description>Something went wrong. The rest of the shop still works.</Alert.Description>
    </Alert.Root>
  );
}

/** The signed-in user and sign-out, when sign-in is on (MVP-2). Sign-out is a POST form. */
function UserMenu() {
  const user = useUser();
  if (!user) return null;
  return (
    <form className={styles.user} method="post" action="/auth/logout" onSubmit={announceSignOut}>
      <span>{user.name ?? user.preferred_username}</span>
      <Button type="submit" variant="ghost">
        Sign out
      </Button>
    </form>
  );
}

function NotFound() {
  return (
    <>
      <Heading level={1}>Page not found</Heading>
      <Paragraph>There is nothing at this address.</Paragraph>
    </>
  );
}

export function App() {
  const pathname = usePathname();
  const mfe = activeMfe(pathname);
  const failed = useFailedMfes();
  const Feature = features[pathname] ?? NotFound;

  return (
    <>
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <header className={styles.header}>
        <span className={styles.brand}>Shop</span>
        <nav aria-label="Main">
          <ul className={styles.nav}>
            <li>
              <NavLink to="/">Home</NavLink>
            </li>
            <li>
              <NavLink to="/catalog">Catalog</NavLink>
            </li>
            <li>
              <NavLink to="/cart">Cart</NavLink>
            </li>
            <li>
              <NavLink to="/help">Help</NavLink>
            </li>
          </ul>
        </nav>
        <div className={styles.end}>
          <UserMenu />
          <ThemeSwitcher />
        </div>
      </header>
      <main id="main" className={styles.main}>
        {!mfe && (
          <ErrorBoundary key={pathname} fallback={<Unavailable what="This page" />}>
            <Suspense fallback={<Spinner aria-label="Loading" />}>
              <Feature />
            </Suspense>
          </ErrorBoundary>
        )}
        {mfe && failed.has(mfe.name) && <Unavailable what={`The ${mfe.name} section`} />}
        {/* single-spa mounts the active MFE here; React never renders inside it. */}
        <div id={MFE_ROOT_ID} hidden={!mfe} />
      </main>
    </>
  );
}
