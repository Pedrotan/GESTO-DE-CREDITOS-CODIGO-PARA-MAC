import { getCloudBaseUrl, getKnownCloudServers } from './ServicoLigacaoNuvem';
import { RepositorioDefinicoesEmpresa } from '@/repositorios/RepositorioDefinicoesEmpresa';

export type CompanyStatus = 'ACTIVE' | 'PENDING' | 'NOT_FOUND' | 'BLOCKED' | 'EXPIRED';

export interface CompanyBasicInfo {
  id: string;
  tenantId: string;
  name: string;
  logo?: string | null;
  isMultiTenant?: boolean;
}

export interface CompanyStatusResponse {
  success: boolean;
  status: CompanyStatus;
  company?: CompanyBasicInfo;
  companyName?: string;
  message?: string;
  code?: string;
  serverUrl?: string;
}

export interface ForgotPasswordResponse {
  success: boolean;
  message: string;
  devLink?: string;
}

export interface ResetPasswordResponse {
  success: boolean;
  message: string;
}

export interface CentralLoginResponse {
  success: boolean;
  token?: string;
  user?: {
    email: string;
    name: string;
    role: string;
  };
  syncCredentials?: {
    tenantId: string | null;
    authorizedAt: string;
  };
  message?: string;
}

/**
 * Normaliza o identificador fornecido (NIF, E-mail ou Código Único).
 */
export const normalizeIdentifier = (input: string): string => {
  return String(input || '').trim();
};

/**
 * Passo 1: Verificação Inicial da Empresa no Tango Master Gen.
 * Executa requisição com suporte mútuo a VPS Hostinger e Vercel Cloud em cascata.
 */
export const checkCompanyStatus = async (identificador: string): Promise<CompanyStatusResponse> => {
  const rawId = normalizeIdentifier(identificador);
  if (!rawId) {
    throw new Error('Por favor, indique o NIF, E-mail de Registo ou Código Único da empresa.');
  }

  const encodedId = encodeURIComponent(rawId);
  const servers = getKnownCloudServers();

  let lastError: Error | null = null;
  let notFoundResponse: CompanyStatusResponse | null = null;

  for (const baseUrl of servers) {
    let response: Response | null = null;
    let data: any = null;

    // 1. Tentar GET /api/v1/companies/status/{identificador}
    try {
      response = await fetch(`${baseUrl}/api/v1/companies/status/${encodedId}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8_000),
      });
      if (response.ok || response.status === 403) {
        data = await response.json().catch(() => ({}));
      } else {
        response = null;
      }
    } catch {
      response = null;
    }

    // 2. Tentar GET /api/company-status?id={identificador}
    if (!response) {
      try {
        response = await fetch(`${baseUrl}/api/company-status?id=${encodedId}`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(8_000),
        });
        if (response.ok || response.status === 403) {
          data = await response.json().catch(() => ({}));
        } else {
          response = null;
        }
      } catch {
        response = null;
      }
    }

    // 3. Tentar POST /api/company-status
    if (!response) {
      try {
        response = await fetch(`${baseUrl}/api/company-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identificador: rawId, nif: rawId }),
          signal: AbortSignal.timeout(8_000),
        });
        if (response.ok || response.status === 403) {
          data = await response.json().catch(() => ({}));
        }
      } catch (postErr: any) {
        lastError = postErr;
        continue;
      }
    }

    if (!response) continue;

    // HTTP 403 (BLOCKED / EXPIRED)
    if (response.status === 403) {
      return {
        success: false,
        status: (data.status || 'BLOCKED').toUpperCase() as CompanyStatus,
        message: data.message || 'Acesso suspenso ou expirado no Tango Master Gen.',
        code: data.code,
        serverUrl: baseUrl,
      };
    }

    if (!response.ok && response.status !== 400 && response.status !== 409) {
      lastError = new Error(data.message || `Erro ao validar empresa no servidor central (${response.status})`);
      continue;
    }

    const rawStatus = (data.status || (data.code === 'ALREADY_ACTIVE' ? 'ACTIVE' : 'NOT_FOUND')).toUpperCase();

    // Se encontramos a empresa ACTIVE ou PENDING neste servidor, retornamos imediatamente!
    if (rawStatus === 'ACTIVE' || rawStatus === 'PENDING') {
      return {
        success: Boolean(data.success),
        status: rawStatus as CompanyStatus,
        company: data.company,
        companyName: data.companyName || data.company?.name,
        message: data.message,
        code: data.code,
        serverUrl: baseUrl,
      };
    }

    // Se foi NOT_FOUND, guardamos como candidato e tentamos o próximo servidor da lista (ex: VPS -> Vercel)
    notFoundResponse = {
      success: Boolean(data.success),
      status: 'NOT_FOUND' as CompanyStatus,
      company: data.company,
      companyName: data.companyName || data.company?.name,
      message: data.message,
      code: data.code,
      serverUrl: baseUrl,
    };
  }

  if (notFoundResponse) {
    return notFoundResponse;
  }

  if (lastError) {
    throw new Error(
      lastError?.name === 'TimeoutError'
        ? 'O servidor central demorou muito a responder. Verifique a sua ligação à Internet.'
        : 'Não foi possível comunicar com o Tango Master Gen nem com o servidor da VPS. Verifique a sua ligação à Internet.'
    );
  }

  throw new Error('Sem resposta dos servidores centrais Tango Master Gen.');
};

