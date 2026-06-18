const { loadEnvConfig } = require("@next/env");
const bcrypt = require("bcryptjs");

loadEnvConfig(process.cwd());

const encoded = process.env.ADMIN_USERS_JSON_B64?.trim();
if (!encoded) {
  console.error("ADMIN_USERS_JSON_B64 no definido");
  process.exit(1);
}

const raw = Buffer.from(encoded, "base64").toString("utf8");
const users = JSON.parse(raw);
const user = users[0];

console.log("user:", user.username);
console.log("hash starts with $2b$:", user.passwordHash.startsWith("$2b$"));
console.log("ClaveAdmin1! match:", bcrypt.compareSync("ClaveAdmin1!", user.passwordHash));
