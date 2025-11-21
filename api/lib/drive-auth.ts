
import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';

const ROOT_FOLDER_ID = '13mglnRNUvOvrqmQpEgj5l0htrFtyI84d';
const INDEX_FILE_NAME = '_users_index_v1.json';

// Initialize Auth
function getDriveClient() {
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is missing');
    
    let credentials;
    try {
        credentials = JSON.parse(serviceAccountKey);
    } catch (e) {
        console.error('Error parsing GOOGLE_SERVICE_ACCOUNT_KEY:', e);
        throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_KEY format');
    }

    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/drive'],
    });
    return google.drive({ version: 'v3', auth });
}

export interface UserIndex {
    [email: string]: {
        folderId: string;
        isVerified: boolean;
        name: string;
    }
}

export interface UserCredentials {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    createdAt: string;
    role: 'admin' | 'user';
}

// --- Helpers ---

async function findFile(drive: drive_v3.Drive, name: string, parentId: string) {
    try {
        const res = await drive.files.list({
            q: `name = '${name}' and '${parentId}' in parents and trashed = false`,
            fields: 'files(id, name)',
        });
        return res.data.files?.[0] || null;
    } catch (error) {
        console.error(`Error finding file ${name}:`, error);
        return null;
    }
}

async function readFile<T>(drive: drive_v3.Drive, fileId: string): Promise<T> {
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'json' });
    return res.data as T;
}

async function createFile(drive: drive_v3.Drive, name: string, parentId: string, content: any, mimeType = 'application/json') {
    const media = {
        mimeType,
        body: Readable.from([JSON.stringify(content, null, 2)]),
    };
    const res = await drive.files.create({
        requestBody: {
            name,
            parents: [parentId],
        },
        media,
        fields: 'id',
    });
    return res.data.id;
}

async function updateFile(drive: drive_v3.Drive, fileId: string, content: any) {
    const media = {
        mimeType: 'application/json',
        body: Readable.from([JSON.stringify(content, null, 2)]),
    };
    await drive.files.update({
        fileId,
        media,
    });
}

// --- Public API ---

export async function getUserIndex(): Promise<{ index: UserIndex, fileId: string | null }> {
    const drive = getDriveClient();
    const file = await findFile(drive, INDEX_FILE_NAME, ROOT_FOLDER_ID);
    
    if (!file || !file.id) {
        return { index: {}, fileId: null };
    }
    
    try {
        const index = await readFile<UserIndex>(drive, file.id);
        return { index, fileId: file.id };
    } catch (e) {
        console.error('Failed to read index file, returning empty:', e);
        return { index: {}, fileId: file.id };
    }
}

export async function registerUserInDrive(userData: UserCredentials, passwordHash: string) {
    const drive = getDriveClient();
    const { index, fileId: indexFileId } = await getUserIndex();

    if (index[userData.email]) {
        throw new Error('Пользователь с таким email уже существует.');
    }

    // 1. Create User Folder
    const folderMetadata = {
        name: `${userData.firstName} ${userData.lastName}`,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [ROOT_FOLDER_ID],
    };
    const folderRes = await drive.files.create({
        requestBody: folderMetadata,
        fields: 'id',
    });
    const folderId = folderRes.data.id!;

    // 2. Save Credentials inside the folder
    const credentialsData = {
        ...userData,
        passwordHash, // Storing securely
    };
    await createFile(drive, 'credentials.json', folderId, credentialsData);

    // 3. Update Index
    const newIndex = {
        ...index,
        [userData.email]: {
            folderId,
            isVerified: false, // Email verification pending
            name: `${userData.firstName} ${userData.lastName}`,
        }
    };

    if (indexFileId) {
        await updateFile(drive, indexFileId, newIndex);
    } else {
        await createFile(drive, INDEX_FILE_NAME, ROOT_FOLDER_ID, newIndex);
    }

    return folderId;
}

export async function getUserCredentials(folderId: string): Promise<UserCredentials> {
    const drive = getDriveClient();
    const file = await findFile(drive, 'credentials.json', folderId);
    if (!file || !file.id) throw new Error('Файл учетных данных не найден.');
    
    return await readFile<UserCredentials>(drive, file.id);
}

export async function markUserVerified(email: string) {
    const drive = getDriveClient();
    const { index, fileId } = await getUserIndex();
    
    if (!index[email] || !fileId) throw new Error('Пользователь не найден.');
    
    index[email].isVerified = true;
    await updateFile(drive, fileId, index);
}
