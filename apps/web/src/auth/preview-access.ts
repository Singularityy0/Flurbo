import {useCallback,useEffect,useRef,useState} from 'react';
import {useAuth} from './context';
import {appFetch} from '../platform-fetch';

export type Access = {approved:boolean;applicationUrl:string|null;nativeApplications?:boolean;testingTools?:boolean};
type Snapshot={account:string;access:Access|null;error:string;checking:boolean};
export function usePreviewAccess(){
  const {state}=useAuth();
  const account=state.address;
  const [result,setResult]=useState<Snapshot|null>(null);
  const flight=useRef<{account:string;abort:AbortController;promise:Promise<void>}|null>(null);
  const refresh=useCallback(():Promise<void>=>{
    if(!account)return Promise.resolve();
    if(flight.current?.account===account)return flight.current.promise;
    flight.current?.abort.abort();
    const abort=new AbortController();
    setResult(old=>({account,access:old?.account===account?old.access:null,error:'',checking:true}));
    const promise=(async()=>{
      try{
        const response=await appFetch('/api/account/access',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(12000)])});
        if(!response.ok)throw Error(response.status===429?'Too many checks. Please wait a moment before trying again.':'We couldn’t refresh your access status. Please try again.');
        const value=await response.json();
        if(typeof value.approved!=='boolean')throw Error('We couldn’t refresh your access status. Please try again.');
        if(!abort.signal.aborted)setResult({account,access:{approved:value.approved,applicationUrl:value.applicationUrl||null,nativeApplications:value.nativeApplications===true,testingTools:value.testingTools===true},error:'',checking:false});
      }catch(e){
        if(!abort.signal.aborted)setResult(old=>({account,
          // Preserve form state on transient failure, but never retain permission.
          access:old?.account===account&&old.access?{...old.access,approved:false,testingTools:false}:null,
          error:e instanceof Error&&e.name==='Error'?e.message:'We couldn’t refresh your access status. Please try again.',checking:false}));
      }finally{if(flight.current?.abort===abort)flight.current=null;}
    })();
    flight.current={account,abort,promise};
    return promise;
  },[account]);
  useEffect(()=>{
    setResult(null);
    void refresh();
    return()=>{flight.current?.abort.abort();flight.current=null;};
  },[refresh]);
  useEffect(()=>{
    const denied=()=>{
      setResult(old=>old?.account===account&&old.access?{...old,access:{...old.access,approved:false,testingTools:false}}:old);
      void refresh();
    };
    window.addEventListener('flurbo:access-required',denied);
    return()=>window.removeEventListener('flurbo:access-required',denied);
  },[account,refresh]);
  const current=result?.account===account?result:null;
  return {access:current?.access??null,error:current?.error??'',checking:!!account&&(!current||current.checking),refresh};
}
