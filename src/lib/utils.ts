export function getEnvironment() {
  const env = process.env.NODE_ENV;
  if (env === "development") return "development";
  if (env === "production") return "production";
  if (env === "test") return "test";
  return "unknown";
}

export const isDev = () => getEnvironment() === "development";

export const isProd = () => getEnvironment() === "production";

export const isTest = () => getEnvironment() === "test";

export function isServer(): boolean {
  return typeof window === "undefined";
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
