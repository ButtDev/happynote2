// SPEC_017: 화면 검사 esbuild binary 로더(.png → Uint8Array)
declare module "*.png" {
  const data: Uint8Array;
  export default data;
}
