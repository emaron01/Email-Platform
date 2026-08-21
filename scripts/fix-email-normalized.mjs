import fs from "fs";

const path = "src/lib/usage/usage-policy.test.ts";
let s = fs.readFileSync(path, "utf8");
s = s.replace(
  /data: \{\n(\s*)email: ([^\n]+)\n(\s*)name: ([^\n]+)\n(\s*)\}/g,
  "data: {\n$1email: $2\n$1emailNormalized: $2\n$3name: $4\n$5}",
);
s = s.replace(
  /data: \{ email: ([^,]+), name: ([^}]+) \}/g,
  "data: { email: $1, emailNormalized: $1, name: $2 }",
);
fs.writeFileSync(path, s);
console.log("patched");
