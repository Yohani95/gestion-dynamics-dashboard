const bcrypt = require("bcryptjs");

const password = "ClaveAdmin1!";
const hash = bcrypt.hashSync(password, 12);

const users = ["Yohani95", "marcia2026", "raul2026"].map((username) => ({
  username,
  passwordHash: hash,
  role: "ADMIN",
}));

const json = JSON.stringify(users);
const b64 = Buffer.from(json, "utf8").toString("base64");

console.log("hash:", hash);
console.log("ADMIN_USERS_JSON_B64=" + b64);
console.log("verify:", bcrypt.compareSync(password, users[0].passwordHash));
