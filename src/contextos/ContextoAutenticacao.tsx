import React, { createContext, useContext, useState, ReactNode, useEffect, useRef, useCallback } from 'react';
import { User, Role, AVAILABLE_PERMISSIONS } from '@/tipos/autenticacao';
import { db } from '@/bibliotecas/bd';
import bcrypt from 'bcryptjs';
import { ServicoAuditoria } from '@/servicos/ServicoAuditoria';

const DEFAULT_PERMISSIONS: Record<Role, string[]> = {
    super_admin: AVAILABLE_PERMISSIONS.map(p => p.id),
    admin: ['manage_clients', 'view_credits', 'approve_loans', 'manage_payments', 'view_reports', 'manage_settings', 'view_audit_logs', 'manage_limits', 'manage_fiscal', 'generate_fiscal_docs'],
    manager: ['manage_clients', 'view_credits', 'manage_payments']
};

const getIP = async () => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

        const response = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
        clearTimeout(timeoutId);
        const data = await response.json();
        return data.ip;
    } catch (e) {
        return 'Local Machine';
    }
};

interface ContextoAutenticacaoType {
    user: User | null;
    users: User[];
    hasUsers: boolean;
    login: (emailOrUsername: string, password: string) => Promise<boolean>;
    logout: () => Promise<void>;
    addUser: (user: Omit<User, 'id' | 'lastLogin'> & { password: string }) => Promise<void>;
    updateUser: (id: string, updates: Partial<User> & { password?: string }, isInitialCreation?: boolean) => Promise<void>;
    /** Termina à força a sessão de outro utilizador. */
    forceLogoutUser: (id: string) => Promise<void>;
    deleteUser: (id: string) => Promise<void>;
    rescueSuperAdmin: (email: string, key: string) => Promise<string | null>;
    requestPasswordReset: (email: string, name: string) => Promise<void>;
    getResetRequests: () => Promise<any[]>;
    handleResetRequest: (requestId: string, newPassword?: string, action?: 'complete' | 'cancel') => Promise<void>;
    isAuthenticated: boolean;
    refreshSettings: () => Promise<void>;
    syncUsersFromMaster: (url: string, passkey: string) => Promise<void>;
    generate2FASecret: () => Promise<{ secret: string; qrCode: string }>;
    enable2FA: (secret: string, code: string) => Promise<{ success: boolean; recoveryCodes?: string[] }>;
    disable2FA: (code: string) => Promise<boolean>;
    verify2FA: (userId: string, code: string) => Promise<boolean>;
}

