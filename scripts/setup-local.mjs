import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
if (!existsSync(".dev.vars")) {
  const value = () => randomBytes(48).toString("base64url");
  writeFileSync(".dev.vars", `BETTER_AUTH_SECRET=${value()}\nENCRYPTION_KEY=${value()}\n`, {
    mode: 0o600,
    flag: "wx",
  });
  console.log("Created .dev.vars with separate local secrets. Values are not printed.");
} else {
  console.log("Keeping existing .dev.vars.");
}
