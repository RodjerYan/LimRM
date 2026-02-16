
import { getDrive } from "./driveClient";
import { Buffer } from "buffer";

const ROOT_FOLDER_ID = process.env.AUTH_ROOT_FOLDER_ID || "";
if (!ROOT_FOLDER_ID) console.warn("[AUTH] AUTH_ROOT_FOLDER_ID is not set. Auth will fail.");

export type Role = "admin" | "user";
export type Status = "pending" | "active";

export type UserProfile = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: Role;
  status: Status;
  createdAt: string;
};

export type UserSecrets = {
  passwordHash: string;
  passwordSalt: string;
  verifyCodeHash?: string;
  verifyCodeSalt?: string;
  verifyCodeExpiresAt?: string;
};

function safeName(s: string) {
  return s.replace(/[^a-zA-Z0-9@._-]/g, "_");
}

async function findChildFolderIdByName(parentId: string, name: string) {
  const drive = getDrive();
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id,name)",
  });
  return res.data.files?.[0]?.id || null;
}

async function ensureFolder(parentId: string, name: string) {
  const existing = await findChildFolderIdByName(parentId, name);
  if (existing) return existing;

  const drive = getDrive();
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
  });

  if (!created.data.id) throw new Error("DRIVE_FOLDER_CREATE_FAILED");
  return created.data.id;
}

async function findFileIdByName(parentId: string, name: string) {
  const drive = getDrive();
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name='${name}' and trashed=false`,
    fields: "files(id,name)",
  });
  return res.data.files?.[0]?.id || null;
}

async function writeJsonFile(parentId: string, name: string, data: any) {
  const drive = getDrive();
  const existingId = await findFileIdByName(parentId, name);
  const body = JSON.stringify(data, null, 2);

  if (existingId) {
    await drive.files.update({
      fileId: existingId,
      media: { mimeType: "application/json", body },
    });
    return existingId;
  }

  const created = await drive.files.create({
    requestBody: { name, parents: [parentId] },
    media: { mimeType: "application/json", body },
    fields: "id",
  });

  if (!created.data.id) throw new Error("DRIVE_FILE_CREATE_FAILED");
  return created.data.id;
}

async function readJsonFile(parentId: string, name: string) {
  const drive = getDrive();
  const fileId = await findFileIdByName(parentId, name);
  if (!fileId) return null;

  try {
      const res = await drive.files.get(
        { fileId, alt: "media" },
        { responseType: "json" as any }
      );
      return res.data; 
  } catch(e) {
      console.warn(`Failed to read file ${name} in ${parentId}`, e);
      return null;
  }
}

export async function ensureAuthRoots() {
  const usersId = await ensureFolder(ROOT_FOLDER_ID, "users");
  const pendingId = await ensureFolder(ROOT_FOLDER_ID, "pending");
  return { usersId, pendingId };
}

export async function createPendingUser(profile: UserProfile, secrets: UserSecrets) {
  const { pendingId } = await ensureAuthRoots();
  const emailFolder = await ensureFolder(pendingId, safeName(profile.email));

  await writeJsonFile(emailFolder, "profile.json", profile);
  await writeJsonFile(emailFolder, "secrets.json", secrets);
}

export async function getPendingUser(email: string) {
  const { pendingId } = await ensureAuthRoots();
  const folderId = await findChildFolderIdByName(pendingId, safeName(email));
  if (!folderId) return null;

  const profile = await readJsonFile(folderId, "profile.json");
  const secrets = await readJsonFile(folderId, "secrets.json");
  if (!profile || !secrets) return null;
  return { folderId, profile: profile as UserProfile, secrets: secrets as UserSecrets };
}

export async function getActiveUser(email: string) {
  const { usersId } = await ensureAuthRoots();
  const folderId = await findChildFolderIdByName(usersId, safeName(email));
  if (!folderId) return null;

  const profile = await readJsonFile(folderId, "profile.json");
  const secrets = await readJsonFile(folderId, "secrets.json");
  if (!profile || !secrets) return null;
  return { folderId, profile: profile as UserProfile, secrets: secrets as UserSecrets };
}

export async function activateUser(email: string) {
  const drive = getDrive();
  const { pendingId, usersId } = await ensureAuthRoots();

  const pendingFolderId = await findChildFolderIdByName(pendingId, safeName(email));
  if (!pendingFolderId) throw new Error("PENDING_NOT_FOUND");

  // move folder pending/<email> -> users/<email>
  await drive.files.update({
    fileId: pendingFolderId,
    addParents: usersId,
    removeParents: pendingId,
    fields: "id, parents",
  });

  // update status in profile.json
  const profile = (await readJsonFile(pendingFolderId, "profile.json")) as UserProfile | null;
  if (profile) {
    profile.status = "active";
    await writeJsonFile(pendingFolderId, "profile.json", profile);
  }
}

export async function setRole(email: string, role: Role) {
  const u = await getActiveUser(email);
  if (!u) throw new Error("USER_NOT_FOUND");

  u.profile.role = role;
  await writeJsonFile(u.folderId, "profile.json", u.profile);
}

export async function listUsers() {
  const drive = getDrive();
  const { usersId } = await ensureAuthRoots();

  const res = await drive.files.list({
    q: `'${usersId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id,name)",
    pageSize: 1000,
  });

  const folders = res.data.files || [];
  const out: UserProfile[] = [];

  // Parallel fetch for speed
  const promises = folders.map(async (f) => {
    if (!f.id) return;
    const p = await readJsonFile(f.id, "profile.json");
    if (p) out.push(p as UserProfile);
  });
  
  await Promise.all(promises);

  out.sort((a, b) => a.lastName.localeCompare(b.lastName, "ru"));
  return out;
}