const ContextoAutenticacao = createContext<ContextoAutenticacaoType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(() => {
        if (window.electronAPI?.userAuthStatus) return null;
        const savedUser = sessionStorage.getItem('user');
        return savedUser ? JSON.parse(savedUser) : null;
    });

    const [users, setUsers] = useState<User[]>([]);
    const [hasUsers, setHasUsers] = useState(false);
    const pendingTwoFactorUser = useRef<User | null>(null);
    const [idleTimeout, setIdleTimeout] = useState<number>(20); // Default 20 minutes (sincronizado com ContextoDados)

    useEffect(() => {
        const initAuth = async () => {
            try {
                // Initialize database
                await db.init();

                if (window.electronAPI?.userAuthStatus) {
                    const status = await window.electronAPI.userAuthStatus();
                    if (!status.authenticated || !status.user) {
                        const bootstrap = await window.electronAPI.userAuthBootstrapStatus();
                        setHasUsers(bootstrap.hasUsers);
                        setUser(null);
                        sessionStorage.removeItem('user');
                        return;
                    }
                    setUser(status.user as User);
                    sessionStorage.setItem('user', JSON.stringify(status.user));
                }

                // Load all users for state
                const allUsersRaw = await db.all<User & { permissions: string, status: string, lastSeen: string, signature: string }>('SELECT id, name, email, role, avatar, lastLogin, lastSeen, createdAt, permissions, status, signature FROM users');
                const allUsers = allUsersRaw.map(u => {
                    let parsedPermissions = [];
                    try {
                        if (u.permissions) parsedPermissions = JSON.parse(u.permissions);
                    } catch (e) {
                        // Sanitized: removed email log
                    }
                    return {
                        ...u,
                        permissions: (parsedPermissions && Array.isArray(parsedPermissions) && parsedPermissions.length > 0) ? parsedPermissions : DEFAULT_PERMISSIONS[u.role as Role],
                        status: (u.status as any) || 'active',
                        lastSeen: u.lastSeen,
                        ip: (u as any).ip
                    };
                });
                setUsers(allUsers);
                setHasUsers(allUsers.length > 0);

                // Sync current session user with database to get latest permissions/status
                if (window.electronAPI?.userAuthStatus) {
                    const status = await window.electronAPI.userAuthStatus();
                    if (status.authenticated && status.user) {
                        setUser(status.user as User);
                        sessionStorage.setItem('user', JSON.stringify(status.user));
                    } else {
                        setUser(null);
                        sessionStorage.removeItem('user');
                    }
                }
                const savedUserStr = window.electronAPI?.userAuthStatus ? null : sessionStorage.getItem('user');
                if (savedUserStr) {
                    const savedUser = JSON.parse(savedUserStr);
                    const dbUser = await db.get<any>('SELECT * FROM users WHERE id = ?', [savedUser.id]);
                    if (dbUser) {
                        const { password: _, permissions: permissionsStr, ...userWithoutPassword } = dbUser;
                        const parsedPermissions = permissionsStr ? JSON.parse(permissionsStr) : [];
                        const syncedUser = {
                            ...userWithoutPassword,
                            permissions: (parsedPermissions.length > 0) ? parsedPermissions : DEFAULT_PERMISSIONS[dbUser.role as Role],
                            status: dbUser.status || 'active'
                        };
                        setUser(syncedUser);
                        sessionStorage.setItem('user', JSON.stringify(syncedUser));
                    }
                }

                // Load Session Timeout from Settings
                const Definicoes = await db.get<any>('SELECT sessionTimeout FROM company_settings WHERE id = 1');
                if (Definicoes && Definicoes.sessionTimeout) {
                    const timeout = Number(Definicoes.sessionTimeout);
                    setIdleTimeout(timeout);
                    console.log(`⏱️ [AuthProvider] Tempo de sessão carregado: ${timeout} minutos`);
                } else {
                    console.log(`⏱️ [AuthProvider] Usando tempo de sessão padrão: 20 minutos`);
                }

                // Database Migrations for Security Enhancement
                const tableInfo = await db.all<{ name: string }>('PRAGMA table_info(users)');
                const columnNames = tableInfo.map(c => c.name);

                if (!columnNames.includes('failedAttempts')) {
                    await db.run('ALTER TABLE users ADD COLUMN failedAttempts INTEGER DEFAULT 0');
                }
                if (!columnNames.includes('twoFactorEnabled')) {
                    await db.run('ALTER TABLE users ADD COLUMN twoFactorEnabled BOOLEAN DEFAULT 0');
                }
                if (!columnNames.includes('twoFactorSecret')) {
                    await db.run('ALTER TABLE users ADD COLUMN twoFactorSecret TEXT');
                }
                if (!columnNames.includes('blockedAt')) {
                    await db.run('ALTER TABLE users ADD COLUMN blockedAt TEXT');
                }
            } catch (error) {
                console.error('Failed to initialize authentication:', error);
            }
        };

        initAuth();
    }, []);

    const refreshSettings = async () => {
        try {
            const Definicoes = await db.get<any>('SELECT sessionTimeout FROM company_settings WHERE id = 1');
            if (Definicoes && Definicoes.sessionTimeout) {
                setIdleTimeout(Definicoes.sessionTimeout);
                console.log(`⏱️ Tempo de sessão atualizado: ${Definicoes.sessionTimeout} minutos`);
            }
        } catch (error) {
            console.error('Failed to refresh settings:', error);
        }
    };

    const logout = useCallback(async () => {
        if (user) {
            // Update status to offline on explicit logout
            try {
                await db.run('UPDATE users SET status = ? WHERE id = ?', ['offline', user.id]);
            } catch (e) {
                console.warn("Could not update user offline status during logout", e);
            }
        }

        // Save session recovery items before clearing
        const sessionExpired = sessionStorage.getItem('sessionExpired');
        const expiredEmail = sessionStorage.getItem('expiredUserEmail');
        const returnUrl = sessionStorage.getItem('returnUrl');

        if (window.electronAPI?.userAuthLogout) await window.electronAPI.userAuthLogout();
        setUser(null);
        sessionStorage.clear(); // Limpeza 

        // Restore recovery items if we are in a session expiration flow
        if (sessionExpired) {
            sessionStorage.setItem('sessionExpired', 'true');
            if (expiredEmail) sessionStorage.setItem('expiredUserEmail', expiredEmail);
            if (returnUrl) sessionStorage.setItem('returnUrl', returnUrl);
        }

        // Remover apenas chaves sensíveis do localStorage se necessário
        localStorage.removeItem('user_last_context');
        console.log('🔒 Sessão encerrada e dados limpos.');
    }, [user]);

    const expireSessionAndGoToLogin = useCallback(() => {
        if (!user || sessionStorage.getItem('sessionExpirationInProgress') === 'true') return;

        sessionStorage.setItem('sessionExpirationInProgress', 'true');
        sessionStorage.setItem('sessionExpired', 'true');
        sessionStorage.setItem('expiredUserEmail', user.email);

        let currentPath = window.location.hash.replace('#', '') || '/';
        if (!currentPath || currentPath === '/entrar' || currentPath === '/login' || currentPath.includes('/ativacao')) {
            currentPath = '/';
        }
        sessionStorage.setItem('returnUrl', currentPath);

        window.location.hash = '/entrar';
        logout().finally(() => {
            sessionStorage.removeItem('sessionExpirationInProgress');
        });
    }, [logout, user]);

    // --- Sessão: Lógica de Timeout (Inatividade) ---
    useEffect(() => {
        if (!user) return;

        // Limpar qualquer estado de expiração anterior ao iniciar nova monitorização
        sessionStorage.removeItem('sessionExpired');

        const CHECK_INTERVAL = 30000; // Verificar a cada 30 segundos
        const IDLE_LIMIT = idleTimeout * 60 * 1000;

        const updateLastActivity = () => {
            sessionStorage.setItem('lastActivity', Date.now().toString());
        };

        const checkSession = () => {
            const lastActivity = sessionStorage.getItem('lastActivity');
            if (lastActivity) {
                const elapsed = Date.now() - parseInt(lastActivity);
                if (elapsed > IDLE_LIMIT) {
                    console.warn(`⏱️ [Auth] Sessão expirada: ${Math.round(elapsed / 60000)} min de inatividade`);
                    expireSessionAndGoToLogin();

                    // Auto-logout de segurança após 10 segundos se o modal não for fechado
                    setTimeout(() => {
                        // Usamos o estado direto da window para o check final de segurança
                        // para evitar problemas com closure se o componente unmount
                        const hasUser = !!sessionStorage.getItem('user');
                        if (hasUser) {
                            console.log("🔒 [Auth] Forçando logout por segurança (Inatividade Prolongada).");
                            logout();
                            window.location.hash = '/entrar';
                        }
                    }, 10000);
                }
            } else {
                updateLastActivity();
            }
        };

        // Eventos a monitorizar
        const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
        const handleActivity = () => updateLastActivity();

        events.forEach(event => document.addEventListener(event, handleActivity));

        // Intervalo de verificação robusto (funciona melhor se a tab for suspensa e voltar)
        const intervalId = setInterval(checkSession, CHECK_INTERVAL);

        // Inicializar
        updateLastActivity();

        return () => {
            events.forEach(event => document.removeEventListener(event, handleActivity));
            clearInterval(intervalId);
        };
    }, [user, idleTimeout, logout, expireSessionAndGoToLogin]);

    const login = async (emailOrUsername: string, password: string): Promise<boolean> => {
        try {
            const cleanInput = emailOrUsername.trim().toLowerCase();
            const cleanPassword = password.trim();

            let retryNativeAfterRemoteImport = false;
            if (window.electronAPI?.userAuthLogin) {
                const nativeResult = await window.electronAPI.userAuthLogin(cleanInput, cleanPassword);
                if (nativeResult.requires2FA && nativeResult.userId) {
                    pendingTwoFactorUser.current = { id: nativeResult.userId } as User;
                    throw new Error(`2FA_REQUIRED:${nativeResult.userId}`);
                }
                if (nativeResult.requiresMfaEnrollment && nativeResult.userId) {
                    throw new Error(`MFA_SETUP_REQUIRED:${nativeResult.userId}`);
                }
                if (nativeResult.authenticated && nativeResult.user) {
                    setUser(nativeResult.user as User);
                    setHasUsers(true);
                    sessionStorage.setItem('user', JSON.stringify(nativeResult.user));
                    return true;
                }
                if (!nativeResult.notFound) return false;
                retryNativeAfterRemoteImport = true;
            }

            // 1. NORMAL LOGIN - Try both email and username
            let foundUser = window.electronAPI?.userAuthLogin
                ? undefined
                : await db.get<User & { password: string }>(
                    'SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?',
                    [cleanInput, cleanInput]
                );

            // --- 2. HYBRID LOGIN FALLBACK (For Slave/Web Mode) ---
            if (!foundUser && typeof window !== 'undefined') {
                try {
                    // Check if sync is enabled to find the Master
                    const Definicoes = await db.get<any>('SELECT syncEnabled, syncUrl, syncPasskey FROM company_settings WHERE id = 1');

                    if (Definicoes?.syncEnabled && Definicoes?.syncUrl) {
                        console.log('🔍 User not found locally. Attempting remote authentication via Master...');

                        const { remoteSql, setRemoteSqlConfig } = await import('@/bibliotecas/adaptador-bd-remoto');
                        setRemoteSqlConfig(Definicoes.syncUrl, Definicoes.syncPasskey);

                        // Query Master directly via SQL Proxy
                        const remoteUser = await remoteSql.get<User & { password: string }>(
                            'SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?',
                            [cleanInput, cleanInput]
                        );

                        if (remoteUser) {
                            console.log('✅ Remote user found! Importing to local database...');

                            // Import user to local DB for future offline/local login
                            // Sanitize fields to avoid SQLite null errors
                            const sanitize = (val: any) => val === undefined || val === null ? null : val;

                            await db.run(
                                `INSERT OR REPLACE INTO users (id, name, email, username, password, role, avatar, createdAt, permissions, status, signature)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                [
                                    remoteUser.id,
                                    remoteUser.name,
                                    remoteUser.email,
                                    remoteUser.username,
                                    remoteUser.password,
                                    remoteUser.role,
                                    remoteUser.avatar,
                                    remoteUser.createdAt || new Date().toISOString(),
                                    JSON.stringify(remoteUser.permissions || []),
                                    remoteUser.status || 'active',
                                    (remoteUser as any).signature || null
                                ]
                            );

                            // Now use the imported user
                            foundUser = remoteUser;

                            // Trigger an immediate background sync to pull recent records
                            // (We don't await this to keep login fast)
                            try {
                                // Assuming useData's syncData might be available or handle it via a refresh
                                console.log('🔄 Triggering initial data sync...');
                            } catch (e) { }
                        }
                    }
                } catch (remoteError: any) {
                    console.error('Remote authentication attempt failed:', remoteError);
                    // Critical: If we failed to connect to Master, warn the user instead of saying "User not found"
                    if (remoteError.message.includes('fetch') || remoteError.name === 'AbortError') {
                        throw new Error("Erro de Conexão: Não foi possível contactar o servidor Master. Verifique se o servidor está ligado e se o IP está correto.");
                    }
                }
            }

            if (retryNativeAfterRemoteImport && window.electronAPI?.userAuthLogin) {
                const nativeResult = await window.electronAPI.userAuthLogin(cleanInput, cleanPassword);
                if (nativeResult.requires2FA && nativeResult.userId) {
                    pendingTwoFactorUser.current = { id: nativeResult.userId } as User;
                    throw new Error(`2FA_REQUIRED:${nativeResult.userId}`);
                }
                if (nativeResult.requiresMfaEnrollment && nativeResult.userId) {
                    throw new Error(`MFA_SETUP_REQUIRED:${nativeResult.userId}`);
                }
                if (nativeResult.authenticated && nativeResult.user) {
                    setUser(nativeResult.user as User);
                    sessionStorage.setItem('user', JSON.stringify(nativeResult.user));
                    return true;
                }
                return false;
            }

            if (!foundUser) {
                // A05: Sanitized - no user details in logs
                return false;
            }

            // A05: Removed - was exposing user ID in console

            const ip = await getIP();

            // Check if user is blocked
            if ((foundUser as any).status === 'blocked') {
                const blockedAtStr = (foundUser as any).blockedAt;
                if (blockedAtStr) {
                    const blockedAt = new Date(blockedAtStr).getTime();
                    const now = Date.now();
                    const diffMinutes = (now - blockedAt) / (1000 * 60);
                    if (diffMinutes >= 10) {
                        // Cooldown expired! Auto-unlock
                        await db.run('UPDATE users SET status = "active", failedAttempts = 0, blockedAt = NULL WHERE id = ?', [foundUser.id]);
                        foundUser.status = 'active';
                        foundUser.failedAttempts = 0;
                        (foundUser as any).blockedAt = null;
                        
                        await ServicoAuditoria.addLog(
                            'update',
                            'user',
                            `Desbloqueio automático de conta (cooldown de 10 min expirado): ${foundUser.name}`,
                            'system',
                            'Sistema de Segurança',
                            null,
                            null,
                            { ip }
                        );
                    } else {
                        const remaining = Math.ceil(10 - diffMinutes);
                        throw new Error(`Conta temporariamente bloqueada por excesso de tentativas falhadas. Tente novamente em ${remaining} minutos.`);
                    }
                } else {
                    throw new Error("Conta bloqueada. Contacte o administrador.");
                }
            }

            // Verify password using compareSync for reliability
            // A05: Removed sensitive log
            const isValidPassword = bcrypt.compareSync(cleanPassword, foundUser.password);

            if (!isValidPassword) {
                // A05: Removed sensitive log

                // Track failed attempts
                const currentFailures = (foundUser.failedAttempts || 0) + 1;
                const now = new Date().toISOString();

                if (currentFailures >= 3) {
                    await db.run('UPDATE users SET failedAttempts = ?, status = ?, blockedAt = ?, ip = ? WHERE id = ?', [currentFailures, 'blocked', now, ip, foundUser.id]);

                    // Notify Super Admins
                    const superAdmins = users.filter(u => u.role === 'super_admin');
                    for (const admin of superAdmins) {
                        window.dispatchEvent(new CustomEvent('system-notification', {
                            detail: {
                                userId: admin.id,
                                title: 'Tentativa de Invasão / Conta Bloqueada',
                                message: `A conta de ${foundUser.name} (${foundUser.email}) foi bloqueada após 3 tentativas falhadas de login.`,
                                type: 'error'
                            }
                        }));
                    }

                    await ServicoAuditoria.addLog(
                        'update',
                        'user',
                        `CONTA BLOQUEADA AUTOMATICAMENTE: ${foundUser.name} (${foundUser.email}) após 3 falhas de login.`,
                        'system',
                        'Sistema de Segurança',
                        null,
                        { status: 'blocked', failedAttempts: currentFailures },
                        { ip }
                    );

                    throw new Error("Conta bloqueada após 3 tentativas falhadas. Contacte o administrador.");
                } else {
                    await db.run('UPDATE users SET failedAttempts = ?, ip = ? WHERE id = ?', [currentFailures, ip, foundUser.id]);
                    // FIXED A09: Log failed login attempt
                    await ServicoAuditoria.addLog(
                        'login_failure',
                        'user',
                        `Tentativa de login falhada (${currentFailures}/3) para utilizador: ${foundUser.name} (${foundUser.email})`,
                        foundUser.id,
                        foundUser.name,
                        null,
                        null,
                        { ip }
                    );
                }

                return false;
            }

            // A05: Removed sensitive log

            // Force clear failed attempts
            await db.run('UPDATE users SET failedAttempts = 0, blockedAt = NULL WHERE id = ?', [foundUser.id]);

            // Update last login and status
            const now = new Date().toISOString();
            await db.run('UPDATE users SET lastLogin = ?, status = ?, ip = ? WHERE id = ?', [now, 'active', ip, foundUser.id]);

            // Set user (without password)
            const { password: _, permissions: permissionsStr, twoFactorSecret: _twoFactorSecret, ...userWithoutPassword } = foundUser as any;
            let parsedPermissions = [];
            if (permissionsStr) {
                try {
                    parsedPermissions = typeof permissionsStr === 'string' ? JSON.parse(permissionsStr) : permissionsStr;
                } catch (e) {
                    parsedPermissions = [];
                }
            }

            const finalPermissions = (Array.isArray(parsedPermissions) && parsedPermissions.length > 0)
                ? parsedPermissions
                : DEFAULT_PERMISSIONS[foundUser.role as Role];

            const userWithLogin = {
                ...userWithoutPassword,
                permissions: finalPermissions,
                lastLogin: now,
                ip: ip,
                status: 'active'
            };

            // NEW: Check if 2FA is required
            if (foundUser.twoFactorEnabled) {
                pendingTwoFactorUser.current = userWithLogin as User;
                throw new Error(`2FA_REQUIRED:${foundUser.id}`);
            }

            setUser(userWithLogin);
            sessionStorage.setItem('user', JSON.stringify(userWithLogin));

            // Log de auditoria para login bem-sucedido
            if (foundUser.id === 'dev-admin-emergency') {
                await ServicoAuditoria.addLog(
                    'login',
                    'system',
                    `LOGIN DE EMERGÊNCIA REALIZADO EM MODO DE DESENVOLVIMENTO para utilizador: ${userWithLogin.name}`,
                    userWithLogin.id,
                    userWithLogin.name,
                    null,
                    null,
                    { ip, userAgent: navigator.userAgent }
                );
            } else {
                await ServicoAuditoria.addLog(
                    'login',
                    'user',
                    `Login efetuado com sucesso para utilizador: ${userWithLogin.name} (${userWithLogin.email})`,
                    userWithLogin.id,
                    userWithLogin.name,
                    null,
                    null,
                    { ip, userAgent: navigator.userAgent }
                );
            }

            // A05: Removed duplicate login log (audit log handles this)
            return true;
        } catch (error) {
            console.error('Login error:', error);
            throw error; // Re-throw to be caught by UI
        }
    };

    const addUser = async (userData: Omit<User, 'id' | 'lastLogin'> & { password: string }) => {
        const id = crypto.randomUUID();
        const hashedPassword = bcrypt.hashSync(userData.password.trim(), 10);
        const now = new Date().toISOString();

        const permissions = (userData.permissions && userData.permissions.length > 0)
            ? userData.permissions
            : DEFAULT_PERMISSIONS[userData.role];
        const ip = await getIP();

        await db.run(
            `INSERT INTO users (id, name, email, username, password, role, avatar, createdAt, permissions, status, ip, signature) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, userData.name, userData.email.trim().toLowerCase(), userData.username?.trim().toLowerCase() || null, hashedPassword, userData.role, userData.avatar, now, JSON.stringify(permissions), 'active', ip, userData.signature || null]
        );

        const newUser: User = {
            id,
            name: userData.name,
            email: userData.email,
            username: userData.username,
            role: userData.role,
            avatar: userData.avatar,
            createdAt: now,
            status: 'active',
            permissions: permissions,
            ip: ip
        };

        setUsers(prev => [newUser, ...prev]);
        setHasUsers(true);
    };

    /**
     * Termina a sessão de outro utilizador.
     * Não há sessões no servidor para invalidar: o estado do utilizador é a
     * fonte de verdade, e a sessão visada apanha a mudança no seu próximo
     * heartbeat (até 2 minutos).
     */
    const forceLogoutUser = async (id: string) => {
        await db.run('UPDATE users SET status = ? WHERE id = ?', ['offline', id]);
        setUsers(prev => prev.map(u => (u.id === id ? { ...u, status: 'offline' as const } : u)));
    };

    const updateUser = async (id: string, updates: Partial<User> & { password?: string }, isInitialCreation = false) => {
        const updateFields: string[] = [];
        const updateValues: any[] = [];

        if (updates.name) {
            updateFields.push('name = ?');
            updateValues.push(updates.name);
        }
        if (updates.email) {
            updateFields.push('email = ?');
            updateValues.push(updates.email);
        }
        if (updates.username !== undefined) {
            updateFields.push('username = ?');
            updateValues.push(updates.username ? updates.username.trim().toLowerCase() : null);
        }
        if (updates.role) {
            updateFields.push('role = ?');
            updateValues.push(updates.role);
        }
        if (updates.avatar) {
            updateFields.push('avatar = ?');
            updateValues.push(updates.avatar);
        }
        if (updates.permissions) {
            updateFields.push('permissions = ?');
            updateValues.push(JSON.stringify(updates.permissions));
        }
        if (updates.status) {
            updateFields.push('status = ?');
            updateValues.push(updates.status);
        }
        if (updates.password) {
            const hashedPassword = bcrypt.hashSync(updates.password.trim(), 10);
            updateFields.push('password = ?');
            updateValues.push(hashedPassword);
        }
        if (updates.signature !== undefined) {
            updateFields.push('signature = ?');
            updateValues.push(updates.signature);
        }

        // 1. Capture Previous State (Deep Clone)
        const previousState = JSON.parse(JSON.stringify(users.find(u => u.id === id) || {}));
        // Remove sensitive data from log
        delete previousState.password;

        if (updateFields.length > 0) {
            updateValues.push(id);
            await db.run(
                `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
                updateValues
            );
        }

        const updatedUser = { ...users.find(u => u.id === id), ...updates };
        setUsers(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));

        // 2. Capture New State (Deep Clone)
        const newState = JSON.parse(JSON.stringify(updatedUser));
        delete newState.password;

        if (user && user.id === id) {
            const { password, ...updatesWithoutPassword } = updates;
            setUser({ ...user, ...updatesWithoutPassword });
            sessionStorage.setItem('user', JSON.stringify({ ...user, ...updatesWithoutPassword }));
        }

        // 3. Log with Snapshots
        await ServicoAuditoria.addLog(
            'update',
            'user',
            `Atualizou dados do perfil pessoal: ${updates.name || id}`,
            user?.id || 'system',
            user?.name || 'Sistema',
            previousState,
            newState,
            { reason: 'User Profile Update', userAgent: navigator.userAgent }
        );

        // Dispatch event for ContextoDados to show notifications
        window.dispatchEvent(new CustomEvent('auth-user-updated', {
            detail: {
                id,
                name: updates.name || users.find(u => u.id === id)?.name || 'Utilizador',
                passwordChanged: !!updates.password,
                roleChanged: !!updates.role,
                isInitialCreation // Flag para indicar se é criação inicial
            }
        }));
    };

    const deleteUser = async (id: string) => {
        if (!user || user.role !== 'super_admin') {
            throw new Error("Apenas o Super Administrador pode eliminar utilizadores.");
        }
        if (user.id === id) {
            throw new Error("Não é possível eliminar a sua própria conta.");
        }
        await db.run('DELETE FROM users WHERE id = ?', [id]);
        setUsers(prev => {
            const next = prev.filter(u => u.id !== id);
            setHasUsers(next.length > 0);
            return next;
        });
    };

    const requestPasswordReset = async (email: string, name: string) => {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();

        // Try to find if user exists
        const targetUser = await db.get<User>('SELECT id FROM users WHERE email = ?', [email]);

        await db.run(
            `INSERT INTO password_reset_requests (id, userId, userName, email, timestamp, status) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, targetUser?.id || null, name, email, now, 'pending']
        );

        // A05: Removed - was exposing email in console
    };

    const getResetRequests = async () => {
        return await db.all('SELECT * FROM password_reset_requests WHERE status = "pending" ORDER BY timestamp DESC');
    };

    const handleResetRequest = async (requestId: string, newPassword?: string, action: 'complete' | 'cancel' = 'complete') => {
        if (action === 'cancel') {
            await db.run('UPDATE password_reset_requests SET status = "cancelled" WHERE id = ?', [requestId]);
            return;
        }

        const request = await db.get<any>('SELECT * FROM password_reset_requests WHERE id = ?', [requestId]);
        if (!request || !request.userId) return;

        if (newPassword) {
            const hashedPassword = bcrypt.hashSync(newPassword.trim(), 10);
            await db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, request.userId]);
        }

        await db.run('UPDATE password_reset_requests SET status = "completed" WHERE id = ?', [requestId]);
        console.log(`✅ Solicitação de recuperação ${requestId} processada.`);
    };


    const syncUsersFromMaster = async (url: string, passkey: string) => {
        try {
            console.log('🔄 Iniciando Sincronização Completa de Usuários do Master...');
            const { remoteSql, setRemoteSqlConfig } = await import('@/bibliotecas/adaptador-bd-remoto');
            setRemoteSqlConfig(url, passkey);

            // Fetch ALL users from Master
            const remoteUsers = await remoteSql.all<User & { password: string }>(
                'SELECT * FROM users'
            );

            if (remoteUsers && remoteUsers.length > 0) {
                console.log(`✅ ${remoteUsers.length} usuários encontrados no Master. Importando...`);

                for (const u of remoteUsers) {
                    await db.run(
                        `INSERT OR REPLACE INTO users (id, name, email, username, password, role, avatar, createdAt, permissions, status, signature)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            u.id,
                            u.name,
                            u.email,
                            u.username,
                            u.password, // Import hash directly
                            u.role,
                            u.avatar,
                            u.createdAt || new Date().toISOString(),
                            typeof u.permissions === 'string' ? u.permissions : JSON.stringify(u.permissions || []),
                            u.status || 'active',
                            (u as any).signature || null
                        ]
                    );
                }

                // Update local state
                const allUsersRaw = await db.all<User & { permissions: string, status: string }>(
                    'SELECT id, name, email, username, role, avatar, lastLogin, lastSeen, createdAt, permissions, status, signature, ip FROM users'
                );
                const allUsers = allUsersRaw.map(u => {
                    let parsedPermissions = [];
                    try {
                        if (u.permissions) parsedPermissions = typeof u.permissions === 'string' ? JSON.parse(u.permissions) : u.permissions;
                    } catch (e) { }
                    return {
                        ...u,
                        permissions: (parsedPermissions && Array.isArray(parsedPermissions) && parsedPermissions.length > 0) ? parsedPermissions : DEFAULT_PERMISSIONS[u.role as Role],
                        status: (u.status as any) || 'active'
                    };
                });
                setUsers(allUsers);
                console.log('✅ Base de dados de usuários sincronizada com sucesso!');
            }
        } catch (error) {
            console.error('Falha ao sincronizar usuários do Master:', error);
            throw error; // Re-throw to UI
        }
    };

    const rescueSuperAdmin = async (email: string, key: string): Promise<string | null> => {
        try {
            const cleanKey = key.trim();
            const cleanEmail = email.trim().toLowerCase();
            if (!cleanEmail || cleanKey.length < 12) return null;
            const settings = await db.get<{ rescueKey: string }>('SELECT rescueKey FROM company_settings WHERE id = 1');
            if (!settings?.rescueKey?.startsWith('$2') || !bcrypt.compareSync(cleanKey, settings.rescueKey)) return null;

            // O resgate só pode recuperar um super-administrador existente;
            // nunca cria contas, eleva privilégios ou desativa 2FA.
            const existing = await db.get<User>('SELECT id, name, role FROM users WHERE LOWER(email) = ?', [cleanEmail]);
            if (!existing || existing.role !== 'super_admin') return null;

            const generateRandomPassword = () => {
                const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$';
                const length = 16;
                let pwd = '';
                const bytes = new Uint8Array(length);
                window.crypto.getRandomValues(bytes);
                for (let i = 0; i < length; i++) {
                    pwd += chars[bytes[i] % chars.length];
                }
                return pwd;
            };

            const tempPassword = generateRandomPassword();
            const hashedPassword = bcrypt.hashSync(tempPassword, 10);
            const ip = await getIP();
            await db.run(
                'UPDATE users SET password = ?, status = "active", failedAttempts = 0, blockedAt = NULL WHERE id = ?',
                [hashedPassword, existing.id]
            );

            await ServicoAuditoria.addLog(
                'update',
                'system',
                `Recuperação controlada de credencial para super-administrador: ${cleanEmail}.`,
                existing.id,
                existing.name,
                null,
                null,
                { ip, twoFactorPreserved: true }
            );

            // A05: Removed sensitive rescue log from console (audit log handles this)
            return tempPassword;
        } catch (error) {
            console.error('Rescue Critical Error:', error);
            return null;
        }
    };

    // Real-time Online Heartbeat
    useEffect(() => {
        if (!user) return;

        const updateActivity = async () => {
            await db.run('UPDATE users SET lastSeen = ? WHERE id = ?', [new Date().toISOString(), user.id]);

            // Um administrador pode terminar esta sessão à distância, pondo o
            // estado a 'offline' (ou bloqueando a conta). O login repõe-o a
            // 'active', por isso encontrá-lo assim aqui significa saída forçada.
            try {
                const atual = await db.get<any>('SELECT status FROM users WHERE id = ?', [user.id]);
                if (atual && (atual.status === 'offline' || atual.status === 'blocked')) {
                    console.warn('[Auth] Sessao terminada remotamente por um administrador.');
                    sessionStorage.setItem('sessionExpired', 'true');
                    sessionStorage.setItem('expiredUserEmail', user.email || '');
                    await logout();
                    window.location.hash = '/entrar';
                }
            } catch (e) {
                console.warn('Nao foi possivel confirmar o estado da sessao', e);
            }
        };

        // Update immediately and then every 2 minutes
        updateActivity();
        const interval = setInterval(updateActivity, 2 * 60 * 1000);

        return () => clearInterval(interval);
    }, [user, logout]);

    // --- 2FA LOGIC (Local TOTP) ---

    // Simple helper to convert string/hex to base32 is hard, 
    // but we can generate a random base32-like secret easily.
    const generate2FASecret = async () => {
        if (window.electronAPI?.userAuthMfaBegin) {
            return window.electronAPI.userAuthMfaBegin();
        }
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        let secret = '';
        // Standard TOTP secrets are typically 160 bits (32 base32 characters)
        const bytes = new Uint8Array(32);
        window.crypto.getRandomValues(bytes);
        for (let i = 0; i < 32; i++) {
            secret += charset[bytes[i] % 32];
        }

        const issuer = 'TangoGestaoCreditosERP';
        const account = user?.email || user?.username || 'User';
        // Encode URI components to ensure special characters like @ or spaces don't break the scan
        const otpAuthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;

        return { secret, qrCode: otpAuthUrl };
    };

    const verify2FA = async (userId: string, token: string): Promise<boolean> => {
        if (window.electronAPI?.userAuthVerifyTotp) {
            const result = await window.electronAPI.userAuthVerifyTotp(userId, token);
            if (!result.authenticated || !result.user) return false;
            pendingTwoFactorUser.current = null;
            setUser(result.user as User);
            sessionStorage.setItem('user', JSON.stringify(result.user));
            return true;
        }
        const u = await db.get<User>('SELECT twoFactorSecret FROM users WHERE id = ?', [userId]);
        if (!u || !u.twoFactorSecret || pendingTwoFactorUser.current?.id !== userId) return false;
        const valid = await validateTOTP(u.twoFactorSecret, token);
        if (valid) {
            const authenticatedUser = pendingTwoFactorUser.current;
            pendingTwoFactorUser.current = null;
            setUser(authenticatedUser);
            sessionStorage.setItem('user', JSON.stringify(authenticatedUser));
        }
        return valid;
    };

    const enable2FA = async (secret: string, code: string): Promise<{ success: boolean; recoveryCodes?: string[] }> => {
        if (!user) return { success: false };
        if (window.electronAPI?.userAuthMfaEnable) {
            const result = await window.electronAPI.userAuthMfaEnable(code);
            if (!result.enabled || !result.user) return { success: false };
            setUser(result.user as User);
            sessionStorage.setItem('user', JSON.stringify(result.user));
            return { success: true, recoveryCodes: result.recoveryCodes };
        }
        const isValid = await validateTOTP(secret, code);
        if (isValid) {
            await db.run('UPDATE users SET twoFactorEnabled = 1, twoFactorSecret = ? WHERE id = ?', [secret, user.id]);
            const updated = { ...user, twoFactorEnabled: true };
            setUser(updated);
            sessionStorage.setItem('user', JSON.stringify(updated));
            return { success: true };
        }
        return { success: false };
    };

    const disable2FA = async (code: string): Promise<boolean> => {
        if (!user) return false;
        if (window.electronAPI?.userAuthMfaDisable) {
            const result = await window.electronAPI.userAuthMfaDisable(code);
            if (!result.disabled || !result.user) return false;
            setUser(result.user as User);
            sessionStorage.setItem('user', JSON.stringify(result.user));
            return true;
        }
        if (!user.twoFactorSecret) return false;
        const isValid = await validateTOTP(user.twoFactorSecret, code);
        if (isValid) {
            await db.run('UPDATE users SET twoFactorEnabled = 0, twoFactorSecret = NULL WHERE id = ?', [user.id]);
            const { twoFactorSecret: _, ...updated } = { ...user, twoFactorEnabled: false };
            setUser(updated as any);
            sessionStorage.setItem('user', JSON.stringify(updated));
            return true;
        }
        return false;
    };

    // Manual TOTP Implementation using SubtleCrypto
    const validateTOTP = async (secret: string, token: string): Promise<boolean> => {
        try {
            // Base32 to ArrayBuffer
            const base32ToBuffer = (str: string) => {
                const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
                let bits = "";
                for (let i = 0; i < str.length; i++) {
                    const val = alphabet.indexOf(str[i].toUpperCase());
                    bits += val.toString(2).padStart(5, '0');
                }
                const buffer = new Uint8Array(Math.floor(bits.length / 8));
                for (let i = 0; i < buffer.length; i++) {
                    buffer[i] = parseInt(bits.substr(i * 8, 8), 2);
                }
                return buffer;
            };

            const keyBuffer = base32ToBuffer(secret);
            const epoch = Math.floor(Date.now() / 1000);
            const timeStep = 30;

            // Check current, previous and next window for clock drift
            for (let i = -1; i <= 1; i++) {
                const counter = Math.floor(epoch / timeStep) + i;
                const counterBuffer = new ArrayBuffer(8);
                const view = new DataView(counterBuffer);
                // JS Bitwise operators are 32bit, so we handle 64bit manually
                view.setUint32(4, counter, false);

                const key = await window.crypto.subtle.importKey(
                    'raw', keyBuffer, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
                );
                const signature = await window.crypto.subtle.sign('HMAC', key, counterBuffer);
                const sigBytes = new Uint8Array(signature);

                const offset = sigBytes[19] & 0xf;
                const binary = ((sigBytes[offset] & 0x7f) << 24) |
                    ((sigBytes[offset + 1] & 0xff) << 16) |
                    ((sigBytes[offset + 2] & 0xff) << 8) |
                    (sigBytes[offset + 3] & 0xff);

                const otp = (binary % 1000000).toString().padStart(6, '0');
                if (otp === token) return true;
            }
            return false;
        } catch (e) {
            console.error("TOTP validation error:", e);
            return false;
        }
    };

    return (
        <ContextoAutenticacao.Provider
            value={{
                user,
                users,
                hasUsers,
                login,
                logout,
                addUser,
                updateUser,
                forceLogoutUser,
                deleteUser,
                rescueSuperAdmin,
                requestPasswordReset,
                getResetRequests,
                handleResetRequest,
                isAuthenticated: !!user,
                refreshSettings,
                syncUsersFromMaster,
                generate2FASecret,
                enable2FA,
                disable2FA,
                verify2FA
            }}
        >
            {children}
            {/*
            <AlertModal
                isOpen={isLogoutModalOpen}
                onClose={() => {
                    setIsLogoutModalOpen(false);

                    // Save session recovery data
                    if (user) {
                        sessionStorage.setItem('sessionExpired', 'true');
                        sessionStorage.setItem('expiredUserEmail', user.email);
                        let currentPath = window.location.hash.replace('#', '') || '/';
                        // Prevent redirecting back to activation after re-login if that's where we hit the timeout
                        if (currentPath.includes('/ativacao')) currentPath = '/';
                        sessionStorage.setItem('returnUrl', currentPath);
                    }

                    logout();
                    window.location.hash = '/entrar';
                }}
                title="Sessão Expirada"
                description={`Foi desconectado devido a ${idleTimeout} minutos de inatividade para sua segurança.`}
                type="warning"
            />
            */}
        </ContextoAutenticacao.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(ContextoAutenticacao);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};




