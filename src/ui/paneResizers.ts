import { clampLandscapeLeftPercent, landscapeLeftPercentFromPointer, LANDSCAPE_LEFT_DEFAULT } from "../utils/landscapeSplit";
import type { EarCoachSettings } from "../types/settings";

/** 크기 조절 막대가 읽고 저장하는 설정(플러그인). EarCoachView에서 옮김 */
export interface ResizerHost {
  settings: EarCoachSettings;
  saveSettings(): Promise<void>;
}

/**
 * 모바일 영상·목록 사이 막대. 세로: 목록 높이(%), 가로(SPEC_011): 영상 열 폭(--ear-coach-landscape-left).
 * 두 번 누르면 기본값으로. 놓을 때 설정에 저장.
 */
export function setupMobileTouchResizer(
  host: ResizerHost,
  resizerEl: HTMLElement,
  listWrapper: HTMLElement,
  mobileContainer: HTMLElement
): void {
  const clampPercent = (pct: number): number =>
    Math.max(25, Math.min(72, Math.round(pct)));

  let currentPercent = clampPercent(
    host.settings.mobileListHeightPercent ?? 50
  );

  const applyListHeight = (pct: number) => {
    const clamped = clampPercent(pct);
    currentPercent = clamped;
    listWrapper.style.flex = `0 0 ${clamped}%`;
    listWrapper.style.height = `${clamped}%`;
  };

  applyListHeight(currentPercent);

  // SPEC_011: 가로에서는 같은 막대가 영상 열 폭(좌우)을 조절한다(CSS 변수 --ear-coach-landscape-left).
  const isLandscape = () => window.matchMedia("(orientation: landscape)").matches;
  let currentLeft = clampLandscapeLeftPercent(
    host.settings.mobileLandscapeLeftPercent ?? LANDSCAPE_LEFT_DEFAULT
  );
  const applyLeft = (pct: number) => {
    currentLeft = clampLandscapeLeftPercent(pct);
    mobileContainer.style.setProperty("--ear-coach-landscape-left", String(currentLeft));
  };
  applyLeft(currentLeft);
  let dragLandscape = false;
  let containerLeft = 0;
  let containerW = 0;
  let latestClientX = 0;

  let isDragging = false;
  let startY = 0;
  let startListH = 0;
  let containerH = 0;
  let pendingRaf: number | null = null;
  let latestClientY = 0;

  const commitResize = async () => {
    if (!isDragging) return;
    isDragging = false;
    resizerEl.removeClass("is-dragging");
    if (pendingRaf !== null) {
      window.cancelAnimationFrame(pendingRaf);
      pendingRaf = null;
    }
    if (dragLandscape) host.settings.mobileLandscapeLeftPercent = currentLeft;
    else host.settings.mobileListHeightPercent = currentPercent;
    await host.saveSettings();
  };

  const scheduleUpdate = (clientY: number, clientX: number) => {
    latestClientY = clientY;
    latestClientX = clientX;
    if (pendingRaf !== null) return;
    pendingRaf = window.requestAnimationFrame(() => {
      pendingRaf = null;
      if (dragLandscape) {
        applyLeft(landscapeLeftPercentFromPointer(latestClientX, containerLeft, containerW));
        return;
      }
      const deltaY = startY - latestClientY;
      const nextListH = startListH + deltaY;
      const rawPct = (nextListH / Math.max(200, containerH)) * 100;
      applyListHeight(rawPct);
    });
  };

  resizerEl.addEventListener("pointerdown", (ev: PointerEvent) => {
    ev.preventDefault();
    isDragging = true;
    dragLandscape = isLandscape();
    const cRect = mobileContainer.getBoundingClientRect();
    containerLeft = cRect.left;
    containerW = cRect.width || window.innerWidth;
    startY = ev.clientY;
    startListH = listWrapper.getBoundingClientRect().height;
    containerH =
      mobileContainer.getBoundingClientRect().height || window.innerHeight;
    resizerEl.addClass("is-dragging");
    try {
      resizerEl.setPointerCapture(ev.pointerId);
    } catch {
      // Ignore if pointer capture is unsupported
    }
  });

  resizerEl.addEventListener("pointermove", (ev: PointerEvent) => {
    if (!isDragging) return;
    ev.preventDefault();
    scheduleUpdate(ev.clientY, ev.clientX);
  });

  resizerEl.addEventListener("pointerup", () => {
    void commitResize();
  });
  resizerEl.addEventListener("pointercancel", () => {
    void commitResize();
  });

  // Double-tap / double-click resets cleanly to 50% (가로는 58%)
  resizerEl.addEventListener("dblclick", async () => {
    if (isLandscape()) {
      applyLeft(LANDSCAPE_LEFT_DEFAULT);
      host.settings.mobileLandscapeLeftPercent = LANDSCAPE_LEFT_DEFAULT;
    } else {
      applyListHeight(50);
      host.settings.mobileListHeightPercent = 50;
    }
    await host.saveSettings();
  });
}

/** 데스크톱 Sound Doctor 패널 높이 막대(마우스). 놓을 때 tutorPanelHeightPx 저장 */
export function setupTutorResizer(
  host: ResizerHost,
  resizerEl: HTMLElement,
  tutorContainerEl: HTMLElement,
  leftColumn: HTMLElement
): void {
  const savedHeight = host.settings.tutorPanelHeightPx || 420;
  tutorContainerEl.style.height = `${savedHeight}px`;
  tutorContainerEl.style.flex = `0 0 ${savedHeight}px`;
  tutorContainerEl.style.maxHeight = "none";

  let startY = 0;
  let startHeight = 0;

  const onMouseMove = (ev: MouseEvent) => {
    ev.preventDefault();
    const deltaY = startY - ev.clientY;
    const leftColH = leftColumn.getBoundingClientRect().height || window.innerHeight;
    const minH = 140;
    const maxH = Math.max(minH, leftColH - 70);
    const newH = Math.max(minH, Math.min(maxH, startHeight + deltaY));
    tutorContainerEl.style.height = `${newH}px`;
    tutorContainerEl.style.flex = `0 0 ${newH}px`;
    tutorContainerEl.style.maxHeight = "none";
  };

  const onMouseUp = async () => {
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    resizerEl.removeClass("is-dragging");

    const finalH = parseInt(tutorContainerEl.style.height, 10);
    if (Number.isFinite(finalH) && finalH >= 140) {
      host.settings.tutorPanelHeightPx = finalH;
      await host.saveSettings();
    }
  };

  resizerEl.addEventListener("mousedown", (ev: MouseEvent) => {
    ev.preventDefault();
    startY = ev.clientY;
    startHeight = tutorContainerEl.getBoundingClientRect().height || savedHeight;
    resizerEl.addClass("is-dragging");
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  });
}
