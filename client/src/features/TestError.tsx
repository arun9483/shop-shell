import { Button, Heading, Paragraph } from '@arun-dev/ui';
import { useState } from 'react';
import { NavLink, useSearch } from '../routing';
import styles from './TestError.module.css';

// Test triggers for error logging and source maps. Each `?kind=` reaches New Relic differently.
const kinds = {
  render: 'Throw while rendering (caught by the error boundary)',
  event: 'Throw in a click handler (uncaught error)',
  promise: 'Reject a promise without a handler (unhandled rejection)',
  fes: 'Fail in the Shell FES',
  backend: 'Fail in the Shell mock backend',
} as const;

type Kind = keyof typeof kinds;

function isKind(value: string | null): value is Kind {
  return value !== null && value in kinds;
}

function Throws(): never {
  throw new Error('Shell client test error (render)');
}

function Trigger({ kind }: { kind: Exclude<Kind, 'render'> }) {
  const [result, setResult] = useState('');

  async function call(url: string) {
    const res = await fetch(url);
    const { traceId } = (await res.json()) as { traceId?: string };
    setResult(`HTTP ${res.status}, trace ${traceId ?? 'unknown'}`);
  }

  function trigger() {
    switch (kind) {
      case 'event':
        throw new Error('Shell client test error (event)');
      case 'promise':
        void Promise.reject(new Error('Shell client test error (promise)'));
        return;
      case 'fes':
        void call('/api/shell/test-error');
        return;
      case 'backend':
        void call('/api/shell/test-error?in=backend');
    }
  }

  return (
    <>
      <Button variant="danger" onClick={trigger}>
        {kinds[kind]}
      </Button>
      <output aria-live="polite">{result}</output>
    </>
  );
}

export default function TestError() {
  const kind = new URLSearchParams(useSearch()).get('kind');

  return (
    <>
      <Heading level={1}>Test errors</Heading>
      {isKind(kind) ? (
        kind === 'render' ? (
          <Throws />
        ) : (
          <Trigger kind={kind} />
        )
      ) : (
        <>
          <Paragraph>Pick the kind of error to trigger.</Paragraph>
          <ul className={styles.kinds}>
            {Object.entries(kinds).map(([key, label]) => (
              <li key={key}>
                <NavLink to={`/test-error?kind=${key}`}>{label}</NavLink>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
