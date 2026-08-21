import type { Clock } from '../../application/ports/services/Clock.js';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  today(): string {
    const now = this.now();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }
}
