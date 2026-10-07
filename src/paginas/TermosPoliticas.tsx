import { useMemo, useState } from 'react';
import { BookOpenCheck, Building2, Calculator, Download, ExternalLink, Gavel, Landmark, Loader2, Scale, Search, ShieldCheck } from 'lucide-react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/componentes/ui/card';
import { Badge } from '@/componentes/ui/badge';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useToast } from '@/componentes/ui/use-toast';
import { useConfigSimulador } from '@/ganchos/usar-config-simulador';
import { getFileUrl } from '@/bibliotecas/utils';
import {
    LEGAL_DISCLAIMER, LEGAL_REFERENCES, LEGAL_SOURCE_NOTE, TERMS_UPDATED_AT, TERMS_VERSION,
    buildTermsArticles, legalContextFrom, simulationMethodology,
} from '@/bibliotecas/termos-legais';

const anchor = (number: number) => `artigo-${number}`;

/** Termos de Utilização e Políticas da empresa, com o enquadramento legal angolano aplicado pelo sistema. */
export default function TermosPoliticas() {
    const { companySettings } = useData();
    const { user } = useAuth();
    const { toast } = useToast();
    const { config } = useConfigSimulador();
    const [query, setQuery] = useState('');
    const [busy, setBusy] = useState(false);

    const legal = useMemo(() => legalContextFrom(companySettings, config), [companySettings, config]);
    const articles = useMemo(() => buildTermsArticles(legal), [legal]);
    const methodology = useMemo(() => simulationMethodology(legal), [legal]);
    const visible = useMemo(() => {
        const term = query.trim().toLowerCase();
        if (!term) return articles;
        return articles.filter(article => [article.title, ...article.paragraphs, ...(article.references || [])].join(' ').toLowerCase().includes(term));
    }, [articles, query]);

    const downloadPdf = async () => {
        setBusy(true);
        try {
            const { generateTermsPdf } = await import('@/bibliotecas/ficha-simulacao-pdf');
            await generateTermsPdf(legal, articles, companySettings, user?.name);
        } catch (error: any) {
            toast({ title: 'Não foi possível gerar o PDF', description: error?.message, variant: 'destructive' });
        } finally { setBusy(false); }
    };

    const logo = companySettings?.logo ? getFileUrl(companySettings.logo) : null;
    const address = [companySettings?.address, companySettings?.location].filter(Boolean).join(', ');

    return (
        <MainLayout title="Termos e Políticas" subtitle="Termos de utilização, políticas e legislação aplicável">
            <div className="space-y-6">
                <Card className="overflow-hidden border-none shadow-lg">
                    <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 text-white md:p-8">
                        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                            <div className="flex items-center gap-4">
                                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/10 ring-1 ring-white/20">
                                    {logo ? <img src={logo} alt="" className="h-full w-full object-contain p-1.5" /> : <Building2 className="h-8 w-8" />}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-300">Termos de utilização e políticas</p>
                                    <h1 className="truncate text-2xl font-black tracking-tight md:text-3xl">{legal.companyName}</h1>
                                    <p className="mt-1 text-sm text-slate-300">
                                        {[legal.nif && `NIF ${legal.nif}`, address].filter(Boolean).join(' · ') || 'Complete os dados da empresa em Configurações › Geral.'}
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-col items-start gap-3 md:items-end">
                                <div className="flex flex-wrap gap-2">
                                    <Badge className="bg-white/10 text-white hover:bg-white/10">Versão {TERMS_VERSION}</Badge>
                                    <Badge className="bg-white/10 text-white hover:bg-white/10">Actualizado a {TERMS_UPDATED_AT}</Badge>
                                    <Badge className="bg-orange-500 text-white hover:bg-orange-500">Lei angolana</Badge>
                                </div>
                                <Button variant="secondary" className="gap-2" disabled={busy} onClick={() => void downloadPdf()}>
                                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Descarregar PDF
                                </Button>
                            </div>
                        </div>
                    </div>
                    <CardContent className="grid gap-4 p-4 sm:grid-cols-3 md:p-6">
                        {[
                            { icon: Scale, title: `${articles.length} artigos`, text: 'Regras de utilização do sistema e da relação com os clientes.' },
                            { icon: Landmark, title: `${LEGAL_REFERENCES.length} diplomas`, text: 'Leis, Avisos e Instrutivos do BNA e do Diário da República.' },
                            { icon: Calculator, title: 'Simulador transparente', text: 'TAN, TAEG, MTIC, Imposto do Selo e taxa de esforço explicados.' },
                        ].map(item => (
                            <div key={item.title} className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4">
                                <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                                <div><p className="font-bold">{item.title}</p><p className="text-sm text-muted-foreground">{item.text}</p></div>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
                    <aside className="lg:sticky lg:top-4 lg:self-start">
                        <Card className="border-none shadow-md">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">Índice</CardTitle>
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Pesquisar nos termos…" className="h-9 pl-8" />
                                </div>
                            </CardHeader>
                            <CardContent className="max-h-[60vh] space-y-0.5 overflow-auto pt-0">
                                {articles.map(article => (
                                    <a key={article.number} href={`#${anchor(article.number)}`}
                                        onClick={event => { event.preventDefault(); document.getElementById(anchor(article.number))?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                                        className="flex gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                                        <span className="w-7 shrink-0 text-right font-mono text-xs font-bold text-primary">{article.number}.º</span>
                                        <span>{article.title}</span>
                                    </a>
                                ))}
                                <div className="my-2 border-t" />
                                <a href="#como-funciona" onClick={event => { event.preventDefault(); document.getElementById('como-funciona')?.scrollIntoView({ behavior: 'smooth' }); }} className="block rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">Como funciona o simulador</a>
                                <a href="#legislacao" onClick={event => { event.preventDefault(); document.getElementById('legislacao')?.scrollIntoView({ behavior: 'smooth' }); }} className="block rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">Legislação de referência</a>
                            </CardContent>
                        </Card>
                    </aside>

                    <div className="min-w-0 space-y-6">
                        <Card className="border-none shadow-md">
                            <CardContent className="space-y-8 p-6 md:p-8">
                                {visible.length === 0 && <p className="text-sm text-muted-foreground">Nenhum artigo contém «{query}».</p>}
                                {visible.map(article => (
                                    <section key={article.number} id={anchor(article.number)} className="scroll-mt-24">
                                        <div className="mb-3 flex items-baseline gap-3 border-b pb-2">
                                            <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-sm font-black text-primary">Artigo {article.number}.º</span>
                                            <h2 className="text-lg font-bold tracking-tight">{article.title}</h2>
                                        </div>
                                        <ol className="space-y-2.5">
                                            {article.paragraphs.map((text, index) => (
                                                <li key={index} className="flex gap-3 text-[15px] leading-relaxed text-foreground/90">
                                                    {article.paragraphs.length > 1 && <span className="mt-0.5 w-5 shrink-0 text-right text-sm font-bold text-muted-foreground">{index + 1}.</span>}
                                                    <p className="text-justify">{text}</p>
                                                </li>
                                            ))}
                                        </ol>
                                        {article.references?.length ? (
                                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                                <span className="text-xs font-semibold uppercase text-muted-foreground">Base legal</span>
                                                {article.references.map(reference => <Badge key={reference} variant="outline" className="font-normal">{reference}</Badge>)}
                                            </div>
                                        ) : null}
                                    </section>
                                ))}
                            </CardContent>
                        </Card>

                        <Card id="como-funciona" className="scroll-mt-24 border-none shadow-md">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5 text-primary" /> Como funciona o simulador</CardTitle>
                                <CardDescription>A mesma explicação acompanha cada Ficha de Simulação entregue ao cliente.</CardDescription>
                            </CardHeader>
                            <CardContent className="grid gap-3 md:grid-cols-2">
                                {methodology.map(item => (
                                    <div key={item.title} className="rounded-xl border bg-muted/20 p-4">
                                        <p className="mb-1 font-bold">{item.title}</p>
                                        <p className="text-sm leading-relaxed text-muted-foreground">{item.text}</p>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>

                        <Card id="legislacao" className="scroll-mt-24 border-none shadow-md">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><Gavel className="h-5 w-5 text-primary" /> Legislação de referência</CardTitle>
                                <CardDescription>{LEGAL_SOURCE_NOTE}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="overflow-hidden rounded-xl border">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                                            <tr><th className="px-4 py-2.5">Diploma</th><th className="hidden px-4 py-2.5 md:table-cell">Assunto</th><th className="px-4 py-2.5">O que o sistema aplica</th><th className="px-4 py-2.5 text-center">Fonte</th></tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {LEGAL_REFERENCES.map(reference => (
                                                <tr key={reference.id} className="align-top odd:bg-muted/10">
                                                    <td className="px-4 py-3 font-semibold">{reference.diploma}<p className="mt-0.5 font-normal text-muted-foreground md:hidden">{reference.subject}</p></td>
                                                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{reference.subject}</td>
                                                    <td className="px-4 py-3">{reference.application}</td>
                                                    <td className="px-4 py-3 text-center">
                                                        <Badge variant={reference.source === 'BNA' ? 'default' : 'secondary'} className="whitespace-nowrap">{reference.source === 'BNA' ? 'BNA' : 'D. República'}</Badge>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm md:flex-row md:items-center md:justify-between">
                                    <p className="flex items-start gap-2 text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> {LEGAL_DISCLAIMER}</p>
                                    <a href="https://www.bna.ao" target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 font-semibold text-primary hover:underline">
                                        <BookOpenCheck className="h-4 w-4" /> www.bna.ao <ExternalLink className="h-3 w-3" />
                                    </a>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
}
