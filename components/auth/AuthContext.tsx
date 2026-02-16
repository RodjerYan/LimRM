
import React, { createContext, useContext, useEffect, useState } from 'react';

export type User = {
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    role: 'admin' | 'user';
};

interface AuthContextType {
    user: User | null;
    token: string | null;
    totalUsers: number;
    isLoading: boolean;
    login: (token: string, user: User, totalUsers?: number) => void;
    logout: () => void;
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem('auth_token'));
    const [totalUsers, setTotalUsers] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    const login = (newToken: string, newUser: User, count?: number) => {
        localStorage.setItem('auth_token', newToken);
        setToken(newToken);
        setUser(newUser);
        if (count !== undefined) setTotalUsers(count);
    };

    const logout = () => {
        localStorage.removeItem('auth_token');
        setToken(null);
        setUser(null);
        setTotalUsers(0);
    };

    const refreshProfile = async () => {
        if (!token) {
            setIsLoading(false);
            return;
        }
        try {
            const res = await fetch('/api/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setUser(data.me);
                setTotalUsers(data.totalUsers || 0);
            } else {
                logout();
            }
        } catch (e) {
            console.error(e);
            logout();
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        refreshProfile();
    }, []);

    return (
        <AuthContext.Provider value={{ user, token, totalUsers, isLoading, login, logout, refreshProfile }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within AuthProvider");
    return ctx;
};
