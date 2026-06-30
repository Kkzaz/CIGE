import type { Plugin } from 'vite';
import fs from 'fs';
import path from 'path';

const PORT_FILE = path.resolve(__dirname, '.vite-port');

export function vitePortPlugin(): Plugin {
  return {
    name: 'vite-port-plugin',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const address = server.httpServer?.address();
        if (address && typeof address === 'object') {
          fs.writeFileSync(PORT_FILE, String(address.port), 'utf-8');
          console.log(`[vite-port-plugin] wrote port ${address.port} to ${PORT_FILE}`);
        }
      });
    },
  };
}
