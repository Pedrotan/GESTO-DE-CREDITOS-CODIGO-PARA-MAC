import model from './modelo-contrato-software.json';

export type SoftwareContract = {
    id: string; number: string; title: string; client: string; nif: string; software: string;
    updatedAt: string; sections: { id: string; title: string; body: string }[];
    design?: ContractDesign;
};
export type ContractDesign = { primary:string; accent:string; text:string; paper:string; company:string; tagline:string; contacts:string; address:string; logo?:string; style?:'ribbon' };
export const DEFAULT_CONTRACT_DESIGN:ContractDesign={primary:'#13384b',accent:'#f58a00',text:'#333333',paper:'#ffffff',company:'DIGITAL NORTE',tagline:'Tango Gestão de Créditos',contacts:'',address:'',style:'ribbon'};
export function contractDesign(c:SoftwareContract):ContractDesign{
    const design={...DEFAULT_CONTRACT_DESIGN,...c.design};
    if(!c.design?.style && c.design?.primary==='#262626' && c.design?.accent==='#666666')return {...design,primary:DEFAULT_CONTRACT_DESIGN.primary,accent:DEFAULT_CONTRACT_DESIGN.accent};
    return design;
}
export function newSoftwareContract(): SoftwareContract {
    return { id: crypto.randomUUID(), number: '', title: 'Contrato de Licenciamento e Venda de Software', client: '', nif: '', software: 'Tango Gestão de Créditos', updatedAt: new Date().toISOString(), sections: model.sections.map(section => ({ ...section })) };
}
export function contractText(text: string, contract: SoftwareContract) {
    const fields: Record<string,string> = {software:contract.software,cliente:contract.client || '[DENOMINAÇÃO DO CLIENTE]',nif:contract.nif || '[NIF DO CLIENTE]',numero:contract.number || '[NÚMERO DO CONTRATO]'};
    return text.replace(/\{\{(software|cliente|nif|numero)\}\}/g,(_,key:string)=>fields[key]);
}
export function validateSoftwareContract(value: unknown): value is SoftwareContract {
    const c = value as SoftwareContract;
    if(c?.design?.style!==undefined && c.design.style!=='ribbon')return false;
    if(c?.design?.logo!==undefined && (typeof c.design.logo!=='string' || (c.design.logo!=='' && !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(c.design.logo))))return false;
    if(c?.design!==undefined && (!c.design || !['primary','accent','text','paper'].every(k=>/^#[0-9a-f]{6}$/i.test(c.design![k as keyof ContractDesign])) || !['company','tagline','contacts','address'].every(k=>typeof c.design![k as keyof ContractDesign]==='string')))return false;
    return !!c && ['id','number','title','client','nif','software','updatedAt'].every(key => typeof c[key as keyof SoftwareContract] === 'string') && Array.isArray(c.sections) && c.sections.length > 0 && c.sections.length <= 100 && c.sections.every(s => typeof s.id === 'string' && typeof s.title === 'string' && typeof s.body === 'string') && new Set(c.sections.map(s => s.id)).size === c.sections.length;
}
