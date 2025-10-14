// Minimal mock for next-auth/react used in component tests
// Provides useSession hook returning unauthenticated by default

exports.useSession = () => ({ data: null, status: 'unauthenticated' });

// Optionally export SessionProvider if needed in future tests
exports.SessionProvider = ({ children }) => children;

