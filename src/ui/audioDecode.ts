/**
 * SPEC_036: 웹뷰 OfflineAudioContext로 m4a 조각을 풀어 [from, to]초를 잘라 모노 rate Hz로 다시 뜬다.
 * 1채널 컨텍스트라 스테레오는 자동으로 섞인다.
 */
export async function decodeAudioClip(bytes: ArrayBuffer, from: number, to: number, rate: number): Promise<Float32Array> {
  const Ctx: typeof OfflineAudioContext = (window as any).OfflineAudioContext ?? (window as any).webkitOfflineAudioContext;
  const probe = new Ctx(1, 1, rate);
  const buf = await probe.decodeAudioData(bytes.slice(0));
  const a = Math.max(0, Math.min(from, buf.duration));
  const b = Math.max(a, Math.min(to, buf.duration));
  const len = Math.max(1, Math.round((b - a) * rate));
  const ctx = new Ctx(1, len, rate);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start(0, a, b - a);
  const out = await ctx.startRendering();
  return out.getChannelData(0);
}
