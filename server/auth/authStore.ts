
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
        const list = await drive.files.list({
            q: `'${USER_PROVIDED_ROOT_ID}' in parents and name = '${DB_FILENAME}' and trashed = false`,
            fields: "files(id)",
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
        });

        if (list.data.files && list.data.files.length > 0) {
            _dbFileId = list.data.files[0].id!;
            return _dbFileId;
        }
    } catch (e) {
        console.error("[AUTH] Error finding DB file:", e);
    }
    
    // If we reach here, the file doesn't exist.
    // We cannot create it (Quota Error). We must throw a clear error for the user.
    throw new Error(
        `CRITICAL: Database file '${DB_FILENAME}' not found in folder '${USER_PROVIDED_ROOT_ID}'. ` +
        `Please create a file named '${DB_FILENAME}' manually in that Google Drive folder with content: {"users": [], "pending": []}`
    );
}

async function readDb(): Promise<DatabaseSchema> {
    const fileId = await getDbFileId();
    const drive = getDrive();
    
    try {
        const res = await drive.files.get({
            fileId: fileId,
            alt: 'media',
            supportsAllDrives: true
        }, { responseType: 'json' }); // Important: axios adapter handles json parsing
        
        const data = res.data as any;
        
        // Ensure structure
        if (!data || typeof data !== 'object') return { users: [], pending: [] };
        if (!Array.isArray(data.users)) data.users = [];
        if (!Array.isArray(data.pending)) data.pending = [];
        
        return data as DatabaseSchema;
    } catch (e) {
        console.error("[AUTH] Failed to read DB:", e);
        // If read fails (e.g. empty file), return default structure to attempt overwrite fix
        return { users: [], pending: [] };
    }
}

async function saveDb(data: DatabaseSchema): Promise<void> {
    const fileId = await getDbFileId();
    const drive = getDrive();

    try {
        await drive.files.update({
            fileId: fileId,
            media: {
                mimeType: "application/json",
                body: JSON.stringify(data, null, 2)
            },
            supportsAllDrives: true
        });
    } catch (e) {
        console.error("[AUTH] Failed to save DB:", e);
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
    console.log(`[AUTH] Pending user ${profile.email} saved to ${DB_FILENAME}`);
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
