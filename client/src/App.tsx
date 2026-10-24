import { Alert, Heading, Paragraph, Spinner } from '@arun-dev/ui';
import { Suspense, useEffect, useState, type ComponentType } from 'react';
import styles from './App.module.css';
import { ErrorBoundary } from './ErrorBoundary';
import { activeMfe, MFE_ERROR_EVENT, MFE_ROOT_ID } from './mfes';
import { NavLink, usePathname } from './routing';
import { lazyWithTimeout } from './timeouts';

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
