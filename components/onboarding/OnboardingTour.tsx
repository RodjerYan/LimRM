
import React, { useEffect, useMemo, useState } from "react";
import HintBubble from "./HintBubble";

type Step = {
  key: string;
  title: string;
  text: string;
  selector: string; // CSS selector
  placement?: "right" | "left" | "top" | "bottom";
};

const STORAGE_KEY = "limrm_onboarding_done_v1";

function getRect(el: Element | null) {
  if (!el) return null;
  const r = (el as HTMLElement).getBoundingClientRect();
  return r;
}

export default function OnboardingTour({ steps, enabled }: { steps: Step[]; enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  const done = useMemo(() => localStorage.getItem(STORAGE_KEY) === "1", []);
  
  useEffect(() => {
    if (!enabled) return;
    if (done) return;
    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
        setOpen(true);
        setIdx(0);
    }, 1000);
    return () => clearTimeout(timer);
  }, [enabled, done]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => setIdx((x) => x); // trigger rerender
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open]);

  if (!open || steps.length === 0) return null;

  const step = steps[Math.min(idx, steps.length - 1)];
  const el = document.querySelector(step.selector);
  const rect = getRect(el);

  // If element not found, try next step or close if last
  if (!rect) {
      // Safety timeout to prevent infinite loop if no elements found
      setTimeout(() => {
          if (idx < steps.length - 1) setIdx(idx + 1);
          else setOpen(false);
      }, 100);
      return null;
  }

  const total = steps.length;
  const cur = idx + 1;

  const close = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  };

  const next = () => {
    if (idx >= steps.length - 1) return close();
    setIdx((x) => x + 1);
  };

  const overlayClick = () => close();

  // Position bubble logic
  let top = 0;
  let left = 0;
  const bubbleWidth = 360;
  const bubbleHeight = 200; // approx
  const gap = 16;

  const place = step.placement ?? "bottom";

  if (place === "right") {
    top = rect.top + rect.height / 2 - bubbleHeight / 2;
    left = rect.right + gap;
  } else if (place === "left") {
    top = rect.top + rect.height / 2 - bubbleHeight / 2;
    left = rect.left - bubbleWidth - gap;
  } else if (place === "bottom") {
    top = rect.bottom + gap;
    left = rect.left + rect.width / 2 - bubbleWidth / 2;
  } else {
    // top
    top = rect.top - bubbleHeight - gap;
    left = rect.left + rect.width / 2 - bubbleWidth / 2;
  }

  // Viewport clamping
  top = Math.max(10, Math.min(top, window.innerHeight - bubbleHeight - 10));
  left = Math.max(10, Math.min(left, window.innerWidth - bubbleWidth - 10));

  return (
    <div className="fixed inset-0 z-[2500]">
      <div className="absolute inset-0 bg-white/55 backdrop-blur-sm transition-opacity" onClick={overlayClick} />
      
      {/* Highlight Box */}
      <div
        className="absolute rounded-2xl border-2 border-indigo-500 shadow-[0_0_0_4px_rgba(99,102,241,0.2),0_0_0_10000px_rgba(255,255,255,0.4)] transition-all duration-300 ease-in-out pointer-events-none"
        style={{
          top: rect.top - 4,
          left: rect.left - 4,
          width: rect.width + 8,
          height: rect.height + 8,
        }}
      />

      <div 
        className="absolute transition-all duration-300 ease-in-out" 
        style={{ top, left }}
      >
        <HintBubble title={step.title} text={step.text} onNext={next} onSkip={close} step={cur} total={total} />
      </div>
    </div>
  );
}
