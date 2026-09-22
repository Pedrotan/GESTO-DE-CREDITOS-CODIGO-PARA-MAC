import { useState, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { validatePasswordStrength, getPasswordRequirements } from '@/bibliotecas/password-validator';
import { Progress } from '@/componentes/ui/progress';

interface PasswordStrengthIndicatorProps {
    password: string;
    showRequirements?: boolean;
}

export function PasswordStrengthIndicator({ password, showRequirements = true }: PasswordStrengthIndicatorProps) {
    const [strength, setStrength] = useState(validatePasswordStrength(''));

    useEffect(() => {
        setStrength(validatePasswordStrength(password));
    }, [password]);

    const requirements = getPasswordRequirements();

    if (!password) return null;

    return (
        <div className="space-y-3 mt-2">
            {/* Progress Bar */}
            <div className="space-y-1">
                <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-muted-foreground">Força da Senha:</span>
                    <span className="text-xs font-bold" style={{ color: strength.color }}>
                        {strength.label}
                    </span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div
                        className="h-full transition-all duration-300 ease-out"
                        style={{
                            width: `${strength.score}%`,
                            backgroundColor: strength.color,
                        }}
                    />
                </div>
            </div>

            {/* Requirements Checklist */}
            {showRequirements && (
                <div className="space-y-1.5 bg-muted/30 p-3 rounded-lg border border-border/50">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                        Requisitos de Segurança:
                    </p>
                    {requirements.map((req) => {
                        const isMet = strength.checks[req.key];
                        return (
                            <div
                                key={req.id}
                                className={`flex items-center gap-2 text-xs transition-colors ${isMet ? 'text-green-600' : 'text-muted-foreground'
                                    }`}
                            >
                                {isMet ? (
                                    <Check className="h-3.5 w-3.5 flex-shrink-0" />
                                ) : (
                                    <X className="h-3.5 w-3.5 flex-shrink-0" />
                                )}
                                <span className={isMet ? 'font-medium' : ''}>{req.label}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

