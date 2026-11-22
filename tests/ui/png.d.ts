// SPEC_017: 화면 검사 esbuild binary 로더(.png → Uint8Array)
declare module "*.png" {
  const data: Uint8Array;
  export default data;
}
// SPEC_036: 실제 유튜브 itag 140 조각(.m4a → Uint8Array)
declare module "*.m4a" {
  const data: Uint8Array;
  export default data;
}
