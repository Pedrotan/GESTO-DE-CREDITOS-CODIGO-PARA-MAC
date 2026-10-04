import { Landmark } from 'lucide-react';
import { ANGOLAN_BANKS, getBankLogoUrl, identifyBankFromIBAN } from '@/bibliotecas/ibanHelper';

export function BankLogo({ iban, name, className = 'h-9 w-12' }: { iban?: string; name?: string; className?: string }) {
    const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const label = normalize(name || '');
    const bank = (iban ? identifyBankFromIBAN(iban) : null) || ANGOLAN_BANKS.find(item =>
        normalize(item.name) === label || label.split(/[^a-z0-9]+/).includes(normalize(item.shortName)) ||
        label.includes(normalize(item.name.replace(/^[A-Z]+ - /, ''))));
    const logo = getBankLogoUrl(bank?.code);
    return <span className={'inline-flex shrink-0 items-center justify-center rounded-lg bg-white p-1 ' + className}>
        {logo ? <img src={logo} alt={bank?.shortName || name || 'Banco'} className="h-full w-full object-contain" /> :
            <Landmark className="h-4 w-4 text-primary" />}
    </span>;
}