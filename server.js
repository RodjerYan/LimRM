// This file serves as a proxy to the compiled server code.
// It includes diagnostic error handling for startup failures.

console.log('[Bootstrap] Starting server.js proxy...');

try {
    // We use a dynamic import to catch syntax/loading errors in the bundled file
    import('./dist-server/index.js').catch(err => {
        console.error('\n\n================================================================');
        console.error('🚨 [BOOTSTRAP ERROR] FAILED TO LOAD SERVER BUNDLE');
        console.error('================================================================');
        console.error('Error:', err);
        console.error('Stack:', err.stack);
        
        if (err.message && err.message.includes('Dynamic require')) {
            console.error('\n💡 [FIX ADVICE]:');
            console.error('The server bundle contains invalid "require" calls.');
            console.error('Ensure your build script uses "esbuild ... --packages=external".');
        }
        
        console.error('================================================================\n');
        process.exit(1);
    });
} catch (e) {
    console.error('[Bootstrap] Synchronous error:', e);
    process.exit(1);
}