/**
 * Verifica se a empresa já está ativada e aprovada no estado local (Single Source of Truth sincronizado).
 */
export const isCompanyActiveLocally = (): boolean => {
  if (typeof localStorage === 'undefined') return false;
  const status = localStorage.getItem('tango_company_status');
  if (status === 'ACTIVE') return true;

  const isAuth = localStorage.getItem('tango_active_tenant_authorized') === 'true';
  const tenantId = localStorage.getItem('tango_active_tenant_id');
  return Boolean(isAuth && tenantId);
};

/**
 * Regista a empresa como ativa no estado local e grava apenas configurações não-sensíveis no SQLite.
 */
export const markCompanyActive = async (company: CompanyBasicInfo): Promise<void> => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('tango_company_status', 'ACTIVE');
    localStorage.setItem('tango_active_tenant_authorized', 'true');
    localStorage.setItem('tango_active_tenant_id', company.tenantId || company.id);
    localStorage.setItem('tango_active_tenant_name', company.name);
  }

  try {
    const existing = await RepositorioDefinicoesEmpresa.findById(1);
    if (existing) {
      await RepositorioDefinicoesEmpresa.update(
        1,
        `UPDATE company_settings 
         SET name = ?, nif = ?, logo = COALESCE(?, logo), enableMultiTenant = COALESCE(?, enableMultiTenant) 
         WHERE id = 1`,
        [company.name, company.tenantId || company.id, company.logo || null, company.isMultiTenant ? 1 : 0]
      );
    }
  } catch (err) {
    console.warn('[ServicoIdentidadeEmpresa] Erro ao gravar dados básicos no SQLite:', err);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('tango_tenant_authorized'));
    window.dispatchEvent(new Event('tango_company_status_changed'));
  }
};

/**
 * Submissão blindada do formulário de onboarding para o servidor central.
 * Rejeita com erro EMPRESA_JA_ATIVA se o ID já estiver ACTIVE no Tango Master Gen.
 */
export const submitOnboardingCentral = async (onboardingData: Record<string, unknown>): Promise<any> => {
  const baseUrl = getCloudBaseUrl();
  const response = await fetch(`${baseUrl}/api/v1/companies/onboarding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(onboardingData),
    signal: AbortSignal.timeout(20_000),
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 409 || response.status === 403 || data.error === 'EMPRESA_JA_ATIVA' || data.code === 'ALREADY_ACTIVE') {
    const err = new Error(
      data.message || 'Esta empresa já se encontra registada e ativa no Tango Master Gen. Acesso ao Onboarding bloqueado.'
    );
    (err as any).code = 'EMPRESA_JA_ATIVA';
    (err as any).status = 409;
    throw err;
  }

  if (!response.ok) {
    throw new Error(data.message || `Erro ao submeter onboarding no servidor central (${response.status})`);
  }

  return data;
};

/**
 * Passo Oficial de Recuperação de Senha: POST /api/v1/auth/forgot-password
 * Gera Token criptográfico único e temporário (máx 15 min). Nunca envia senhas em texto limpo.
 */
export const requestPasswordReset = async (email: string): Promise<ForgotPasswordResponse> => {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Por favor, insira um endereço de e-mail válido.');
  }

  const baseUrl = getCloudBaseUrl();
  const response = await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cleanEmail }),
    signal: AbortSignal.timeout(15_000),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Não foi possível solicitar a recuperação de senha.');
  }

  return {
    success: true,
    message: data.message || 'Link de recuperação seguro enviado por e-mail com validade de 15 minutos.',
    devLink: data.devLink,
  };
};

/**
 * Validação de Token e Redefinição de Senha Segura: POST /api/v1/auth/reset-password
 */
export const resetPasswordWithToken = async (token: string, newPassword: string): Promise<ResetPasswordResponse> => {
  const cleanToken = token.trim();
  if (!cleanToken) {
    throw new Error('Token de recuperação inválido ou ausente.');
  }

  if (newPassword.length < 8) {
    throw new Error('A nova senha deve ter no mínimo 8 caracteres.');
  }
  if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    throw new Error('A nova senha deve conter pelo menos uma letra maiúscula, uma minúscula e um número.');
  }

  const baseUrl = getCloudBaseUrl();
  const response = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: cleanToken, newPassword }),
    signal: AbortSignal.timeout(15_000),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Não foi possível redefinir a senha.');
  }

  return {
    success: true,
    message: data.message || 'Senha redefinida com sucesso no Tango Master Gen.',
  };
};

/**
 * Autenticação Central: POST /api/v1/auth/login
 */
export const authenticateCentralLogin = async (credentials: {
  email: string;
  password: string;
  tenantId?: string;
}): Promise<CentralLoginResponse> => {
  const baseUrl = getCloudBaseUrl();
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
    signal: AbortSignal.timeout(15_000),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Credenciais de login inválidas.');
  }

  return data;
};
