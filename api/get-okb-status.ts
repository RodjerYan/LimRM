// Vercel Serverless Function to get the status from the Google Apps Script
// This uses a specific action to avoid fetching the entire sheet

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const scriptUrl = process.env.GOOGLE_SCRIPT_URL;

  if (!scriptUrl) {
    return new Response(JSON.stringify({ error: 'Server configuration error', details: 'Google Script URL is not set.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  // Append the action parameter to the URL to call the specific function in Google Apps Script
  const statusUrl = new URL(scriptUrl);
  statusUrl.searchParams.append('action', 'getStatus');


  try {
    const response = await fetch(statusUrl.toString(), {
      method: 'GET',
      redirect: 'follow',
    });

    if (!response.ok) {
        const errorText = await response.text();
        return new Response(JSON.stringify({ error: 'Failed to fetch status from Google Sheets', details: errorText }), {
            status: response.status,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300', // Shorter cache for status
      },
    });

  } catch (error) {
    console.error('Error getting status from Google Script:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error', details: (error as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
