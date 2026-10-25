import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Starts `server` on `port` and resolves with the port it got, which is the system's choice for
 * port 0. A port in use is an error that says what to do, not Node's EADDRINUSE stack trace.
 */
export function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.off('listening', onListening);
      reject(
        error.code === 'EADDRINUSE'
          ? new Error(
              `shell-stub: port ${port} is in use. Pass --port <n>, set SHELL_STUB_PORT, or use ` +
                '--port 0 for any free port.',
            )
          : error,
      );
    };
    const onListening = () => {
      server.off('error', onError);
      resolve((server.address() as AddressInfo).port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port);
  });
}
