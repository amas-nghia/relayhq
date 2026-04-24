declare module "bun:test" {
  export const describe: (label: string, fn: () => void | Promise<void>) => void;
  export const test: (label: string, fn: () => void | Promise<void>) => void;
  export const expect: any;
  export const afterEach: (fn: () => void | Promise<void>) => void;
}
