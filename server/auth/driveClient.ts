
import { google } from "googleapis";

function getServiceAccountKey(): any {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY missing");

  try {
    const creds = JSON.parse(raw);
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
  
  // Using JWT with 'subject' to impersonate the user 'rodjeryan@gmail.com'.
  // This attempts to perform actions on behalf of the user to use their storage quota.
  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ["https://www.googleapis.com/auth/drive"],
    subject: "rodjeryan@gmail.com" 
  });

  return google.drive({ version: "v3", auth });
}
