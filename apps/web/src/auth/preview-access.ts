import {useEffect,useState} from 'react';
import {useAuth} from './context';
import {appFetch} from '../platform-fetch';

export type Access = {approved:boolean;applicationUrl:string|null};
export function usePreviewAccess(){
  const {state}=useAuth();
  const [result,setResult]=useState<{account:string;access:Access}|null>(null);
  const [error,setError]=useState(''),[revision,setRevision]=useState(0);
  useEffect(()=>{
    const abort=new AbortController();setResult(null);setError('');
    if(state.address)void appFetch('/api/account/access',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(12000)])})
      .then(async response=>{if(!response.ok)throw Error();return response.json();})
      .then(value=>{if(!abort.signal.aborted)setResult({account:state.address!,access:{approved:value.approved===true,applicationUrl:value.applicationUrl||null}});})
      .catch(()=>{if(!abort.signal.aborted)setError('Access could not be checked. Please try again.');});
    return()=>abort.abort();
  },[state.address,revision]);
  useEffect(()=>{
    const refresh=()=>setRevision(x=>x+1);
    window.addEventListener('flurbo:access-required',refresh);
    return()=>window.removeEventListener('flurbo:access-required',refresh);
  },[]);
  return {access:result?.account===state.address?result.access:null,error,refresh:()=>setRevision(x=>x+1)};
}
