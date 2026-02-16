
import { getDrive } from "./driveClient";
import { Buffer } from "buffer";

// ID корневой папки, к которой вы дали доступ сервисному аккаунту
// Если это папка "users", то подпапки будут создаваться внутри нее.
const USER_PROVIDED_ROOT_ID = "1gP6ybuKUPm1hu4IrosqtJwPfRROqo5bl";

// Cache the resolved ID to reduce API calls
let _resolvedRootId: string | null = null;

async function getRootFolderId() {
  if (_resolvedRootId) return _resolvedRootId;
  
  // 1. Try Env Var (highest priority override)
  if (process.env.AUTH_ROOT_FOLDER_ID) {
    _resolvedRootId = process.env.AUTH_ROOT_FOLDER_ID;
    return _resolvedRootId;
  }

  // 2. Use User Provided ID (hardcoded)
  if (USER_PROVIDED_ROOT_ID) {
     console.log(`[AUTH] Using hardcoded root folder: ${USER_PROVIDED_ROOT_ID}`);
     _resolvedRootId = USER_PROVIDED_ROOT_ID;
     return _resolvedRootId;
  }

  // 3. Fallback: Find or Create "LimRM_Auth_DB" in Drive Root
  // Note: This often fails for Service Accounts without quota unless they share a folder.
  console.log("[AUTH] AUTH_ROOT_FOLDER_ID not set. Attempting to auto-discover/create...");
  const drive = getDrive();
  const folderName = "LimRM_Auth_DB";
  
  try {
    const list = await drive.files.list({
      q: `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });
    
    if (list.data.files && list.data.files.length > 0) {
      _resolvedRootId = list.data.files[0].id!;
      console.log("[AUTH] Found existing root folder:", _resolvedRootId);
      return _resolvedRootId;
    }

    console.log("[AUTH] Creating new root folder...");
    const created = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder"
      },
      fields: "id",
      supportsAllDrives: true
    });
    
    if (!created.data.id) throw new Error("Failed to auto-create auth root folder");
    _resolvedRootId = created.data.id;
    console.log("[AUTH] Created root folder:", _resolvedRootId);
    return _resolvedRootId;

  } catch (e) {
    console.error("[AUTH] Root folder resolution failed:", e);
    throw new Error("AUTH_ROOT_RESOLUTION_FAILED");
  }
}

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
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
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
    supportsAllDrives: true
  });

  if (!created.data.id) throw new Error("DRIVE_FOLDER_CREATE_FAILED");
  return created.data.id;
}

async function findFileIdByName(parentId: string, name: string) {
  const drive = getDrive();
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name='${name}' and trashed=false`,
    fields: "files(id,name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
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
      supportsAllDrives: true
    });
    return existingId;
  }

  const created = await drive.files.create({
    requestBody: { name, parents: [parentId] },
    media: { mimeType: "application/json", body },
    fields: "id",
    supportsAllDrives: true
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
        { responseType: "json" as any },
        // @ts-ignore - supportsAllDrives is valid but types might complain
        // Important: This flag is needed for Shared Drives / Shared Folders
        { supportsAllDrives: true } 
      );
      return res.data; 
  } catch(e) {
      console.warn(`Failed to read file ${name} in ${parentId}`, e);
      return null;
  }
}

export async function ensureAuthRoots() {
  const rootId = await getRootFolderId();
  // Ensure "users" and "pending" folders exist inside the shared root
  const usersId = await ensureFolder(rootId, "users_db"); 
  const pendingId = await ensureFolder(rootId, "pending_db");
  return { usersId, pendingId };
}

export async function createPendingUser(profile: UserProfile, secrets: UserSecrets) {
  console.log(`[AUTH] Creating pending user: ${profile.email}`);
  const { pendingId } = await ensureAuthRoots();
  const emailFolder = await ensureFolder(pendingId, safeName(profile.email));

  await writeJsonFile(emailFolder, "profile.json", profile);
  await writeJsonFile(emailFolder, "secrets.json", secrets);
  console.log(`[AUTH] Pending user created in folder: ${emailFolder}`);
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
    supportsAllDrives: true
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
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
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
