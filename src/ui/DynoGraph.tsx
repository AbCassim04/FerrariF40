import { useEffect, useMemo, useRef, useState } from 'react';
import { engineTorque, torqueCurve } from '../engine/sim';
import { sim, useEngineStore } from '../state/engine';

/**
 * 9A live dyno graph: the sim's own full-boost torque (Nm) and power (hp) against rpm, as two
 * small panels sharing the rpm axis (two measures, two scales: no second y axis), peaks
 * marked, with a dot at the engine's speed and present output. Hover (or touch) reads any rpm.
 * It marks itself as UI in the way (`data-occludes`), so framing keeps the engine clear of it.
 */

const RPM = [1000, 8000] as const;
const HP = 7121; // P[hp] = T[Nm] × rpm / 7121
const W = 252;
const PAD = { l: 34, r: 10, t: 16, b: 4 };
const PANEL_H = 58;
const GAP = 22;
const AXIS_H = 26;
const H = PAD.t + PANEL_H + GAP + PANEL_H + AXIS_H;
const plotW = W - PAD.l - PAD.r;

const x = (rpm: number) => PAD.l + ((rpm - RPM[0]) / (RPM[1] - RPM[0])) * plotW;
const rpmAt = (px: number) => RPM[0] + ((px - PAD.l) / plotW) * (RPM[1] - RPM[0]);

interface Panel {
  key: 'torque' | 'power';
  title: string;
  unit: string;
  max: number;
  ticks: number[];
  top: number;
  value: (rpm: number, nm: number) => number;
}

const PANELS: Panel[] = [
  { key: 'torque', title: 'Torque', unit: 'Nm', max: 600, ticks: [0, 300, 600], top: PAD.t, value: (_, nm) => nm },
  { key: 'power', title: 'Power', unit: 'hp', max: 500, ticks: [0, 250, 500], top: PAD.t + PANEL_H + GAP, value: (rpm, nm) => (nm * rpm) / HP },
];
const y = (p: Panel, v: number) => p.top + PANEL_H * (1 - Math.max(0, Math.min(1, v / p.max)));

export function DynoGraph() {
  const running = useEngineStore((s) => s.engineRunning);
  const on = useEngineStore((s) => s.dynoGraph);
  if (!running || !on) return null;
  return <Graph />;
}

function Graph() {
  const curves = useMemo(() => {
    const pts: { rpm: number; nm: number }[] = [];
    for (let r = RPM[0]; r <= RPM[1]; r += 100) pts.push({ rpm: r, nm: torqueCurve(r) });
    return PANELS.map((p) => {
      const values = pts.map((q) => ({ rpm: q.rpm, v: p.value(q.rpm, q.nm) }));
      const peak = values.reduce((a, b) => (b.v > a.v ? b : a));
      return { p, d: values.map((q, i) => `${i ? 'L' : 'M'}${x(q.rpm).toFixed(1)} ${y(p, q.v).toFixed(1)}`).join(''), peak };
    });
  }, []);
  const dots = useRef<(SVGCircleElement | null)[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const rpm = Math.max(RPM[0], Math.min(RPM[1], sim.rpm));
      const nm = Math.max(0, engineTorque(sim, sim.rpm));
      PANELS.forEach((p, k) => {
        const d = dots.current[k];
        if (!d) return;
        d.setAttribute('cx', x(rpm).toFixed(1));
        d.setAttribute('cy', y(p, p.value(rpm, nm)).toFixed(1));
        d.style.opacity = sim.rpm > 300 ? '1' : '0';
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(px >= PAD.l && px <= W - PAD.r ? Math.round(rpmAt(px) / 50) * 50 : null);
  };
  const read = hover === null ? null : { rpm: hover, nm: torqueCurve(hover) };
  return (
    <figure className="dyno" data-occludes="" aria-label="Dyno graph: torque and power against engine speed, at full boost">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} onPointerMove={move} onPointerLeave={() => setHover(null)} onPointerDown={move}>
        {curves.map(({ p, d, peak }, k) => (
          <g key={p.key} className={`dyno__panel dyno__panel--${p.key}`}>
            <text className="dyno__title" x={PAD.l} y={p.top - 5}>
              {p.title}, {p.unit}
            </text>
            {p.ticks.map((t) => (
              <g key={t}>
                <line className="dyno__grid" x1={PAD.l} x2={W - PAD.r} y1={y(p, t)} y2={y(p, t)} />
                <text className="dyno__tick" x={PAD.l - 5} y={y(p, t) + 3} textAnchor="end">
                  {t}
                </text>
              </g>
            ))}
            <path className="dyno__curve" d={d} />
            {/* The peak, labelled in text ink beside its marker. */}
            <circle className="dyno__peak" cx={x(peak.rpm)} cy={y(p, peak.v)} r={3} />
            <text className="dyno__peak-label" x={x(peak.rpm) + (peak.rpm > 6000 ? -6 : 6)} y={y(p, peak.v) - 5} textAnchor={peak.rpm > 6000 ? 'end' : 'start'}>
              {Math.round(peak.v)} {p.unit} at {peak.rpm}
            </text>
            <circle ref={(el) => void (dots.current[k] = el)} className="dyno__live" r={4.5} cx={x(RPM[0])} cy={y(p, 0)} />
            {read && <circle className="dyno__hover-dot" cx={x(read.rpm)} cy={y(p, p.value(read.rpm, read.nm))} r={3} />}
          </g>
        ))}
        {[2000, 4000, 6000, 8000].map((r) => (
          <text key={r} className="dyno__tick" x={x(r)} y={PAD.t + PANEL_H * 2 + GAP + 12} textAnchor="middle">
            {r / 1000}k
          </text>
        ))}
        {!read && (
          <text className="dyno__axis" x={W - PAD.r} y={H - 2} textAnchor="end">
            engine speed, rpm · full boost
          </text>
        )}
        {read && (
          <>
            <line className="dyno__cross" x1={x(read.rpm)} x2={x(read.rpm)} y1={PAD.t} y2={PAD.t + PANEL_H * 2 + GAP} />
            <text className="dyno__read" x={PAD.l} y={H - 2}>
              {read.rpm} rpm: {Math.round(read.nm)} Nm, {Math.round((read.nm * read.rpm) / HP)} hp
            </text>
          </>
        )}
      </svg>
    </figure>
  );
}
