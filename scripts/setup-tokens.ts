import { execFileSync } from "node:child_process";
import { readFile, writeFile, chmod } from "node:fs/promises";
import { need } from "./env";
const projectId = need("NEXT_PUBLIC_SANITY_PROJECT_ID");
let env = await readFile(".env.local", "utf8");
for (const [name, role, label] of [
  ["SANITY_API_READ_TOKEN", "viewer", "HomeMatch catalogue"],
  ["SANITY_API_WRITE_TOKEN", "editor", "HomeMatch seed and reset"],
] as const) {
  if (process.env[name]) {
    console.log(`${name} already configured; kept existing token.`);
    continue;
  }
  let token: string;
  try {
    const output = execFileSync(
      "pnpm",
      [
        "exec",
        "sanity",
        "tokens",
        "add",
        label,
        "--project-id",
        projectId,
        "--role",
        role,
        "--yes",
        "--json",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const result = JSON.parse(output);
    if (typeof result.token !== "string" || !result.token) throw Error();
    token = result.token;
  } catch {
    throw new Error(
      `Could not create ${name}. Check 'pnpm exec sanity debug' and your project permissions. Credential output was suppressed.`,
    );
  }
  const line = `${name}=${token}`;
  const matcher = new RegExp(`^${name}=.*$`, "m");
  env = matcher.test(env)
    ? env.replace(matcher, () => line)
    : env + "\n" + line + "\n";
  await writeFile(".env.local", env, { mode: 0o600 });
  await chmod(".env.local", 0o600);
  console.log(`${name} saved to .env.local; value hidden.`);
}
