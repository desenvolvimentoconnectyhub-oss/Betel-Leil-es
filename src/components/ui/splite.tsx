"use client";

import dynamic from "next/dynamic";
import {
  Component,
  useEffect,
  useRef,
  useState,
} from "react";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

const Spline = dynamic(() => import("@splinetool/react-spline"), {
  ssr: false,
  loading: () => null,
});

type SceneState = "waiting" | "enabled" | "static";

type IdleWindow = Window &
  typeof globalThis & {
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout?: number },
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

type NavigatorWithHints = Navigator & {
  connection?: {
    effectiveType?: string;
    saveData?: boolean;
  };
  deviceMemory?: number;
};

interface SplineSceneProps {
  scene: string;
  className?: string;
}

// Awakening choreography — robot discovers it's alive.
// x, y are canvas fractions (0 = left/top, 1 = right/bottom).
// ease = transition duration ms, hold = pause duration ms.
const CHOREOGRAPHY = [
  { x: 0.50, y: 0.48, ease: 1200, hold: 2000 }, // center — consciousness arrives
  { x: 0.38, y: 0.72, ease: 1800, hold: 3000 }, // left hand — discovers it
  { x: 0.62, y: 0.72, ease: 1600, hold: 3200 }, // right hand — discovers it
  { x: 0.44, y: 0.70, ease:  900, hold: 1000 }, // between hands (left)
  { x: 0.56, y: 0.70, ease:  800, hold: 1000 }, // between hands (right)
  { x: 0.50, y: 0.69, ease:  600, hold:  700 }, // center between hands
  { x: 0.10, y: 0.44, ease: 2200, hold: 2500 }, // look left — explores environment
  { x: 0.90, y: 0.44, ease: 2600, hold: 2500 }, // look right — explores environment
  { x: 0.50, y: 0.22, ease: 1200, hold: 1000 }, // look up briefly
  { x: 0.50, y: 0.48, ease: 1000, hold:  500 }, // return to center
  { x: 0.40, y: 0.72, ease: 1400, hold: 2000 }, // back to left hand
  { x: 0.52, y: 0.70, ease: 1400, hold: 3500 }, // wonder at hands — longest pause
] as const;

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

