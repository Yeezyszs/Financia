export interface Clock {
  now(): Date;
  /** Data local no formato YYYY-MM-DD. */
  today(): string;
}
