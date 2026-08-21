import type { ReactNode } from 'react';

export interface TooltipState {
  x: number;
  y: number;
  title: string;
  rows: { label: string; value: string; color?: string }[];
}

/**
 * Tooltip posicionado em coordenadas de viewport (position: fixed), o que
 * evita o clássico corte dentro de container com overflow.
 */
export function Tooltip({ state }: { state: TooltipState | null }): ReactNode {
  if (!state) return null;

  const flipLeft = state.x > window.innerWidth - 190;

  return (
    <div
      className="tooltip"
      role="status"
      style={{
        left: flipLeft ? state.x - 170 : state.x + 14,
        top: Math.min(state.y + 12, window.innerHeight - 90),
      }}
    >
      <div className="tooltip-title">{state.title}</div>
      {state.rows.map((row) => (
        <div className="tooltip-row" key={row.label}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {row.color ? <i className="swatch" style={{ background: row.color }} /> : null}
            {row.label}
          </span>
          <b>{row.value}</b>
        </div>
      ))}
    </div>
  );
}
