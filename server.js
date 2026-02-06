// This file serves as a proxy to the compiled server code.
// It ensures that if 'node server.js' is run by default, the app still starts correctly.
import './dist-server/index.js';