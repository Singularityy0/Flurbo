export type CategorySlug='all'|'watchlist'|'crypto'|'economics'|'politics'|'sports'|'tech'|'culture'|'science'|'practice'|'other';
export type BoardStatus='open'|'closed'|'settled'|'all';
export type BoardSort='closing'|'name';
export type BoardQuery={category:CategorySlug;status:BoardStatus;q:string;sort:BoardSort;page:number};

export const CATEGORY_ORDER:readonly CategorySlug[]=['all','watchlist','crypto','economics','politics','sports','tech','culture','science','practice','other'];
export const CATEGORY_LABEL:Record<CategorySlug,string>={all:'All',watchlist:'Watchlist',crypto:'Crypto',economics:'Economics',politics:'Politics',sports:'Sports',tech:'Tech',culture:'Culture',science:'Science',practice:'Practice',other:'Other'};

// Every registered pool, by lowercase address. A newly registered pool fails the category test until it is listed here.
export const CATEGORY_BY_POOL:Readonly<Record<string,CategorySlug>>={
  '0xd8ed3137446d99372f82573e716b3340d3dba7b3':'crypto',
  '0x939bd2bac6a163ed39a62152c759a0c2e7ccef57':'economics',
  '0xb7b872e9372eaee17d8de9f4c82861f1aa673198':'economics',
  '0xc4409edbfb9e9d47167b028de22f0b0d6b630077':'economics',
  '0xf8beba5827bfaaf6ace08a40cd9db740233ca9fe':'crypto',
  '0x160647d16405f44989c56b83609a171247068dcc':'politics',
  '0xca8750ed5b6bba513925034fdf506b970ecc4823':'crypto',
  '0xc0f8d422a18fdf4fafd1fab07bfd68eb961cf7a6':'crypto',
  '0x28d5ee02b1eda6959ac3ee5a4f834237c84dee02':'tech',
};

export function categorize({pool,kind,mode}:{pool:string;kind:'pilot'|'oracle'|'hybrid';mode?:string}):CategorySlug{
  const mapped=CATEGORY_BY_POOL[pool.toLowerCase()];
  if(mapped)return mapped;
  if(kind==='pilot'&&mode==='rehearsal')return 'practice';
  if(kind==='pilot'&&mode==='ethereum-activity')return 'crypto';
  return 'other';
}

export function visibleCategories(rows:{category:CategorySlug}[],watchlistCount:number){
  const counts=new Map<CategorySlug,number>();
  for(const row of rows)counts.set(row.category,(counts.get(row.category)??0)+1);
  return CATEGORY_ORDER.flatMap(slug=>{
    const count=slug==='all'?rows.length:slug==='watchlist'?watchlistCount:counts.get(slug)??0;
    return slug==='all'||count>0?[{slug,label:CATEGORY_LABEL[slug],count}]:[];
  });
}

const DEFAULTS:BoardQuery={category:'all',status:'open',q:'',sort:'closing',page:1};
const STATUSES:readonly BoardStatus[]=['open','closed','settled','all'];
const SORTS:readonly BoardSort[]=['closing','name'];

export function readBoardQuery(search:string):BoardQuery{
  const params=new URLSearchParams(search);
  const pick=<T extends string>(name:string,allowed:readonly T[],fallback:T)=>{const value=params.get(name) as T|null;return value&&allowed.includes(value)?value:fallback;};
  const page=Number(params.get('page'));
  return {
    category:pick('category',CATEGORY_ORDER,DEFAULTS.category),
    status:pick('status',STATUSES,DEFAULTS.status),
    q:(params.get('q')??'').slice(0,120),
    sort:pick('sort',SORTS,DEFAULTS.sort),
    page:Number.isSafeInteger(page)&&page>=1?page:DEFAULTS.page,
  };
}

export function writeBoardQuery(query:BoardQuery):string{
  const params=new URLSearchParams();
  for(const key of ['category','status','q','sort','page'] as const)if(query[key]!==DEFAULTS[key])params.set(key,String(query[key]));
  const text=params.toString();
  return text?'?'+text:'';
}
