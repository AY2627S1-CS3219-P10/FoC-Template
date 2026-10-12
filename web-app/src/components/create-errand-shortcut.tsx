"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
type Position = { x: number; y: number };
const storageKey = "foc-create-errand-position";
export function CreateErrandShortcut() {
  const router = useRouter();
  const ref = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; start: Position; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [position, setPosition] = useState<Position | null>(null);
  function clamp(value: Position): Position {
    const box = ref.current?.getBoundingClientRect();
    return { x: Math.max(8, Math.min(value.x, innerWidth - (box?.width ?? 160) - 8)), y: Math.max(8, Math.min(value.y, innerHeight - (box?.height ?? 48) - 8)) };
  }
  function save(value: Position) {
    const next = clamp(value); setPosition(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Position still works without storage. */ }
  }
  useEffect(() => {
    function restore() {
      try { const value = JSON.parse(localStorage.getItem(storageKey) ?? "null"); if (value && Number.isFinite(value.x) && Number.isFinite(value.y)) setPosition(clamp(value)); } catch { /* Keep the default position. */ }
    }
    restore(); window.addEventListener("resize", restore);
    return () => window.removeEventListener("resize", restore);
  }, []);
  return <button ref={ref} className="create-errand-shortcut" style={position ? { left: position.x, top: position.y, right: "auto", bottom: "auto" } : undefined}
    aria-label="Create errand" aria-describedby="shortcut-help"
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      const box = event.currentTarget.getBoundingClientRect(); suppressClick.current = false;
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start: { x: box.left, y: box.top }, moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={(event) => {
      const current = drag.current; if (!current || current.id !== event.pointerId) return;
      const dx = event.clientX - current.x, dy = event.clientY - current.y;
      if (Math.hypot(dx, dy) > 6) current.moved = true;
      if (current.moved) { suppressClick.current = true; setPosition(clamp({ x: current.start.x + dx, y: current.start.y + dy })); }
    }}
    onPointerUp={(event) => { const current = drag.current; if (current?.id !== event.pointerId) return; if (current.moved) save({ x: current.start.x + event.clientX - current.x, y: current.start.y + event.clientY - current.y }); drag.current = null; }}
    onPointerCancel={() => { drag.current = null; suppressClick.current = true; }}
    onClick={(event) => { if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; return; } router.push("/errands/create"); }}
    onKeyDown={(event) => {
      const delta = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }[event.key];
      if (!delta) return; event.preventDefault(); const box = event.currentTarget.getBoundingClientRect(); save({ x: box.left + delta[0], y: box.top + delta[1] });
    }}>
    <span aria-hidden="true">＋</span> Create errand<span id="shortcut-help" className="shortcut-help">Drag to move. Use arrow keys to move when focused; Enter to open.</span>
  </button>;
}
