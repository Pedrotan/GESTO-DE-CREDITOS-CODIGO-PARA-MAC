export type FeatureLicense = { isValid: boolean; readOnly?: boolean; tier?: string; features?: Record<string, unknown> };

export const allowsLicensedFeature = (license: FeatureLicense | null | undefined, feature: 'intranet' | 'multi_empresa') => {
    if (!license?.isValid || license.readOnly) return false;
    const explicit = license.features?.[feature];
    if (typeof explicit === 'boolean') return explicit;
    return false; // O escalão e o número de empresas não atribuem o módulo intranet.
};

export const canHostLocalServer = (desktop: boolean, license: FeatureLicense | null | undefined) =>
    desktop && allowsLicensedFeature(license, 'intranet');

export const assertLocalServerAccess = (desktop: boolean, license: FeatureLicense | null | undefined) => {
    if (!desktop) throw new Error('O Modo Servidor da rede local só pode ser ativado na aplicação desktop. Na web, a sincronização usa a VPS.');
    if (!allowsLicensedFeature(license, 'intranet')) throw new Error('O plano desta empresa não inclui uma licença válida para a rede local (intranet).');
};
