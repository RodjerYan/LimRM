
import { getDrive } from "./driveClient";
import { Buffer } from "buffer";

// ID корневой папки (Shared Folder)
const USER_PROVIDED_ROOT_ID = "1gP6ybuKUPm1hu4IrosqtJwPfRROqo5bl";
// Имя единого файла базы данных
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

type StoredUser = UserProfile & UserSecrets;

type DatabaseSchema = {
    users: StoredUser[];
    pending: StoredUser[];
};

let _dbFileId: string | null = null;

async function getDbFileId() {
    if (_dbFileId) return _dbFileId;

    const drive = getDrive();
    try {
        console.log(`[AUTH-DB] Searching for ${DB_FILENAME}...`);
        const list = await drive.files.list({
            q: `'${USER_PROVIDED_ROOT_ID}' in parents and name = '${DB_FILENAME}' and trashed = false`,
            fields: "files(id, name)",
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
        // console.log(`[AUTH-DB] Reading DB content...`);
        const res = await drive.files.get({
            fileId: fileId,
            alt: 'media',
            supportsAllDrives: true
        }, { responseType: 'json' }); 
        
        let data = res.data;

        // Fallback: If axios returns string
        if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch(e) {}
        }
        // Fallback: If axios returns Buffer
        else if (Buffer.isBuffer(data)) {
            try { data = JSON.parse(data.toString('utf8')); } catch(e) {}
        }

        // Ensure structure
        if (!data || typeof data !== 'object') {
            console.warn('[AUTH-DB] Warning: DB content is empty or invalid. Initializing empty DB.');
            return { users: [], pending: [] };
        }

        const db = data as any;
        if (!Array.isArray(db.users)) db.users = [];
        if (!Array.isArray(db.pending)) db.pending = [];
        
        return db as DatabaseSchema;
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

export async function createUser(profile: UserProfile, secrets: UserSecrets) {
    const db = await readDb();
    
    const existingIndex = db.users.findIndex(u => u.email.toLowerCase() === profile.email.toLowerCase());
    if (existingIndex !== -1) {
        throw new Error("USER_ALREADY_EXISTS");
    }
    
    const newUser: StoredUser = { ...profile, ...secrets };
    db.users.push(newUser);
    
    await saveDb(db);
}

export async function createPendingUser(profile: UserProfile, secrets: UserSecrets) {
    return createUser(profile, secrets);
}

export async function getPendingUser(email: string) {
    return null; 
}

export async function getActiveUser(email: string) {
    const db = await readDb();
    const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (!user) return null;
    
    // Robustly extract secrets handling potential case sensitivity issues in DB (passwordSalt vs passwordsalt)
    const anyUser = user as any;
    let hash = anyUser.passwordHash;
    let salt = anyUser.passwordSalt;

    // Fallback: Search keys case-insensitively if strict lookup failed
    if (!hash || !salt) {
        const keys = Object.keys(anyUser);
        if (!hash) {
             const key = keys.find(k => k.toLowerCase() === 'passwordhash');
             if (key) hash = anyUser[key];
        }
        if (!salt) {
             const key = keys.find(k => k.toLowerCase() === 'passwordsalt');
             if (key) salt = anyUser[key];
        }
    }

    const { 
        passwordHash, passwordSalt, // exclude these from profile
        verifyCodeHash, verifyCodeSalt, verifyCodeExpiresAt, 
        ...profileData 
    } = user;

    // Clean any lowercase leaks in profile
    const profile = { ...profileData };
    delete (profile as any).passwordsalt;
    delete (profile as any).passwordhash;
    
    const secrets = { 
        passwordHash: hash, 
        passwordSalt: salt, 
        verifyCodeHash, 
        verifyCodeSalt, 
        verifyCodeExpiresAt 
    };
    
    return { profile, secrets };
}

export async function deleteUser(email: string) {
    const db = await readDb();
    const initialLen = db.users.length;
    
    db.users = db.users.filter(u => u.email.toLowerCase() !== email.toLowerCase());
    
    if (db.users.length === initialLen) {
        throw new Error("USER_NOT_FOUND");
    }
    
    await saveDb(db);
}

export async function activateUser(email: string) {
    // No-op
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
    return db.users.map(u => {
        const { passwordHash, passwordSalt, verifyCodeHash, verifyCodeSalt, verifyCodeExpiresAt, ...profile } = u;
        return profile;
    }).sort((a, b) => a.lastName.localeCompare(b.lastName, "ru"));
}

export async function ensureAuthRoots() { return { usersId: "", pendingId: "" }; }