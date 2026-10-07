export const APPROVAL_LIMITS_KEY='accounting_approval_limits';
export type ApprovalLimits={enabled:boolean;adminMinor:number;managerMinor:number;superAdminMinor:number};
export const DEFAULT_APPROVAL_LIMITS:ApprovalLimits={enabled:false,adminMinor:0,managerMinor:0,superAdminMinor:0};
export function parseApprovalLimits(value:string|null|undefined):ApprovalLimits {
    if(!value)return {...DEFAULT_APPROVAL_LIMITS};
    const parsed=JSON.parse(value);
    if(typeof parsed.enabled!=='boolean' || ['adminMinor','managerMinor','superAdminMinor'].some(k=>!Number.isSafeInteger(parsed[k]) || parsed[k]<0))throw new Error('Configuração de limites de aprovação inválida.');
    return parsed;
}
export function assertApprovalLimit(config:ApprovalLimits,role:string,principalMinor:number) {
    if(!['admin','super_admin','manager'].includes(role))throw new Error('O perfil não pode decidir créditos.');
    if(!Number.isSafeInteger(principalMinor) || principalMinor<=0)throw new Error('Capital inválido.');
    const limit=role==='super_admin'?config.superAdminMinor:role==='admin'?config.adminMinor:config.managerMinor;
    if(config.enabled && principalMinor>limit)throw new Error('O capital excede o limite de aprovação do perfil. Encaminhe para um perfil com limite superior.');
}