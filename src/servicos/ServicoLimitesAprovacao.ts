import { db } from '@/bibliotecas/bd';
import { APPROVAL_LIMITS_KEY,parseApprovalLimits,type ApprovalLimits } from '@/bibliotecas/limites-aprovacao';
export class ServicoLimitesAprovacao {
    static async load(){const row=await db.get<{value:string}>('SELECT value FROM shared_settings WHERE key = ?',[APPROVAL_LIMITS_KEY]);return parseApprovalLimits(row?.value);}
    static async save(config:ApprovalLimits,actor:{id:string;name:string;role:string}){
        if(!['admin','super_admin'].includes(actor.role))throw new Error('Configuração reservada a administradores.');
        parseApprovalLimits(JSON.stringify(config));const now=new Date().toISOString();
        await db.transaction([
            {sql:`INSERT INTO shared_settings (key, value, updatedAt, updatedBy) VALUES (?, ?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt, updatedBy = excluded.updatedBy
                WHERE excluded.updatedAt >= shared_settings.updatedAt`,params:[APPROVAL_LIMITS_KEY,JSON.stringify(config),now,actor.name]},
            {sql:`INSERT INTO audit_logs (id,timestamp,userId,userName,action,entity,details,metadata) VALUES (?,?,?,?,?,?,?,?)`,params:[crypto.randomUUID(),now,actor.id,actor.name,'update','system','Limites de aprovação por perfil alterados',JSON.stringify({approvalLimits:config})]}
        ]);
    }
}