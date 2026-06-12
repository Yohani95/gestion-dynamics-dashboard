const tenant = process.env.DYNAMICS_BC_TENANT_ID || "b48fe5ca-2483-4e40-a498-edae4f428e9f";
const env = process.env.DYNAMICS_BC_ENVIRONMENT || "Production";
const companyId = process.argv[2] || "0E043E80-991D-ED11-90ED-002248DE960C";
const base = `https://api.businesscentral.dynamics.com/v2.0/${tenant}/${env}/api/v2.0`;

const body = new URLSearchParams({
  grant_type: "client_credentials",
  client_id: process.env.DYNAMICS_CLIENT_ID,
  client_secret: process.env.DYNAMICS_CLIENT_SECRET,
  scope: process.env.DYNAMICS_SCOPE,
});

const tokenRes = await fetch(process.env.DYNAMICS_TOKEN_URL, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: body.toString(),
});
const tokenJson = await tokenRes.json();
console.log("Token:", tokenRes.status);
if (!tokenJson.access_token) {
  console.log(tokenJson);
  process.exit(1);
}

const url = `${base}/companies(${companyId})/salesInvoices?$filter=status eq 'Draft'&$top=2&$select=number,status,externalDocumentNumber`;
const res = await fetch(url, {
  headers: {
    Authorization: `Bearer ${tokenJson.access_token}`,
    Accept: "application/json",
  },
});
const json = await res.json();
console.log("salesInvoices:", res.status);
console.log(JSON.stringify(json.value?.slice(0, 2) ?? json, null, 2));
