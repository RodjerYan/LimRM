
import { google } from "googleapis";

function getServiceAccountKey(): any {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY missing");

  try {
    // Ensure we handle potential leading/trailing whitespace
    const creds = JSON.parse(raw.trim());
    if (creds.private_key) {
        creds.private_key = creds.private_key.replace(/\\n/g, '\n');
    }
    return creds;
  } catch (e) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY invalid JSON");
  }
}

export function getDrive() {
  const key = getServiceAccountKey();
  
  // Reverted: 'subject' is removed because personal @gmail.com accounts 
  // do not support Domain-Wide Delegation.
  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: [
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/spreadsheets"
    ]
  });

  return google.drive({ version: "v3", auth });
}
