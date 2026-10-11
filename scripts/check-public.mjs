// Inspect the exact Git index that will be committed, including newly staged files.
// Complement with a full-history tool such as Gitleaks before initial publication.
import { execFileSync } from "node:child_process";
const files = execFileSync("git", ["ls-files", "--cached", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const allowed = new Set([".dev.vars.example", ".env.example"]);
const privatePath =
  /(^|\/)(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?|\.wrangler|node_modules|dist)(?:\/|$)|\.local(?:\.[^/]*)?$|\.(?:sqlite|db)(?:-shm|-wal)?$|(?:^|\/)env\.d\.ts$/;
const rules = [
  ["Stripe API key", /(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{24,}/],
  ["Stripe webhook secret", /whsec_[A-Za-z0-9]{24,}/],
  ["Google OAuth secret", /GOCSPX-[A-Za-z0-9_-]{20,}/],
  ["GitHub token", /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/],
  ["Private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  [
    "Wechatai credential",
    /(?:notify1|(?:hermes|openclaw)-pair1)\.[a-f0-9]{64}\.[A-Za-z0-9_.-]{65,}/,
  ],
  ["Local absolute path", /(?:\/Users\/|[A-Z]:\\Users\\)[^\s"']+/],
];
const issues = [];
for (const file of files) {
  if (privatePath.test(file) && !allowed.has(file)) issues.push(`${file}: private/generated file`);
  const content = execFileSync("git", ["show", `:${file}`], { maxBuffer: 32 * 1024 * 1024 });
  if (content.includes(0)) continue;
  const text = content.toString("utf8");
  for (const [label, pattern] of rules) {
    // The checker describes local-path syntax itself, without actual user paths.
    if (pattern.test(text)) issues.push(`${file}: ${label}`);
  }
}
if (issues.length) {
  console.error(issues.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Public-source check passed for ${files.length} indexed files (no secret values printed).`,
  );
