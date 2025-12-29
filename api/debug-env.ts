
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Buffer } from 'node:buffer';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  
  const result: any = {
    hasKey: !!key,
    keyLength: key?.length || 0,
    firstChars: key ? key.substring(0, 50) + (key.length > 50 ? '...' : '') : null,
    lastChars: key ? '...' + key.substring(Math.max(0, key.length - 20)) : null,
    tests: {}
  };

  if (key) {
    const keyString = key.trim();
    
    // Test 1: Check if looks like Base64 (ignore whitespace)
    const cleanForBase64Check = keyString.replace(/\s/g, '');
    const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
    const looksLikeBase64 = base64Regex.test(cleanForBase64Check);
    result.tests.looksLikeBase64 = looksLikeBase64;
    result.tests.cleanLength = cleanForBase64Check.length;
    
    // Test 2: Try Base64 decode
    if (looksLikeBase64) {
      try {
        const decoded = Buffer.from(cleanForBase64Check, 'base64').toString('utf8');
        result.tests.base64Decoded = true;
        result.tests.decodedStartsWith = decoded.substring(0, 50) + '...';
        
        // Try to parse decoded as JSON
        try {
          const parsed = JSON.parse(decoded);
          result.tests.base64ParsesToJSON = true;
          result.tests.hasRequiredFields = {
            type: !!parsed.type,
            project_id: !!parsed.project_id,
            private_key: !!parsed.private_key,
            client_email: !!parsed.client_email
          };
        } catch (e: any) {
          result.tests.base64ParsesToJSON = false;
          result.tests.base64JSONError = e.message;
        }
      } catch (e: any) {
        result.tests.base64Decoded = false;
        result.tests.base64Error = e.message;
      }
    }
    
    // Test 3: Try plain JSON (with newline fixes)
    try {
      let jsonStr = keyString;
      
      // Remove surrounding quotes
      if ((jsonStr.startsWith('"') && jsonStr.endsWith('"')) || 
          (jsonStr.startsWith("'") && jsonStr.endsWith("'"))) {
        jsonStr = jsonStr.slice(1, -1);
      }
      
      // Fix escaped newlines
      jsonStr = jsonStr.replace(/\\n/g, '\n');
      jsonStr = jsonStr.replace(/\\\\n/g, '\\n');
      
      const parsed = JSON.parse(jsonStr);
      result.tests.plainJSONParses = true;
      result.tests.plainJSONFields = {
        type: parsed.type || 'missing',
        project_id: !!parsed.project_id,
        private_key_length: parsed.private_key ? parsed.private_key.length : 0,
        client_email: parsed.client_email || 'missing'
      };
    } catch (e: any) {
      result.tests.plainJSONParses = false;
      result.tests.plainJSONError = e.message;
    }
  }

  // Add environment info (safe)
  result.envInfo = {
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    hasGeminiKey: !!process.env.VITE_GEMINI_API_KEY,
    googleVarsCount: Object.keys(process.env).filter(k => k.includes('GOOGLE')).length
  };

  res.status(200).json(result);
}
