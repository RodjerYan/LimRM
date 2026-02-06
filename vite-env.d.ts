// FIX: Manually define `import.meta.env` types
interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY: string;
  readonly VITE_GEMINI_PROXY_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// FIX: Define the type for Vite worker imports to resolve TS2307 and avoid identifier conflicts
declare module '*?worker' {
  class WorkerFactory extends Worker {
    constructor();
  }
  export default WorkerFactory;
}