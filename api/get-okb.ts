// Vercel Serverless Function to proxy requests to Google Apps Script
// This prevents exposing the GOOGLE_SCRIPT_URL to the client.

export const config = {
  runtime: 'edge', // Use the Edge runtime for speed
};

export default async function handler(req: Request) {
  // Ensure we are only accepting GET requests
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

  try {
    // Fetch data from the Google Apps Script web app
    const response = await fetch(scriptUrl, {
        method: 'GET',
        // Optional: Follow redirects if your script issues them
        redirect: 'follow', 
    });

    if (!response.ok) {
        const errorText = await response.text();
        return new Response(JSON.stringify({ error: 'Failed to fetch data from Google Sheets', details: errorText }), {
            status: response.status,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // Get the response body as JSON
    const data = await response.json();

    // Return the data to the client with appropriate caching headers
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 
          'Content-Type': 'application/json',
          // Cache the response for 5 minutes on the edge and 10 minutes in the browser
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });

  } catch (error) {
    console.error('Error proxying to Google Script:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error', details: (error as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
