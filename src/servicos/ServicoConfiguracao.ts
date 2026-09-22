import { RepositorioDefinicoesEmpresa } from '@/repositorios/RepositorioDefinicoesEmpresa';
import { CompanySettings } from '@/tipos/base-dados';
import bcrypt from 'bcryptjs';

export class ServicoConfiguracao {
    static async getSettings(): Promise<any | null> {
        return await RepositorioDefinicoesEmpresa.findById(1);
    }

    static async updateSettings(updates: Partial<CompanySettings>, currentSettings: CompanySettings): Promise<{ newSettings: CompanySettings, changes: string[] }> {
        const newSettings = { ...currentSettings, ...updates };
        const changes: string[] = [];

        if (updates.rescueKey && updates.rescueKey !== "********************" && !updates.rescueKey.startsWith('$2')) {
            const isSame = currentSettings.rescueKey ? bcrypt.compareSync(updates.rescueKey.trim(), currentSettings.rescueKey) : false;
            if (!isSame) {
                newSettings.rescueKey = bcrypt.hashSync(updates.rescueKey.trim(), 10);
                changes.push('Chave de resgate alterada');
            } else {
                newSettings.rescueKey = currentSettings.rescueKey;
            }
        }

        const safeStr = (v: any) => typeof v === 'string' ? v : JSON.stringify(v || []);

        // Use INSERT OR REPLACE instead of UPDATE to ensure the record always exists
        const sql = `
            INSERT OR REPLACE INTO company_settings (
                id, name, nif, address, logo, reportLogo, watermarkLogo, 
                currency, customClauses, rescueKey, phone, primaryColor, 
                secondaryColor, email, whatsapp, whatsappAutoNotify, 
                whatsappVerified, syncEnabled, syncUrl, syncApiKey, 
                syncPasskey, lastSync, maintenanceMode, sessionTimeout, 
                allowedModulesDuringMaintenance, enableGatewaysModule, 
                enableProfileActivity, digitalSignatureEnabled, 
                authorizedSigners, bankingInfo, contractTemplates, 
                lastBackupDate, installDate, financialLock, licenseKey,
                enableGatewaysModuleAdminOnly, enableProfileActivityAdminOnly,
                enableWarrantiesModule, enableWarrantiesModuleAdminOnly,
                enableLegalModule, enableLegalModuleAdminOnly,
                enableScoringModule, enableScoringModuleAdminOnly, location,
                enableSuppliersModule, enableSuppliersModuleAdminOnly, enableMultiTenant
            ) VALUES (
                1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        `;

        const params = [
            newSettings.name,
            newSettings.nif ?? null,
            newSettings.address ?? null,
            newSettings.logo ?? null,
            newSettings.reportLogo ?? null,
            newSettings.watermarkLogo ?? null,
            newSettings.currency ?? 'AOA',
            newSettings.customClauses ?? '[]',
            newSettings.rescueKey ?? null,
            newSettings.phone ?? null,
            safeStr(newSettings.primaryColor),
            safeStr(newSettings.secondaryColor),
            newSettings.email ?? null,
            newSettings.whatsapp ?? null,
            newSettings.whatsappAutoNotify ? 1 : 0,
            newSettings.whatsappVerified ? 1 : 0,
            newSettings.syncEnabled ? 1 : 0,
            newSettings.syncUrl ?? null,
            newSettings.syncApiKey ?? null,
            newSettings.syncPasskey ?? null,
            newSettings.lastSync ?? null,
            newSettings.maintenanceMode ? 1 : 0,
            newSettings.sessionTimeout ?? 5,
            safeStr(newSettings.allowedModulesDuringMaintenance),
            newSettings.enableGatewaysModule ? 1 : 0,
            newSettings.enableProfileActivity ? 1 : 0,
            newSettings.digitalSignatureEnabled ? 1 : 0,
            safeStr(newSettings.authorizedSigners),
            safeStr(newSettings.bankingInfo),
            safeStr(newSettings.contractTemplates),
            newSettings.lastBackupDate ?? null,
            newSettings.installDate ?? null,
            newSettings.financialLock ? 1 : 0,
            newSettings.licenseKey ?? null,
            newSettings.enableGatewaysModuleAdminOnly ? 1 : 0,
            newSettings.enableProfileActivityAdminOnly ? 1 : 0,
            newSettings.enableWarrantiesModule ? 1 : 0,
            newSettings.enableWarrantiesModuleAdminOnly ? 1 : 0,
            newSettings.enableLegalModule ? 1 : 0,
            newSettings.enableLegalModuleAdminOnly ? 1 : 0,
            newSettings.enableScoringModule ? 1 : 0,
            newSettings.enableScoringModuleAdminOnly ? 1 : 0,
            newSettings.location ?? null,
            newSettings.enableSuppliersModule ? 1 : 0,
            newSettings.enableSuppliersModuleAdminOnly ? 1 : 0,
            newSettings.enableMultiTenant !== false ? 1 : 0
        ];

        try {
            console.log('💾 [ServicoConfiguracao] Salvando configurações da empresa...');
            await RepositorioDefinicoesEmpresa.update(1, sql, params);
            console.log('✅ [ServicoConfiguracao] Configurações salvas com sucesso!');
        } catch (error: any) {
            console.error('❌ [ServicoConfiguracao] Erro ao salvar configurações:', error);

            // Diagnóstico detalhado
            console.error('   - SQL:', sql.substring(0, 100) + '...');
            console.error('   - Params:', params.slice(0, 5), '...');
            console.error('   - Error Message:', error.message);

            throw new Error(`Falha ao salvar configurações da empresa: ${error.message}`);
        }

        return { newSettings, changes };
    }
}




