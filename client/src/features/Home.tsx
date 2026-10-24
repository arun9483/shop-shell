import { Heading, Paragraph } from '@arun-dev/ui';
import { useEffect, useState } from 'react';

export default function Home() {
  const [greeting, setGreeting] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/shell/greeting', { signal: controller.signal })
      .then((res) => res.json() as Promise<{ message: string }>)
      .then(({ message }) => {
        setGreeting(message);
      })
      .catch(() => {
        setGreeting(undefined);
      });
    return () => {
      controller.abort();
    };
  }, []);

  return (
    <>
      <Heading level={1}>Home</Heading>
      <Paragraph>{greeting ?? 'Loading…'}</Paragraph>
    </>
  );
}
