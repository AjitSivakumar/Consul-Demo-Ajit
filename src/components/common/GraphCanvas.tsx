import { useEffect, useRef } from 'react';

interface GNode {
  x: number; y: number;
  vx: number; vy: number;
  ox: number; oy: number;
  rxFrac: number; ryFrac: number;
  r: number;
  phase: number;
  alpha: number; // base opacity for this node
}

const NODE_DEFS = [
  // core hubs
  { rx: 0.38, ry: 0.42, r: 6.5 },  // 0
  { rx: 0.60, ry: 0.42, r: 7.5 },  // 1
  { rx: 0.52, ry: 0.22, r: 5.0 },  // 2
  // mid ring
  { rx: 0.76, ry: 0.26, r: 4.0 },  // 3
  { rx: 0.82, ry: 0.46, r: 3.5 },  // 4
  { rx: 0.74, ry: 0.63, r: 3.5 },  // 5
  { rx: 0.58, ry: 0.72, r: 4.5 },  // 6
  { rx: 0.42, ry: 0.76, r: 3.5 },  // 7
  { rx: 0.28, ry: 0.66, r: 3.5 },  // 8
  { rx: 0.62, ry: 0.28, r: 4.5 },  // 9
  { rx: 0.72, ry: 0.38, r: 3.0 },  // 10
  { rx: 0.20, ry: 0.30, r: 3.0 },  // 11
  { rx: 0.24, ry: 0.52, r: 3.0 },  // 12
  { rx: 0.36, ry: 0.82, r: 3.0 },  // 13
  { rx: 0.84, ry: 0.60, r: 3.0 },  // 14
  { rx: 0.64, ry: 0.80, r: 3.5 },  // 15
  { rx: 0.80, ry: 0.32, r: 4.5 },  // 16
  { rx: 0.16, ry: 0.44, r: 3.0 },  // 17
  // new outer nodes
  { rx: 0.10, ry: 0.20, r: 2.5 },  // 18
  { rx: 0.30, ry: 0.14, r: 2.5 },  // 19
  { rx: 0.50, ry: 0.08, r: 3.0 },  // 20
  { rx: 0.68, ry: 0.12, r: 2.5 },  // 21
  { rx: 0.88, ry: 0.18, r: 2.5 },  // 22
  { rx: 0.94, ry: 0.38, r: 2.5 },  // 23
  { rx: 0.92, ry: 0.56, r: 2.5 },  // 24
  { rx: 0.88, ry: 0.74, r: 2.5 },  // 25
  { rx: 0.72, ry: 0.88, r: 2.5 },  // 26
  { rx: 0.52, ry: 0.92, r: 3.0 },  // 27
  { rx: 0.32, ry: 0.90, r: 2.5 },  // 28
  { rx: 0.14, ry: 0.76, r: 2.5 },  // 29
  { rx: 0.08, ry: 0.58, r: 2.5 },  // 30
  { rx: 0.10, ry: 0.38, r: 2.5 },  // 31
  { rx: 0.44, ry: 0.56, r: 3.0 },  // 32 — inner connector
  { rx: 0.66, ry: 0.54, r: 3.0 },  // 33 — inner connector
];

const EDGES: [number, number][] = [
  // original core
  [0,1],[1,2],[1,3],[1,4],[1,5],[1,6],[1,7],[1,8],
  [2,9],[2,3],[11,0],[12,0],[17,0],[9,3],[9,4],
  [3,10],[4,14],[5,6],[6,15],[8,13],[1,10],[1,16],
  [16,3],[16,9],[12,2],[11,9],[15,6],[1,15],[10,4],[7,13],[2,16],
  // new inner connectors
  [0,32],[1,33],[32,7],[33,5],[32,33],[32,8],[33,4],
  // outer ring connections
  [18,11],[18,31],[19,11],[19,20],[20,2],[20,21],[21,9],[21,22],
  [22,3],[22,23],[23,16],[23,4],[24,4],[24,14],[24,25],[25,5],[25,26],
  [26,15],[26,27],[27,6],[27,28],[28,7],[28,13],[29,8],[29,30],[30,12],
  [30,31],[31,17],[31,18],[29,13],[17,12],
];

// Blue palette
const PURPLE_NODE  = '#3b82f6';
const PURPLE_GLOW  = 'rgba(59,130,246,';
const EDGE_BASE    = 'rgba(59,130,246,0.22)';
const EDGE_ACTIVE  = 'rgba(59,130,246,0.60)';

