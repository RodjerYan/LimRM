// FIX: Manually define `import.meta.env` types to resolve "Cannot find type definition file for 'vite/client'"
// and subsequent "Property 'env' does not exist on type 'ImportMeta'" errors in other files.
// Also added VITE_API_SECRET_KEY which was missing.
interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY: string;
  readonly VITE_GEMINI_PROXY_URL: string;
  readonly VITE_API_SECRET_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}