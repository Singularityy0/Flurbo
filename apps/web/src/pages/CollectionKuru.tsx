import {useEffect,useState} from 'react';
import {Link} from 'wouter';
import {appFetch} from '../platform-fetch';
import {marketHref} from '../market-detail';
import type {PilotNamespace} from '../pilot';
import Kuru from './Kuru';
import './markets.css';

type Listing={eventIndex:number;pool:string;receipt:string;market:string;closesAt:number;question:string};

export default function CollectionKuru({namespace,event}:{namespace:PilotNamespace;event:number}){
  const [listing,setListing]=useState<Listing|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const back=marketHref(namespace,event);
  useEffect(()=>{
    const controller=new AbortController();
    void appFetch(`/api/${namespace}/kuru-listing?event=${event}`,{cache:'no-store',signal:controller.signal})
      .then(async response=>{
        const data=await response.json();
        if(!response.ok)throw Error(response.status===404?'No verified Kuru order book is published for this question.':data.error||'Kuru listing is unavailable.');
        if(data.eventIndex!==event||!/^0x[0-9a-f]{40}$/i.test(data.market)||typeof data.question!=='string')throw Error('Kuru listing did not match this question.');
        if(!controller.signal.aborted)setListing(data);
      }).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Kuru listing is unavailable.');});
    return()=>controller.abort();
  },[namespace,event]);
  return <main id="main" tabIndex={-1} className="page markets-page">
    <nav className="detail-breadcrumb" aria-label="Breadcrumb"><Link href={back} className="link-back">Back to market</Link></nav>
    {error?<section className="state-block" role="alert"><h1>Order book unavailable</h1><p>{error}</p><Link href={back} className="btn btn-primary">Return to market</Link></section>
      :!listing?<p role="status">Checking the verified Kuru listing…</p>
      :<><h1>YES order book</h1><p>{listing.question}</p><p>One Flurbo YES share wraps into one receipt. Wrap shares in your wallet, then approve and deposit receipts to sell on Kuru. To return to Flurbo, withdraw available receipts and unwrap them. Each step has its own wallet confirmation. Kuru trades the receipt against test AUSD; the shared Flurbo pool continues to price the underlying prediction.</p><Kuru endpoint={`/api/${namespace}/kuru?event=${event}`} receiptLabel={`Event ${event+1} YES`} primaryHref={back} onBusy={setBusy} onConvert={()=>{}}/>{busy&&<p className="sr-only" role="status">Wallet action in progress</p>}</>}
  </main>;
}
