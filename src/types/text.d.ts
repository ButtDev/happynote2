// SPEC_031: esbuild text 로더(.txt → string)
declare module "*.txt" {
  const text: string;
  export default text;
}
