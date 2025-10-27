
// FIX: This entire file's content is a fix.
// It implements a Vercel Edge function to securely fetch the full OKB dataset
// from a Google Apps Script, which acts as a bridge to a Google Sheet.

export const config = {
  runtime: 'edge',
};

/**
 * Handles GET requests to fetch the entire OKB dataset from the configured Google Apps Script.
 * The Apps Script is expected to return the data from a Google Sheet as a JSON array.
 * @param {Request} req The incoming request object.
 * @returns {Response} A JSON response with the OKB data or an error message.
 */
export default async function handler(req: Request) {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Retrieve the Google Apps Script URL from environment variables.
  // This is a secret and should not be exposed on the client side.
  const scriptUrl = process.env.GOOGLE_SCRIPT_URL;

  if (!scriptUrl) {
    return new Response(JSON.stringify({ error: 'Google Script URL is not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Fetch data from the Google Apps Script.
    // Google Apps Script web apps perform a redirect, so we must follow it.
    const response = await fetch(scriptUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        redirect: 'follow', // Important: Google Apps Script Web Apps often redirect
    });

    if (!response.ok) {
      // If the response is not OK, try to read the error message from the script.
      const errorText = await response.text();
      console.error(`Google Script Error: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`Failed to fetch OKB data from Google Script. Status: ${response.status}.`);
    }

    const data = await response.json();

    // Return the fetched data to the client.
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        // Cache the response to reduce load on the Google Sheet API
        'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
      },
    });

  } catch (error) {
    console.error('Error fetching OKB data:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(JSON.stringify({ error: 'Failed to retrieve OKB data', details: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
