import { Heading, Paragraph } from '@arun-dev/ui';
import { useEffect, useState } from 'react';
import { fetchWithTimeout } from '../timeouts';

export default function Home() {
  const [greeting, setGreeting] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchWithTimeout('/api/shell/greeting', controller.signal)
      .then((res) =>
        res.ok ? (res.json() as Promise<{ message: string }>) : Promise.reject(new Error()),
      )
      .then(({ message }) => {
        setGreeting(message);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
    };
  }, []);

  return (
    <>
      <Heading level={1}>Home</Heading>
      <Paragraph>
        {failed ? 'The greeting could not be loaded.' : (greeting ?? 'Loading…')}
      </Paragraph>
    </>
  );
}
