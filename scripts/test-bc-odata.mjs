const tokenUrl = process.env.DYNAMICS_TOKEN_URL;
const clientId = process.env.DYNAMICS_CLIENT_ID;
const clientSecret = process.env.DYNAMICS_CLIENT_SECRET;
const scope = process.env.DYNAMICS_SCOPE;
const baseUrl = process.env.DYNAMICS_ODATA_BASE_URL?.replace(/\/$/, "");
const entities = [
  "Sales_Invoice_Excel",
  "salesDocuments",
  "Posted_Sales_Credit_Memo_Excel",
  "Sales_Credit_Memo_Excel",
  "purchaseOrderHeader",
].filter(Boolean);

const body = new URLSearchParams({
  grant_type: "client_credentials",
  client_id: clientId,
  client_secret: clientSecret,
  scope,
});

const tokenRes = await fetch(tokenUrl, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: body.toString(),
});
const tokenJson = await tokenRes.json();
console.log("Token:", tokenRes.status, tokenJson.error ? tokenJson.error_description : "OK");

if (!tokenJson.access_token) process.exit(1);

const metaUrl = `${baseUrl.replace(/\/Company\(.+$/, "")}/$metadata`;
const metaRes = await fetch(metaUrl, {
  headers: {
    Authorization: `Bearer ${tokenJson.access_token}`,
    Accept: "application/xml",
  },
});
const metaXml = await metaRes.text();
const invoiceHits = [...metaXml.matchAll(/EntityType Name="([^"]*(?:invoice|Invoice|sales|Sales|memo|Memo)[^"]*)"/g)]
  .map((m) => m[1])
  .slice(0, 40);
console.log("\nMetadata:", metaRes.status, "entidades relacionadas:", invoiceHits.join(", ") || "(ninguna)");

for (const entity of [...new Set(entities)]) {
  const testUrl = `${baseUrl}/${entity}?$top=1`;
  const odataRes = await fetch(testUrl, {
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
    },
  });
  const raw = await odataRes.text();
  console.log(`\n[${odataRes.status}] ${entity}`);
  if (odataRes.ok) {
    try {
      const json = JSON.parse(raw);
      const row = json.value?.[0] ?? {};
      console.log("campos:", Object.keys(row).slice(0, 12).join(", "));
      console.log("No/sample:", row.No ?? row.Document_No ?? row.number ?? row.id);
    } catch {
      console.log(raw.slice(0, 220));
    }
  } else {
    console.log(raw.slice(0, 220));
  }
}
