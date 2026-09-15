import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
export function need(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} in .env.local. See .env.example.`);
  return value;
}
