import type { MessageSender } from './interfaces.js';

let installed = false;

export function installCapatazLogger(getSender: () => MessageSender | undefined): void {
  if (installed) return;
  installed = true;
  const original = console.log.bind(console);
  console.log = (...args: unknown[]) => {
    original(...args);
    try {
      const first = args[0];
      if (typeof first !== 'string' || !first.startsWith('[Pixel Agents]')) return;
      const text = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      getSender()?.postMessage({ type: 'capatazLog', text });
    } catch {
      /* never let the logger break console.log */
    }
  };
}
