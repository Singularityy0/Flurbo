import {marketStatus,type MarketGroup,type MarketSnapshot} from './market-directory.ts';
import {marketQuestion} from './showcase-copy.ts';
import {categorize,type BoardQuery,type CategorySlug} from './market-categories.ts';

export type BoardKind='pilot';
export type SnapshotRow={key:string;groupKey:string;groupLabel:string;category:CategorySlug;kind:BoardKind;path:string;kindLabel:string;question:string;closesAt:number;status:string;prices:{yes:string|null;no:string|null}|null;priceAt:number|null;combinable:boolean;linkedCount:number;payoutNote:string;kuru:boolean};
export type BoardRow=SnapshotRow&{href:(yes?:boolean)=>string};

// Links name the answer when one is given; Yes is the market page's default.
export function rowHref(path:string,yes?:boolean){
  return yes===false?`${path}?answer=no`:path;
}
export const toSnapshotRow=(row:BoardRow):SnapshotRow=>{const copy:Partial<BoardRow>={...row};delete copy.href;return copy as SnapshotRow;};
export const rowFromSnapshot=(row:SnapshotRow):BoardRow=>({...row,href:(yes?:boolean)=>rowHref(row.path,yes)});

const KIND_LABEL:Record<string,string>={rehearsal:'Practice scenario','ethereum-activity':'Ethereum activity'};

// One row per question of every pool whose snapshot has loaded.
export function buildBoardRows({groups,data,now}:{groups:MarketGroup[];data:Record<string,MarketSnapshot>;now:number}):BoardRow[]{
  return groups.flatMap(group=>{
    const value=data[group.namespace];
    if(!value)return [];
    const events=value.manifest.publication.draft.events,mode=value.manifest.publication.mode,status=marketStatus(value,now/1000);
    return events.map((event,index):SnapshotRow=>{const quotes=value.prices.find(p=>p.event===index);
      return {key:`${group.namespace}:${index}`,groupKey:group.namespace,groupLabel:group.label,category:categorize({pool:group.pool,kind:'pilot',mode}),kind:'pilot',path:`/markets/${group.namespace}/${index}`,
        kindLabel:KIND_LABEL[mode??'']??'Ecosystem',question:marketQuestion(event),closesAt:group.closesAt,status,prices:quotes?{yes:quotes.yes,no:quotes.no}:null,priceAt:value.snapshot.timestamp,
        combinable:events.length>1,linkedCount:events.length,payoutNote:'Results available. Collect eligible payouts in Portfolio.',kuru:group.kuru?.includes(index)===true};
    });
  }).map(rowFromSnapshot);
}

const STATUS_LABEL={open:'Open',closed:'Closed',settled:'Settled',all:'All'} as const;
const rank=(status:string)=>status==='Open'?0:status==='Closed'?1:2;

// Watchlist shows pinned markets in any status; every other category applies the status filter.
export function filterBoardRows<R extends SnapshotRow>(rows:R[],query:BoardQuery,watchlist:ReadonlySet<string>):R[]{
  const status=STATUS_LABEL[query.status],search=query.q.toLowerCase();
  return rows.filter(r=>(query.category==='watchlist'?watchlist.has(r.key):(query.category==='all'||r.category===query.category)&&(status==='All'||r.status===status))&&r.question.toLowerCase().includes(search)).sort((a,b)=>{
    const difference=rank(a.status)-rank(b.status);if(difference)return difference;
    return query.sort==='name'?a.question.localeCompare(b.question):a.closesAt-b.closesAt;
  });
}
