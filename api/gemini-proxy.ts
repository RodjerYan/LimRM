
// This file is now obsolete and can be deleted.
// The core logic has been moved to `/api/gemini-task.ts` to implement a stateless,
// two-step streaming pattern that prevents serverless function timeouts.
// All frontend calls should now go through the `streamAiSummary` service, which uses the new endpoint.
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.status(410).json({ 
        error: 'This endpoint is deprecated.',
        message: 'Please use the /api/gemini-task endpoint via the streamAiSummary service.'
    });
}
