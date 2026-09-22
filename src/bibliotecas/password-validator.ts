export interface PasswordStrength {
    score: number; // 0-100
    level: 'weak' | 'medium' | 'good' | 'strong';
    color: string;
    label: string;
    checks: {
        minLength: boolean;
        hasUppercase: boolean;
        hasLowercase: boolean;
        hasNumber: boolean;
        hasSpecialChar: boolean;
    };
}

export function validatePasswordStrength(password: string): PasswordStrength {
    const checks = {
        minLength: password.length >= 8,
        hasUppercase: /[A-Z]/.test(password),
        hasLowercase: /[a-z]/.test(password),
        hasNumber: /[0-9]/.test(password),
        hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password),
    };

    // Calculate score based on criteria
    let score = 0;

    // Length scoring (0-40 points)
    if (password.length >= 8) score += 20;
    if (password.length >= 10) score += 10;
    if (password.length >= 12) score += 10;

    // Criteria scoring (15 points each, 60 total)
    if (checks.hasUppercase) score += 15;
    if (checks.hasLowercase) score += 15;
    if (checks.hasNumber) score += 15;
    if (checks.hasSpecialChar) score += 15;

    // Determine level and color
    let level: 'weak' | 'medium' | 'good' | 'strong';
    let color: string;
    let label: string;

    if (score < 40) {
        level = 'weak';
        color = 'rgb(239, 68, 68)'; // red-500
        label = 'Fraca';
    } else if (score < 60) {
        level = 'medium';
        color = 'rgb(249, 115, 22)'; // orange-500
        label = 'Média';
    } else if (score < 80) {
        level = 'good';
        color = 'rgb(234, 179, 8)'; // yellow-500
        label = 'Boa';
    } else {
        level = 'strong';
        color = 'rgb(34, 197, 94)'; // green-500
        label = 'Forte';
    }

    return {
        score,
        level,
        color,
        label,
        checks,
    };
}

export function getPasswordRequirements() {
    return [
        { id: 'minLength', label: 'Mínimo 8 caracteres', key: 'minLength' as const },
        { id: 'hasUppercase', label: 'Pelo menos 1 letra maiúscula (A-Z)', key: 'hasUppercase' as const },
        { id: 'hasLowercase', label: 'Pelo menos 1 letra minúscula (a-z)', key: 'hasLowercase' as const },
        { id: 'hasNumber', label: 'Pelo menos 1 número (0-9)', key: 'hasNumber' as const },
        { id: 'hasSpecialChar', label: 'Pelo menos 1 caractere especial (!@#$%...)', key: 'hasSpecialChar' as const },
    ];
}




