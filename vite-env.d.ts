// FIX: Manually define `import.meta.env` types to resolve "Cannot find type definition file for 'vite/client'"
// and subsequent "Property 'env' does not exist on type 'ImportMeta'" errors in other files.
// The original `/// <reference types="vite/client" />` was removed as it caused a resolution error.
interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY: string;
  readonly VITE_GEMINI_PROXY_URL: string;
  readonly VITE_GROK_API_KEY: string;
  readonly VITE_GROK_PROXY_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
