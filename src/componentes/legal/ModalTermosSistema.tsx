import { useEffect, useState } from 'react';
import { FileText, ShieldCheck } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Checkbox } from '@/componentes/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { cn } from '@/bibliotecas/utils';
import { isPublicWebBuild } from '@/bibliotecas/ambiente';
import { isCompanyActiveLocally } from '@/servicos/ServicoIdentidadeEmpresa';
import {
    SYSTEM_PRIVACY_POLICY, SYSTEM_TERMS_OF_USE, SYSTEM_TERMS_UPDATED_AT, SYSTEM_TERMS_VERSION,
    acceptSystemTerms, hasAcceptedSystemTerms, type SystemTermsSection,
} from '@/bibliotecas/termos-sistema';

type Tab = 'termos' | 'privacidade';

// Na web, enquanto o portal da empresa (NIF e Código de Acesso) cobre o login, o modal não pode abrir:
// ficaria escondido por baixo e, sendo modal, bloquearia os cliques no portal.
const companyPortalVisible = () => isPublicWebBuild && !isCompanyActiveLocally()
    && localStorage.getItem('tango_active_tenant_authorized') !== 'true';

const Sections = ({ sections }: { sections: SystemTermsSection[] }) => (
    <div className="space-y-4">
        {sections.map(section => (
            <section key={section.title} className="space-y-1.5">
                <h3 className="text-sm font-black text-slate-900">{section.title}</h3>
                {section.paragraphs.map((paragraph, index) => (
                    <p key={index} className="text-[13px] leading-relaxed text-slate-600">{paragraph}</p>
                ))}
            </section>
        ))}
    </div>
);

/**
 * Termos de Utilização e Política de Privacidade no ecrã de login. Não fecha por clique fora, tecla Esc ou
 * botão de fechar: só depois de o utilizador confirmar que leu e aceita. Volta a aparecer quando a versão muda.
 */
export function ModalTermosSistema() {
    const [pending, setPending] = useState(() => !hasAcceptedSystemTerms());
    const [portalVisible, setPortalVisible] = useState(companyPortalVisible);
    useEffect(() => {
        const refresh = () => setPortalVisible(companyPortalVisible());
        window.addEventListener('tango_tenant_authorized', refresh);
        window.addEventListener('storage', refresh);
        return () => {
            window.removeEventListener('tango_tenant_authorized', refresh);
            window.removeEventListener('storage', refresh);
        };
    }, []);
    const open = pending && !portalVisible;
    const [tab, setTab] = useState<Tab>('termos');
    const [agreed, setAgreed] = useState(false);

    const accept = () => {
        if (!agreed) return;
        acceptSystemTerms();
        setPending(false);
    };

    return (
        <Dialog open={open} onOpenChange={() => undefined}>
            <DialogContent
                className="flex max-h-[92vh] flex-col gap-0 overflow-hidden border-none bg-white p-0 shadow-2xl sm:max-w-[640px] [&>button]:hidden"
                onPointerDownOutside={event => event.preventDefault()}
                onInteractOutside={event => event.preventDefault()}
                onEscapeKeyDown={event => event.preventDefault()}
            >
                <DialogHeader className="space-y-1 bg-gradient-to-br from-blue-700 to-indigo-700 px-6 py-5 text-left text-white">
                    <DialogTitle className="flex items-center gap-2 text-xl font-black text-white">
                        <ShieldCheck className="h-5 w-5" /> Termos de Utilização e Política de Privacidade
                    </DialogTitle>
                    <DialogDescription className="text-xs text-white/80">
                        Leia e aceite para continuar · Versão {SYSTEM_TERMS_VERSION}, actualizada a {SYSTEM_TERMS_UPDATED_AT}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex gap-1 border-b border-slate-200 px-6 pt-3" role="tablist">
                    {([['termos', 'Termos de Utilização'], ['privacidade', 'Política de Privacidade']] as const).map(([id, label]) => (
                        <button
                            key={id}
                            type="button"
                            role="tab"
                            aria-selected={tab === id}
                            onClick={() => setTab(id)}
                            className={cn('-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-bold transition-colors',
                                tab === id ? 'border-blue-700 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800')}
                        >
                            <FileText className="h-3.5 w-3.5" /> {label}
                        </button>
                    ))}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5" role="tabpanel">
                    <Sections sections={tab === 'termos' ? SYSTEM_TERMS_OF_USE : SYSTEM_PRIVACY_POLICY} />
                </div>

                <div className="space-y-4 border-t border-slate-200 bg-slate-50 px-6 py-4">
                    <label className="flex cursor-pointer items-start gap-3 text-[13px] font-semibold text-slate-700">
                        <Checkbox checked={agreed} onCheckedChange={value => setAgreed(value === true)} className="mt-0.5" />
                        Li e aceito os Termos de Utilização e a Política de Privacidade do sistema.
                    </label>
                    <Button className="w-full" disabled={!agreed} onClick={accept}>Aceitar e continuar</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
