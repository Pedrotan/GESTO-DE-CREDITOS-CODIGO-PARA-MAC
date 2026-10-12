import { activateCloudLicense, formatCloudLicenseKey, type CloudLicenseStatus } from '@/bibliotecas/licenca-nuvem-cliente';
import { getMachineId } from '@/bibliotecas/licenciamento';
import { getCloudBaseUrl } from '@/servicos/ServicoLigacaoNuvem';

export type ActivationResult = { success: boolean; key: string; status?: CloudLicenseStatus; code?: string; message?: string };

/**
 * Activa este computador com a chave da empresa (TANGO-…) no servidor da nuvem. O identificador antigo da
 * máquina segue também, para o servidor reconhecer o computador de uma licença antiga e não gastar outro lugar.
 */
export const activateThisComputer = async (key: string): Promise<ActivationResult> => {
    const legacyMachineId = await getMachineId().catch(() => '');
    const result = await activateCloudLicense(key, { serverUrl: getCloudBaseUrl(), legacyMachineId: legacyMachineId || undefined });
    return { ...(result as Omit<ActivationResult, 'key'>), key: formatCloudLicenseKey(key) };
};
