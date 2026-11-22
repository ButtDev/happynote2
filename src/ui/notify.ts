/**
 * SPEC_042: 다시 해 볼 수 있는 실패 알림 — 글 + 「다시」 버튼, 10초.
 * 누르면 알림을 닫고 같은 동작을 다시 한다.
 */
import { Notice } from "obsidian";
import { RETRY_LABEL, RETRY_NOTICE_MS } from "../services/notices";

export function notifyRetry(text: string, retry: () => unknown): Notice {
  const frag = document.createDocumentFragment();
  const msg = document.createElement("span");
  msg.className = "ear-coach-notice-text";
  msg.textContent = text;
  frag.appendChild(msg);
  const btn = document.createElement("button");
  btn.className = "ear-coach-notice-retry";
  btn.textContent = RETRY_LABEL;
  frag.appendChild(btn);
  const notice = new Notice(frag, RETRY_NOTICE_MS);
  let done = false;
  btn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (done) return;
    done = true;
    notice.hide();
    void Promise.resolve().then(retry);
  });
  return notice;
}
