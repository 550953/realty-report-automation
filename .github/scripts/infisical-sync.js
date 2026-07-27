// .github/scripts/infisical-sync.js
//
// Делает то же самое, что infisical_client.py: логинится в Infisical,
// тянет /api/v3/secrets/raw и достаёт нужные ключи.
// Пишет результат в $GITHUB_OUTPUT (а не в GITHUB_ENV — там надёжнее с
// многострочными/специальными значениями) и маскирует значения в логах.

const fs = require("fs");

const CLIENT_ID = process.env.INFISICAL_CLIENT_ID;
const CLIENT_SECRET = process.env.INFISICAL_CLIENT_SECRET;
const PROJECT_ID = process.env.PROJECT_ID;
const ENVIRONMENT = process.env.ENVIRONMENT;
const GITHUB_OUTPUT = process.env.GITHUB_OUTPUT;

const WANTED = {
  render_token: "RENDER_CLI_TOKEN_rinacohnbb9h4_realty",
  supabase_cp: "SUPABASE_CP_rinacohnbb9h4_realty",
};

function mask(value) {
  console.log(`::add-mask::${value}`);
}

function setOutput(name, value) {
  fs.appendFileSync(GITHUB_OUTPUT, `${name}=${value}\n`);
}

async function main() {
  console.log("🔐 Получаем токен доступа...");
  const authRes = await fetch(
    "https://app.infisical.com/api/v1/auth/universal-auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET }),
    }
  );

  const authBodyText = await authRes.text();
  if (!authRes.ok) {
    console.error(`❌ Auth failed: HTTP ${authRes.status}`);
    console.error(`Ответ Infisical: ${authBodyText}`);
    process.exit(1);
  }

  let accessToken;
  try {
    accessToken = JSON.parse(authBodyText).accessToken;
  } catch (e) {
    console.error("❌ Не удалось распарсить ответ авторизации:", e.message);
    process.exit(1);
  }
  if (!accessToken) {
    console.error("❌ В ответе авторизации нет accessToken");
    process.exit(1);
  }
  console.log("✅ Токен получен, запрашиваем секреты...");

  const params = new URLSearchParams({
    workspaceId: PROJECT_ID,
    environment: ENVIRONMENT,
    include_imports: "true",
    secretPath: "/",
  });

  const secretsRes = await fetch(
    `https://app.infisical.com/api/v3/secrets/raw?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const secretsBodyText = await secretsRes.text();
  if (!secretsRes.ok) {
    console.error(`❌ Secrets fetch failed: HTTP ${secretsRes.status}`);
    console.error(`Ответ Infisical: ${secretsBodyText}`);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(secretsBodyText);
  } catch (e) {
    console.error("❌ Не удалось распарсить ответ секретов:", e.message);
    process.exit(1);
  }

  if (!data.secrets || !Array.isArray(data.secrets)) {
    console.error("❌ В ответе нет массива secrets. Ключи верхнего уровня:", Object.keys(data));
    process.exit(1);
  }

  console.log("✅ Найдено секретов:", data.secrets.length);
  console.log("📋 Ключи секретов в Infisical:");
  data.secrets.forEach((s) => console.log("  -", s.secretKey));

  for (const [outputName, secretKey] of Object.entries(WANTED)) {
    const found = data.secrets.find((s) => s.secretKey === secretKey);
    if (found && found.secretValue) {
      mask(found.secretValue);
      setOutput(outputName, found.secretValue);
      setOutput(`${outputName}_updated`, "true");
      console.log(`✅ ${secretKey} найден (замаскирован)`);
    } else {
      setOutput(`${outputName}_updated`, "false");
      console.log(`⚠️ ${secretKey} не найден в Infisical`);
    }
  }
}

main().catch((e) => {
  console.error("❌ Необработанная ошибка:", e.stack || e.message);
  process.exit(1);
});
