// Simple in-memory store for the OKB update job status.
// WARNING: This is not suitable for a scalable production environment on Vercel
// due to the stateless nature of serverless functions. State is not guaranteed
// to be preserved between invocations. This is a simplified approach for demonstration.
export const jobState = {
    isRunning: false,
    progress: 0,
    statusText: 'Idle',
    lastUpdated: null as string | null,
    rowCount: 0,
};
