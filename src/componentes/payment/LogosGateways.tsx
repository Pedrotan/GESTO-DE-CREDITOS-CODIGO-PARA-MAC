import React from 'react';

interface GatewayLogoProps {
    provider?: string;
    className?: string;
    size?: number;
}

export const GatewayLogo: React.FC<GatewayLogoProps> = ({ provider, className = "h-8 w-8", size }) => {
    const style = size ? { width: size, height: size } : undefined;

    switch (provider) {
        case 'multicaixa_express':
            // Logotipo Oficial Multicaixa Express (EMIS)
            return (
                <svg
                    viewBox="0 0 120 120"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className={className}
                    style={style}
                >
                    <rect width="120" height="120" rx="24" fill="#002B49" />
                    {/* Faixa Superior com o M do Multicaixa */}
                    <path
                        d="M24 35C24 30.5817 27.5817 27 32 27H88C92.4183 27 96 30.5817 96 35V52H24V35Z"
                        fill="#005A9C"
                    />
                    <text
                        x="60"
                        y="44"
                        fill="#FFFFFF"
                        fontSize="13"
                        fontWeight="900"
                        fontFamily="Arial, sans-serif"
                        letterSpacing="1.5"
                        textAnchor="middle"
                    >
                        MULTICAIXA
                    </text>
                    {/* Bloco Inferior com Express e Setas Dinâmicas */}
                    <path
                        d="M24 52H96V85C96 89.4183 92.4183 93 88 93H32C27.5817 93 24 89.4183 24 85V52Z"
                        fill="#D71920"
                    />
                    <text
                        x="52"
                        y="76"
                        fill="#FFFFFF"
                        fontSize="18"
                        fontStyle="italic"
                        fontWeight="900"
                        fontFamily="Arial, sans-serif"
                        letterSpacing="0.5"
                    >
                        Express
                    </text>
                    {/* Setas Dinâmicas do Express */}
                    <path
                        d="M86 64L93 71L86 78"
                        stroke="#FFFFFF"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    <path
                        d="M79 64L86 71L79 78"
                        stroke="#FFFFFF"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity="0.6"
                    />
                </svg>
            );

        case 'emis_gpo':
            // Logotipo Oficial EMIS (Empresa de Serviços Interbancários)
            return (
                <svg
                    viewBox="0 0 120 120"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className={className}
                    style={style}
                >
                    <rect width="120" height="120" rx="24" fill="#0A1E3F" />
                    {/* Arcos Interbancários EMIS */}
                    <circle cx="60" cy="52" r="28" stroke="#1E40AF" strokeWidth="4" strokeDasharray="6 4" />
                    <path
                        d="M40 52C40 40.9543 48.9543 32 60 32C71.0457 32 80 40.9543 80 52"
                        stroke="#F97316"
                        strokeWidth="6"
                        strokeLinecap="round"
                    />
                    <path
                        d="M80 52C80 63.0457 71.0457 72 60 72C48.9543 72 40 63.0457 40 52"
                        stroke="#38BDF8"
                        strokeWidth="6"
                        strokeLinecap="round"
                    />
                    <circle cx="60" cy="52" r="8" fill="#F97316" />
                    <text
                        x="60"
                        y="96"
                        fill="#FFFFFF"
                        fontSize="15"
                        fontWeight="900"
                        fontFamily="Arial, sans-serif"
                        letterSpacing="3"
                        textAnchor="middle"
                    >
                        EMIS GPO
                    </text>
                </svg>
            );

        case 'proxypay':
            // Logotipo Oficial ProxyPay Angola
            return (
                <svg
                    viewBox="0 0 120 120"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className={className}
                    style={style}
                >
                    <rect width="120" height="120" rx="24" fill="#582C83" />
                    {/* Hexágono estilizado ProxyPay */}
                    <path
                        d="M60 22L88 38V70L60 86L32 70V38L60 22Z"
                        fill="#7B3FA8"
                    />
                    {/* Letra P geométrica vazada */}
                    <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M48 36H66C72.6274 36 78 41.3726 78 48C78 54.6274 72.6274 60 66 60H56V76H48V36ZM56 44V52H65C67.2091 52 69 50.2091 69 48C69 45.7909 67.2091 44 65 44H56Z"
                        fill="#00E5A3"
                    />
                    <text
                        x="60"
                        y="102"
                        fill="#FFFFFF"
                        fontSize="11"
                        fontWeight="800"
                        fontFamily="Arial, sans-serif"
                        letterSpacing="1.2"
                        textAnchor="middle"
                    >
                        ProxyPay
                    </text>
                </svg>
            );

        case 'appypay':
            // Logotipo Oficial AppyPay Angola
            return (
                <svg
                    viewBox="0 0 120 120"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className={className}
                    style={style}
                >
                    <rect width="120" height="120" rx="24" fill="#0B1D28" />
                    <circle cx="60" cy="50" r="32" fill="#00D26A" fillOpacity="0.15" />
                    {/* Símbolo de Loop de Pagamento Appy */}
                    <path
                        d="M44 64C38.4772 64 34 59.5228 34 54C34 46.268 40.268 40 48 40H66C73.732 40 80 46.268 80 54V64M68 40V72C68 76.4183 64.4183 80 60 80C55.5817 80 52 76.4183 52 72"
                        stroke="#00D26A"
                        strokeWidth="7"
                        strokeLinecap="round"
                    />
                    <circle cx="60" cy="54" r="5" fill="#00E5A3" />
                    <text
                        x="60"
                        y="99"
                        fill="#FFFFFF"
                        fontSize="13"
                        fontWeight="900"
                        fontFamily="Arial, sans-serif"
                        letterSpacing="1"
                        textAnchor="middle"
                    >
                        Appy<tspan fill="#00D26A">Pay</tspan>
                    </text>
                </svg>
            );

        case 'plinqpay':
            // Logotipo Oficial PlinqPay Angola
            return (
                <svg
                    viewBox="0 0 120 120"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className={className}
                    style={style}
                >
                    <rect width="120" height="120" rx="24" fill="#181926" />
                    <rect x="22" y="22" width="76" height="76" rx="20" fill="url(#plinq_grad)" />
                    {/* Símbolo P estilizado e Raio */}
                    <path
                        d="M44 38H63C70.1797 38 76 43.8203 76 51C76 58.1797 70.1797 64 63 64H53V78H44V38Z"
                        fill="#FFFFFF"
                    />
                    <path
                        d="M53 46V56H62C64.7614 56 67 53.7614 67 51C67 48.2386 64.7614 46 62 46H53Z"
                        fill="#FF4C30"
                    />
                    <path
                        d="M74 42L66 54H74L68 66"
                        stroke="#FFB800"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    <defs>
                        <linearGradient id="plinq_grad" x1="22" y1="22" x2="98" y2="98" gradientUnits="userSpaceOnUse">
                            <stop stopColor="#FF5722" />
                            <stop offset="1" stopColor="#E91E63" />
                        </linearGradient>
                    </defs>
                    <text
                        x="60"
                        y="108"
                        fill="#FFFFFF"
                        fontSize="11"
                        fontWeight="800"
                        fontFamily="Arial, sans-serif"
                        letterSpacing="0.8"
                        textAnchor="middle"
                    >
                        PlinqPay
                    </text>
                </svg>
            );

        case 'bayqi':
            // Logotipo Oficial BayQi Angola
            return (
                <svg
                    viewBox="0 0 120 120"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className={className}
                    style={style}
                >
                    <rect width="120" height="120" rx="24" fill="#E61E2A" />
                    {/* B estilizado BayQi com sacola e cartão */}
                    <rect x="36" y="32" width="12" height="48" rx="6" fill="#FFFFFF" />
                    <path
                        d="M48 32H64C72.8366 32 80 39.1634 80 48C80 54.2415 76.4357 59.6508 71.2163 62.3025C77.4589 64.8329 82 70.893 82 78C82 87.9411 73.9411 96 64 96H48"
                        stroke="#FFFFFF"
                        strokeWidth="10"
                        strokeLinecap="round"
                    />
                    <circle cx="62" cy="46" r="4" fill="#E61E2A" />
                    <circle cx="64" cy="74" r="4" fill="#E61E2A" />
                    <text
                        x="60"
                        y="108"
                        fill="#FFFFFF"
                        fontSize="13"
                        fontWeight="900"
                        fontFamily="Arial, sans-serif"
                        letterSpacing="1"
                        textAnchor="middle"
                    >
                        BayQi
                    </text>
                </svg>
            );

        case 'kamba':
            // Logotipo Oficial Kamba Pagamentos Angola
            return (
                <svg
                    viewBox="0 0 120 120"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className={className}
                    style={style}
                >
                    <rect width="120" height="120" rx="24" fill="#1C1C1E" />
                    <circle cx="60" cy="50" r="32" fill="#FFC700" />
                    {/* Letra K Dinâmica do Kamba */}
                    <path
                        d="M46 32V68"
                        stroke="#1C1C1E"
                        strokeWidth="8"
                        strokeLinecap="round"
                    />
                    <path
                        d="M72 34L50 51L74 68"
                        stroke="#1C1C1E"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    <text
                        x="60"
                        y="102"
                        fill="#FFC700"
                        fontSize="14"
                        fontWeight="900"
                        fontFamily="Arial, sans-serif"
                        letterSpacing="2"
                        textAnchor="middle"
                    >
                        KAMBA
                    </text>
                </svg>
            );

        case 'unitel_money':
            // Logotipo Oficial Unitel Money Angola
            return (
                <svg
                    viewBox="0 0 120 120"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className={className}
                    style={style}
                >
                    <rect width="120" height="120" rx="24" fill="#E60000" />
                    {/* Símbolo circular e ondas da Unitel */}
                    <circle cx="60" cy="46" r="26" fill="#FFFFFF" />
                    <path
                        d="M48 38L60 48L72 38M48 54L60 44L72 54"
                        stroke="#E60000"
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    <circle cx="60" cy="46" r="4" fill="#E60000" />
                    <text
                        x="60"
                        y="92"
                        fill="#FFFFFF"
                        fontSize="12"
                        fontWeight="900"
                        fontFamily="Arial, sans-serif"
                        letterSpacing="1"
                        textAnchor="middle"
                    >
                        UNITEL
                    </text>
                    <text
                        x="60"
                        y="106"
                        fill="#FFD700"
                        fontSize="11"
                        fontWeight="900"
                        fontFamily="Arial, sans-serif"
                        letterSpacing="1"
                        textAnchor="middle"
                    >
                        MONEY
                    </text>
                </svg>
            );

        case 'afrimoney':
            // Logotipo Oficial Afrimoney (Africell) Angola
            return (
                <svg
                    viewBox="0 0 120 120"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className={className}
                    style={style}
                >
                    <rect width="120" height="120" rx="24" fill="#58127A" />
                    {/* Círculo Africell com moeda/Afrimoney */}
                    <circle cx="60" cy="48" r="26" fill="#FF007A" />
                    <path
                        d="M50 56L60 38L70 56M54 50H66"
                        stroke="#FFFFFF"
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    <text
                        x="60"
                        y="94"
                        fill="#FFFFFF"
                        fontSize="11"
                        fontWeight="900"
                        fontFamily="Arial, sans-serif"
                        letterSpacing="0.8"
                        textAnchor="middle"
                    >
                        afri<tspan fill="#FF007A">money</tspan>
                    </text>
                </svg>
            );

        case 'bank_transfer':
        default:
            // Logotipo Oficial Transferência Bancária / Sistema Bancário Angolano (AO06)
            return (
                <svg
                    viewBox="0 0 120 120"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className={className}
                    style={style}
                >
                    <rect width="120" height="120" rx="24" fill="#04432C" />
                    {/* Fachada Bancária com Colunas em Ouro */}
                    <path
                        d="M60 26L30 42H90L60 26Z"
                        fill="#D4AF37"
                    />
                    <rect x="34" y="44" width="52" height="4" fill="#F3E5AB" />
                    {/* 4 Colunas */}
                    <rect x="36" y="50" width="7" height="22" rx="1" fill="#FFFFFF" />
                    <rect x="50" y="50" width="7" height="22" rx="1" fill="#FFFFFF" />
                    <rect x="63" y="50" width="7" height="22" rx="1" fill="#FFFFFF" />
                    <rect x="77" y="50" width="7" height="22" rx="1" fill="#FFFFFF" />
                    {/* Base */}
                    <rect x="30" y="74" width="60" height="6" rx="2" fill="#D4AF37" />
                    <rect x="26" y="81" width="68" height="4" rx="1" fill="#F3E5AB" />
                    <text
                        x="60"
                        y="103"
                        fill="#FFFFFF"
                        fontSize="11"
                        fontWeight="900"
                        fontFamily="Arial, sans-serif"
                        letterSpacing="1.2"
                        textAnchor="middle"
                    >
                        IBAN AO06
                    </text>
                </svg>
            );
    }
};
