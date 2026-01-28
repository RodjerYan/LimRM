
// api/process.ts
// This file has been disabled to resolve build errors caused by missing exports in the shared library.
// The application currently uses a Worker-based streaming approach for data processing (see App.tsx).
export default function handler() {
  return new Response(JSON.stringify({ message: "Legacy processing endpoint disabled." }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
