import "vitest";

declare module "vitest" {
  interface ProvidedContext {
    testDbUrl: string;
  }
}