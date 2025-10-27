// FIX: This entire file's content is a fix.
// It implements a Vercel Edge function to get the status of the OKB data source.

export const config = {
  runtime: 'edge',
};

/**
 * Handles GET requests to fetch the status of the OKB data from the Google Apps Script.
 * The status can include metadata like the last update timestamp and the number of rows.
 * @param {Request} req The incoming request object.
 * @returns {Response} A JSON response containing the status or an error message.
 */
export default async function handler(req: Request) {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const scriptUrl = process.env.GOOGLE_SCRIPT_URL;

  if (!scriptUrl) {
    return new Response(JSON.stringify({ error: 'Google Script URL is not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Append a query parameter to get the status from the Google Apps Script.
    const statusUrl = `${scriptUrl}?action=status`;
    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      redirect: 'follow',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch OKB status from Google Script: ${response.status} ${response.statusText}. Response: ${errorText}`);
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        // Do not cache status, we always want the latest.
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });

  } catch (error) {
    console.error('Error fetching OKB status:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(JSON.stringify({ error: 'Failed to retrieve OKB status', details: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
