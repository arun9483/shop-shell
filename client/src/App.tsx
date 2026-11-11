import { Alert, Button, Heading, Paragraph, Spinner } from '@arun-dev/ui';
import { Suspense, useEffect, useState, type ComponentType } from 'react';
import styles from './App.module.css';
import { ErrorBoundary } from './ErrorBoundary';
import { activeMfe, MFE_ERROR_EVENT, MFE_NO_ACCESS_EVENT, MFE_ROOT_ID } from './mfes';
import { NavLink, usePathname } from './routing';
import { ThemeSwitcher } from './ThemeSwitcher';
import { lazyWithTimeout } from './timeouts';
import { announceLogout, useUser } from './user';

// Each Shell feature is its own chunk, loaded on its first visit.
const features: Record<string, ComponentType> = {
  '/': lazyWithTimeout(() => import('./features/Home')),
  '/help': lazyWithTimeout(() => import('./features/Help')),
  '/test-error': lazyWithTimeout(() => import('./features/TestError')),
};

/** The names of the MFEs that fired `eventName`. */
function useMfeEvents(eventName: string): ReadonlySet<string> {
  const [names, setNames] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const onEvent = (event: Event) => {
      const name: unknown = (event as CustomEvent).detail;
      if (typeof name === 'string') setNames((seen) => new Set(seen).add(name));
    };
    window.addEventListener(eventName, onEvent);
    return () => {
      window.removeEventListener(eventName, onEvent);
    };
  }, [eventName]);
  return names;
}

/** The user has no role in this MFE (MVP-2): the rest of the shop works. */
function NoAccess({ name }: { name: string }) {
  const title = name.charAt(0).toUpperCase() + name.slice(1);
  return (
    <Alert.Root tone="warning">
      <Alert.Title>You do not have access to {title}</Alert.Title>
      <Alert.Description>
        Ask for access to use it. The rest of the shop still works.
      </Alert.Description>
    </Alert.Root>
  );
}

function Unavailable({ what }: { what: string }) {
  return (
    <Alert.Root tone="error">
      <Alert.Title>{what} is unavailable</Alert.Title>
      <Alert.Description>Something went wrong. The rest of the shop still works.</Alert.Description>
    </Alert.Root>
  );
}

/** The logged-in user and logout, when login is on (MVP-2). Logout is a POST form. */
function UserMenu() {
  const user = useUser();
  if (!user) return null;
  return (
    <form className={styles.user} method="post" action="/auth/logout" onSubmit={announceLogout}>
      <span>{user.name ?? user.preferred_username}</span>
      <Button type="submit" variant="ghost">
        Log out
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
  const failed = useMfeEvents(MFE_ERROR_EVENT);
  const forbidden = useMfeEvents(MFE_NO_ACCESS_EVENT);
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
        {mfe && forbidden.has(mfe.name) && <NoAccess name={mfe.name} />}
        {mfe && failed.has(mfe.name) && !forbidden.has(mfe.name) && (
          <Unavailable what={`The ${mfe.name} section`} />
        )}
        {/* single-spa mounts the active MFE here; React never renders inside it. */}
        <div id={MFE_ROOT_ID} hidden={!mfe} />
      </main>
    </>
  );
}