export function GraphCanvas(): React.JSX.Element {
  const wrapRef   = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef  = useRef({ x: -9999, y: -9999 });
  const nodesRef  = useRef<GNode[]>([]);
  const rafRef    = useRef<number>(0);
  const timeRef   = useRef(0);

  useEffect(() => {
    const wrap   = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    let W = 0, H = 0;

    function resize(snap = false) {
      W = wrap!.offsetWidth;
      H = wrap!.offsetHeight;
      canvas!.width  = W * dpr;
      canvas!.height = H * dpr;
      canvas!.style.width  = `${W}px`;
      canvas!.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      nodesRef.current.forEach(n => {
        n.ox = n.rxFrac * W;
        n.oy = n.ryFrac * H;
        if (snap) { n.x = n.ox; n.y = n.oy; n.vx = 0; n.vy = 0; }
      });
    }

    nodesRef.current = NODE_DEFS.map((def, i) => ({
      x: 0, y: 0,
      vx: 0, vy: 0,
      ox: 0, oy: 0,
      rxFrac: def.rx, ryFrac: def.ry,
      r: def.r,
      phase: (i / NODE_DEFS.length) * Math.PI * 2,
      alpha: 0.55 + Math.random() * 0.45,
    }));

    resize(true); // snap=true: place nodes at rest positions immediately
    const ro = new ResizeObserver(() => resize(false));
    ro.observe(wrap);

    function tick() {
      if (!canvas) return;
      ctx.clearRect(0, 0, W, H);
      timeRef.current += 0.005; // slower, more ambient
      const t     = timeRef.current;
      const nodes = nodesRef.current;
      const mouse = mouseRef.current;

      // Physics
      nodes.forEach(n => {
        const idleX = Math.sin(t * 0.7 + n.phase) * 10 + Math.sin(t * 0.3 + n.phase * 1.3) * 5;
        const idleY = Math.cos(t * 0.5 + n.phase) * 8  + Math.cos(t * 0.2 + n.phase * 0.9) * 4;

        n.vx += (n.ox + idleX - n.x) * 0.018;
        n.vy += (n.oy + idleY - n.y) * 0.018;

        // Gentle mouse nudge
        const mdx = n.x - mouse.x;
        const mdy = n.y - mouse.y;
        const md2 = mdx * mdx + mdy * mdy;
        const repelRadius = 90;
        if (md2 < repelRadius * repelRadius && md2 > 0.01) {
          const md    = Math.sqrt(md2);
          const force = ((repelRadius - md) / repelRadius) * 0.6;
          n.vx += (mdx / md) * force;
          n.vy += (mdy / md) * force;
        }

        n.vx *= 0.80;
        n.vy *= 0.80;
        n.x  += n.vx;
        n.y  += n.vy;
      });

      // Closest node to mouse
      let closestIdx  = -1;
      let closestDist = 90;
      nodes.forEach((n, i) => {
        const d = Math.hypot(n.x - mouse.x, n.y - mouse.y);
        if (d < closestDist) { closestDist = d; closestIdx = i; }
      });

      // Pulse wave: a slow sine that travels outward from each node
      const pulse = (Math.sin(t * 1.8) + 1) / 2; // 0–1

      // Draw edges
      EDGES.forEach(([a, b]) => {
        const na = nodes[a], nb = nodes[b];
        const isActive = a === closestIdx || b === closestIdx;

        ctx.beginPath();
        ctx.moveTo(na.x, na.y);
        ctx.lineTo(nb.x, nb.y);
        ctx.strokeStyle = isActive ? EDGE_ACTIVE : EDGE_BASE;
        ctx.lineWidth   = isActive ? 1.0 : 0.6;
        ctx.stroke();
      });

      // Draw nodes
      nodes.forEach((n, i) => {
        const isActive = i === closestIdx;
        const scale    = isActive ? 1.6 : 1;
        const r        = n.r * scale;

        // Ambient glow (always on for larger nodes, subtle)
        if (n.r >= 3.5 || isActive) {
          const glowR = r + (isActive ? 14 : 6 + pulse * 3);
          const grd   = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glowR);
          grd.addColorStop(0, `${PURPLE_GLOW}${isActive ? 0.22 : 0.10})`);
          grd.addColorStop(1, `${PURPLE_GLOW}0)`);
          ctx.beginPath();
          ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2);
          ctx.fillStyle = grd;
          ctx.fill();
        }

        // Node dot
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.globalAlpha = isActive ? 1 : n.alpha;
        ctx.fillStyle   = PURPLE_NODE;
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      rafRef.current = requestAnimationFrame(tick);
    }

    tick();

    // Listen on the hero section (parent) since the wrap itself has pointer-events: none
    const target = wrap.parentElement ?? wrap;
    const onMove  = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onLeave = () => { mouseRef.current = { x: -9999, y: -9999 }; };
    target.addEventListener('mousemove', onMove);
    target.addEventListener('mouseleave', onLeave);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      target.removeEventListener('mousemove', onMove);
      target.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return (
    <div ref={wrapRef} className="lp-graph-wrap">
      <canvas ref={canvasRef} />
    </div>
  );
}
