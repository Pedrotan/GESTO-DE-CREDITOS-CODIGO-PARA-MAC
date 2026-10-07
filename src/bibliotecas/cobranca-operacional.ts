export const COLLECTION_SCHEMA_SQL = [
    `CREATE TABLE IF NOT EXISTS collection_events (
        id TEXT PRIMARY KEY, creditId TEXT, kind TEXT NOT NULL CHECK(kind IN ('contact','promise','promise_kept','promise_broken','assignment','target')),
        agentId TEXT, agentName TEXT, monthKey TEXT,
        amountMinor INTEGER CHECK(amountMinor IS NULL OR (typeof(amountMinor) = 'integer' AND amountMinor >= 0)),
        promisedDate TEXT, relatedId TEXT, notes TEXT NOT NULL CHECK(length(trim(notes)) >= 5),
        actorId TEXT NOT NULL, actorName TEXT NOT NULL, createdAt TEXT NOT NULL,
        CHECK((kind NOT IN ('contact','promise','promise_kept','promise_broken','assignment')) OR creditId IS NOT NULL),
        CHECK(kind <> 'promise' OR (amountMinor > 0 AND promisedDate IS NOT NULL)),
        CHECK(kind <> 'target' OR (agentId IS NOT NULL AND monthKey IS NOT NULL AND amountMinor IS NOT NULL)),
        CHECK(kind <> 'assignment' OR agentId IS NOT NULL),
        CHECK(kind NOT IN ('promise_kept','promise_broken') OR relatedId IS NOT NULL)
    )`,
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_promise_decision ON collection_events(relatedId) WHERE kind IN ('promise_kept','promise_broken')",
    `CREATE INDEX IF NOT EXISTS idx_collection_credit ON collection_events(creditId, createdAt)`,
    `CREATE TRIGGER IF NOT EXISTS trg_collection_update BEFORE UPDATE ON collection_events
        BEGIN SELECT RAISE(ABORT, 'O histórico de cobrança é imutável'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_collection_delete BEFORE DELETE ON collection_events
        BEGIN SELECT RAISE(ABORT, 'O histórico de cobrança é imutável'); END`
];
export type CollectionKind = 'contact'|'promise'|'promise_kept'|'promise_broken'|'assignment'|'target';
export type CollectionEvent = {id:string;creditId?:string|null;kind:CollectionKind;agentId?:string|null;agentName?:string|null;
    monthKey?:string|null;amountMinor?:number|null;promisedDate?:string|null;relatedId?:string|null;notes:string;actorId:string;actorName:string;createdAt:string};
export function validDateKey(value:string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
}
export function customerPaymentScore(installments:Array<{dueDate:string;paidAt?:string|null;principalMinor:number;interestMinor:number;lateInterestMinor?:number;paidPrincipalMinor?:number;paidInterestMinor?:number;paidLateInterestMinor?:number}>,today:string) {
    const due=installments.filter(i=>i.dueDate.slice(0,10)<=today && validDateKey(i.dueDate.slice(0,10)));
    if(!due.length) return {score:null,observed:0,unpaid:0,maxDelay:0,label:'Histórico insuficiente'};
    let unpaid=0,maxDelay=0;
    for(const row of due) {
        const total=row.principalMinor+row.interestMinor+(row.lateInterestMinor || 0);
        const paid=(row.paidPrincipalMinor || 0)+(row.paidInterestMinor || 0)+(row.paidLateInterestMinor || 0);
        const complete=paid>=total;
        if(!complete) unpaid++;
        const end=complete && row.paidAt && Number.isFinite(Date.parse(row.paidAt))?row.paidAt.slice(0,10):today;
        maxDelay=Math.max(maxDelay,Math.max(0,Math.round((Date.parse(end)-Date.parse(row.dueDate.slice(0,10)))/86400000)));
    }
    const score=Math.max(0,Math.round(100-60*unpaid/due.length-40*Math.min(90,maxDelay)/90));
    return {score,observed:due.length,unpaid,maxDelay,label:score>=80?'Histórico favorável':score>=50?'Atenção':'Revisão necessária'};
}
export function latestCollectionEvents(events:CollectionEvent[],kind:CollectionKind) {
    const latest=new Map<string,CollectionEvent>();
    for(const event of [...events].sort((a,b)=>b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))) {
        if(event.kind!==kind) continue;
        const key=kind==='target'?event.agentId+':'+event.monthKey:event.creditId || '';
        if(!latest.has(key)) latest.set(key,event);
    }
    return latest;
}