
import { getDrive } from "./driveClient";
import { Buffer } from "buffer";

// ID корневой папки (Shared Folder)
const USER_PROVIDED_ROOT_ID = "1gP6ybuKUPm1hu4IrosqtJwPfRROqo5bl";
// Имя единого файла базы данных, который должен создать владелец диска
const DB_FILENAME = "limrm_db.json";

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

// Combined type for storage
type StoredUser = UserProfile & UserSecrets;

type DatabaseSchema = {
    users: StoredUser[];
    pending: StoredUser[];
};

// In-memory cache to reduce reads (optional, but good for speed)
let _dbFileId: string | null = null;

async function getDbFileId() {
    if (_dbFileId) return _dbFileId;

    const drive = getDrive();
    try {
        console.log(`[AUTH-DB] Searching for ${DB_FILENAME} in ${USER_PROVIDED_ROOT_ID}...`);
        const list = await drive.files.list({
            q: `'${USER_PROVIDED_ROOT_ID}' in parents and name = '${DB_FILENAME}' and trashed = false`,
            fields: "files(id)",
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
        });

        if (list.data.files && list.data.files.length > 0) {
            _dbFileId = list.data.files[0].id!;
            console.log(`[AUTH-DB] Found DB file ID: ${_dbFileId}`);
            return _dbFileId;
        }
    } catch (e) {
        console.error("[AUTH-DB] Error finding DB file:", e);
    }
    
    throw new Error(
        `CRITICAL: Database file '${DB_FILENAME}' not found in folder '${USER_PROVIDED_ROOT_ID}'.`
    );
}

async function readDb(): Promise<DatabaseSchema> {
    const fileId = await getDbFileId();
    const drive = getDrive();
    
    try {
        console.log(`[AUTH-DB] Reading DB content...`);
        const res = await drive.files.get({
            fileId: fileId,
            alt: 'media',
            supportsAllDrives: true
        }, { responseType: 'json' }); 
        
        const data = res.data as any;
        console.log(`[AUTH-DB] DB Read success. Users: ${data?.users?.length || 0}, Pending: ${data?.pending?.length || 0}`);
        
        // Ensure structure
        if (!data || typeof data !== 'object') return { users: [], pending: [] };
        if (!Array.isArray(data.users)) data.users = [];
        if (!Array.isArray(data.pending)) data.pending = [];
        
        return data as DatabaseSchema;
    } catch (e) {
        console.error("[AUTH-DB] Failed to read DB:", e);
        return { users: [], pending: [] };
    }
}

async function saveDb(data: DatabaseSchema): Promise<void> {
    const fileId = await getDbFileId();
    const drive = getDrive();

    const body = JSON.stringify(data, null, 2);

    try {
        console.log(`[AUTH-DB] Saving DB content (${Buffer.byteLength(body, "utf8")} bytes)...`);

        // Using standard googleapis signature: params object containing media
        await drive.files.update({
            fileId: fileId,
            supportsAllDrives: true,
            media: {
                mimeType: "application/json",
                body: body
            }
        });

        console.log(`[AUTH-DB] Save success.`);
    } catch (e) {
        console.error("[AUTH-DB] Failed to save DB:", e);
        throw new Error("DB_SAVE_FAILED");
    }
}

export async function createPendingUser(profile: UserProfile, secrets: UserSecrets) {
    const db = await readDb();
    
    // Remove any existing pending request for this email
    db.pending = db.pending.filter(u => u.email.toLowerCase() !== profile.email.toLowerCase());
    
    const newUser: StoredUser = { ...profile, ...secrets };
    db.pending.push(newUser);
    
    await saveDb(db);
}

export async function getPendingUser(email: string) {
    const db = await readDb();
    const user = db.pending.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (!user) return null;
    
    // Split back into profile and secrets
    const { passwordHash, passwordSalt, verifyCodeHash, verifyCodeSalt, verifyCodeExpiresAt, ...profile } = user;
    const secrets = { passwordHash, passwordSalt, verifyCodeHash, verifyCodeSalt, verifyCodeExpiresAt };
    
    return { profile, secrets };
}

export async function getActiveUser(email: string) {
    const db = await readDb();
    const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (!user) return null;
    
    const { passwordHash, passwordSalt, verifyCodeHash, verifyCodeSalt, verifyCodeExpiresAt, ...profile } = user;
    const secrets = { passwordHash, passwordSalt, verifyCodeHash, verifyCodeSalt, verifyCodeExpiresAt };
    
    return { profile, secrets };
}

export async function activateUser(email: string) {
    const db = await readDb();
    const pendingIdx = db.pending.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (pendingIdx === -1) throw new Error("PENDING_NOT_FOUND");
    
    const userToActivate = db.pending[pendingIdx];
    userToActivate.status = 'active';
    
    // Check if already in users (duplicate safety)
    const existingIdx = db.users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
    if (existingIdx !== -1) {
        db.users[existingIdx] = userToActivate; // Update existing
    } else {
        db.users.push(userToActivate);
    }
    
    // Remove from pending
    db.pending.splice(pendingIdx, 1);
    
    await saveDb(db);
}

export async function setRole(email: string, role: Role) {
    const db = await readDb();
    const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (!user) throw new Error("USER_NOT_FOUND");
    
    user.role = role;
    await saveDb(db);
}

export async function listUsers() {
    const db = await readDb();
    // Return only profile part
    return db.users.map(u => {
        const { passwordHash, passwordSalt, verifyCodeHash, verifyCodeSalt, verifyCodeExpiresAt, ...profile } = u;
        return profile;
    }).sort((a, b) => a.lastName.localeCompare(b.lastName, "ru"));
}

// Stub for compat
export async function ensureAuthRoots() { return { usersId: "", pendingId: "" }; }