export function SplineScene({ scene, className }: SplineSceneProps) {
  const [sceneState, setSceneState] = useState<SceneState>("waiting");
  const [blocked, setBlocked] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleWebglError = (event: ErrorEvent) => {
      if (
        event.message.includes("WebGL") ||
        event.message.includes("THREE.WebGLRenderer")
      ) {
        event.preventDefault();
        setBlocked(true);
      }
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = String(event.reason?.message || event.reason || "");
      if (reason.includes("WebGL") || reason.includes("THREE.WebGLRenderer")) {
        event.preventDefault();
        setBlocked(true);
      }
    };

    window.addEventListener("error", handleWebglError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleWebglError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  useEffect(() => {
    const win = window as IdleWindow;
    let finished = false;
    let idleId: number | undefined;
    let timeoutId: number | undefined;

    const enableScene = () => {
      if (finished) return;
      finished = true;
      setSceneState("enabled");
    };

    const prepareScene = () => {
      if (!canUseWebgl() || shouldUseStaticScene()) {
        finished = true;
        setSceneState("static");
        return;
      }

      timeoutId = window.setTimeout(enableScene, 2400);

      if (win.requestIdleCallback) {
        idleId = win.requestIdleCallback(enableScene, { timeout: 1800 });
      }
    };

    const frameId = window.requestAnimationFrame(prepareScene);

    return () => {
      finished = true;
      window.cancelAnimationFrame(frameId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      if (idleId !== undefined && win.cancelIdleCallback) win.cancelIdleCallback(idleId);
    };
  }, []);

  // Autonomous awakening choreography — drives robot and chest label together.
  useEffect(() => {
    if (!loaded) return;

    let frameId: number;
    let phaseIndex = 0;
    let phaseStart = -1;
    let prevX: number = CHOREOGRAPHY[0].x;
    let prevY: number = CHOREOGRAPHY[0].y;
    let inEase = true;
    let lastDispatch = 0;
    const DISPATCH_INTERVAL = 1000 / 24; // cap Spline events at 24 fps

    const animate = (now: number) => {
      if (phaseStart < 0) phaseStart = now;

      const phase = CHOREOGRAPHY[phaseIndex];
      const elapsed = now - phaseStart;
      let cx: number;
      let cy: number;

      if (inEase) {
        const t = Math.min(elapsed / phase.ease, 1);
        const e = easeInOut(t);
        cx = prevX + (phase.x - prevX) * e;
        cy = prevY + (phase.y - prevY) * e;

        if (t >= 1) {
          inEase = false;
          phaseStart = now;
        }
      } else {
        // Subtle micro-oscillation during hold — breathing / wonder feeling
        const s = elapsed * 0.001;
        cx = phase.x + Math.sin(s * 1.1) * 0.012;
        cy = phase.y + Math.sin(s * 0.8 + 1.3) * 0.008;

        if (elapsed >= phase.hold) {
          prevX = phase.x;
          prevY = phase.y;
          phaseIndex = (phaseIndex + 1) % CHOREOGRAPHY.length;
          phaseStart = now;
          inEase = true;
        }
      }

      // Drive chest label
      const label = labelRef.current;
      if (label) {
        const lx = (cx - 0.5) * 18;
        const ly = (cy - 0.5) * 10;
        label.style.setProperty("--label-x", `${lx}px`);
        label.style.setProperty("--label-y", `${ly}px`);
        label.style.setProperty("--label-rotate", `${lx * -0.18}deg`);
      }

      // Dispatch synthetic pointer event to Spline canvas at 24 fps
      if (now - lastDispatch >= DISPATCH_INTERVAL) {
        const canvas = containerRef.current?.querySelector<HTMLCanvasElement>("canvas");
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          canvas.dispatchEvent(
            new PointerEvent("pointermove", {
              clientX: rect.left + rect.width * cx,
              clientY: rect.top + rect.height * cy,
              bubbles: true,
              cancelable: false,
            }),
          );
        }
        lastDispatch = now;
      }

      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [loaded]);

  // Disable pointer events on the canvas so real mouse/touch falls through to
  // the page (scroll works on mobile). dispatchEvent() in the choreography loop
  // bypasses pointer-events and still drives the robot normally.
  useEffect(() => {
    if (!loaded || !containerRef.current) return;
    const canvas = containerRef.current.querySelector<HTMLCanvasElement>("canvas");
    if (canvas) canvas.style.pointerEvents = "none";
  }, [loaded]);

  if (blocked || sceneState === "static") {
    return <SplineFallback className={className} />;
  }

  const shouldLoadScene = sceneState === "enabled";

  return (
    <div className={cn("relative h-full w-full", className)} ref={containerRef}>
      <RobotChestLabel active={loaded} labelRef={labelRef} />
      {!loaded && (
        <SplineFallback className="pointer-events-none absolute inset-0" loading />
      )}
      <SplineBoundary fallback={<SplineFallback className="absolute inset-0" />}>
        {shouldLoadScene && (
          <Spline
            scene={scene}
            className="relative z-10 h-full w-full"
            onLoad={() => setLoaded(true)}
          />
        )}
      </SplineBoundary>
    </div>
  );
}

function RobotChestLabel({
  active,
  labelRef,
}: {
  active: boolean;
  labelRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={labelRef}
      className={cn(
        "robot-chest-label display-type pointer-events-none absolute left-[49%] top-[48.5%] z-20 hidden select-none lg:block",
        active && "is-loaded",
      )}
    >
      Connecty<span className="robot-chest-accent">Hub</span>
    </div>
  );
}

function canUseWebgl() {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  return Boolean(
    canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl"),
  );
}

function shouldUseStaticScene() {
  const nav = navigator as NavigatorWithHints;
  const connection = nav.connection;
  const effectiveType = connection?.effectiveType;
  const veryLowMemory =
    typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2;

  return (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    connection?.saveData === true ||
    effectiveType === "slow-2g" ||
    effectiveType === "2g" ||
    veryLowMemory
  );
}

class SplineBoundary extends Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function SplineFallback({
  className,
  loading,
}: {
  className?: string;
  loading?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex h-full w-full items-center justify-center overflow-hidden",
        className,
      )}
    >
      <div className="absolute h-[58%] w-[58%] rounded-full bg-[#0aff0a]/10 blur-3xl lg:h-[60%] lg:w-[60%]" />
      <div className="relative flex aspect-[3/4] h-[60%] max-h-[620px] min-h-[220px] flex-col items-center justify-center rounded-full border border-[#0aff0a]/25 bg-black/40 shadow-[0_0_80px_rgba(10,255,10,0.16)] sm:h-[70%] sm:min-h-[280px] lg:h-[78%] lg:min-h-[300px]">
        <div className="mb-4 rounded-full border border-[#00f3ff]/40 bg-[#00f3ff]/10 p-5 text-[#0aff0a] shadow-[0_0_30px_rgba(0,243,255,0.16)] sm:mb-5 sm:p-7">
          <Bot size={56} strokeWidth={1.25} className="sm:hidden" />
          <Bot size={86} strokeWidth={1.25} className="hidden sm:block" />
        </div>
        <div className="font-mono text-[10px] uppercase text-[#00f3ff] sm:text-xs">
          {loading ? "Carregando agente 3D" : "Agente IA online"}
        </div>
        <div className="mt-3 h-1 w-24 overflow-hidden rounded-full bg-white/10 sm:w-32">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-[#0aff0a]" />
        </div>
      </div>
    </div>
  );
}
