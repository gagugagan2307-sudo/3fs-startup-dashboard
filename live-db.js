// 3FS Live Database Sync V8 — resilient shared-state persistence
(function(){
  const cfg=window.SUPABASE_CONFIG||{};
  let client=null,channel=null,ready=false,authReady=false,writeChain=Promise.resolve(),serverSnapshot=null;
  const clone=v=>{try{return structuredClone(v)}catch(e){return JSON.parse(JSON.stringify(v))}};
  const configured=()=>!!(cfg.url&&cfg.publishableKey&&window.supabase);
  const status=(state,text)=>window.dispatchEvent(new CustomEvent('3fs:syncstatus',{detail:{state,text}}));
  async function ensureAuth(){
    if(!client)return false;
    try{
      const s=await client.auth.getSession();
      if(s?.data?.session){authReady=true;window._3fsSupabaseSession=s.data.session;return true;}
      const r=await client.auth.signInAnonymously();
      if(r.error)throw r.error;
      authReady=!!r.data?.session;window._3fsSupabaseSession=r.data?.session||null;return authReady;
    }catch(e){authReady=false;console.warn('3FS auth failed',e);status('error','Authentication failed — enable Anonymous Sign-Ins in Supabase');return false;}
  }
  async function readRow(){
    const r=await client.from('threefs_state').select('id,data,updated_at,updated_by').eq('id',1).maybeSingle();
    if(r.error)throw r.error;return r.data||null;
  }
  async function init(){
    if(!configured()){status('offline','Supabase configuration missing');return false;}
    if(ready&&client)return true;
    try{
      status('connecting','Connecting to live database…');
      client=window._3fsSupabaseClient||window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});window._3fsSupabaseClient=client;
      if(!(await ensureAuth()))return false;
      const row=await readRow();
      const local=(()=>{try{return JSON.parse(localStorage.getItem('3fsData')||'{}')}catch(e){return {}}})();
      if(row?.data && Object.keys(row.data||{}).length){
        serverSnapshot=clone(row.data);
        if(localStorage.getItem('3fsPendingWrite')!=='1'){
          localStorage.setItem('3fsData',JSON.stringify(row.data));
          localStorage.setItem('3fsLastSyncedAt',String(new Date(row.updated_at||0).getTime()));
          window.dispatchEvent(new Event('3fs:live-refresh'));
        }else if(window._3fsPushLive){ await window._3fsPushLive(local); }
      }else if(Object.keys(local||{}).length && window._3fsPushLive){
        await window._3fsPushLive(local,Object.keys(local));
      }
      ready=true;
      channel=client.channel('3fs-live-shared-v8').on('postgres_changes',{event:'*',schema:'public',table:'threefs_state',filter:'id=eq.1'},payload=>{
        if(!payload.new?.data)return;serverSnapshot=clone(payload.new.data);
        const at=new Date(payload.new.updated_at||0).getTime(),localAt=Number(localStorage.getItem('3fsLastSyncedAt')||0);
        if(localStorage.getItem('3fsPendingWrite')!=='1'&&at>=localAt){localStorage.setItem('3fsData',JSON.stringify(payload.new.data));localStorage.setItem('3fsLastSyncedAt',String(at));window.dispatchEvent(new Event('3fs:live-refresh'));}
        status('online','Live database connected · realtime ON');
      }).subscribe(state=>{if(state==='SUBSCRIBED')status('online','Live database connected · realtime ON');else if(state==='CHANNEL_ERROR'||state==='TIMED_OUT')status('error','Realtime reconnecting…');});
      return true;
    }catch(e){console.warn('3FS database init failed',e);ready=false;status('error','Live database connection failed — check SQL and Anonymous Sign-Ins');return false;}
  }
  window.init3FSLiveSync=init;
  window._3fsPushLive=function(obj,changedKeys){
    if(!obj)return Promise.resolve(false);
    const keys=changedKeys?.length?changedKeys:Object.keys(obj);
    if(!client||!authReady){localStorage.setItem('3fsPendingWrite','1');return init().then(()=>window._3fsPushLive(obj,keys));}
    const patch={};keys.forEach(k=>patch[k]=clone(obj[k]));
    writeChain=writeChain.then(async()=>{
      localStorage.setItem('3fsPendingWrite','1');status('saving','Saving to live database…');
      try{
        let r=await client.rpc('threefs_merge_state',{p_patch:patch});
        let merged=r.data?.[0]||r.data||null;
        if(r.error){
          // Fallback for installations where the RPC has not been created yet.
          const existing=await readRow();
          const full=clone(existing?.data||{});keys.forEach(k=>full[k]=clone(obj[k]));
          r=await client.from('threefs_state').upsert({id:1,data:full,updated_at:new Date().toISOString(),updated_by:window._3fsSupabaseSession?.user?.id||null}).select('id,data,updated_at').single();
          if(r.error)throw r.error;merged=r.data;
        }
        if(merged?.data){serverSnapshot=clone(merged.data);localStorage.setItem('3fsData',JSON.stringify(merged.data));localStorage.setItem('3fsLastSyncedAt',String(new Date(merged.updated_at||Date.now()).getTime()));}
        else{localStorage.setItem('3fsData',JSON.stringify(obj));localStorage.setItem('3fsLastSyncedAt',String(Date.now()));}
        localStorage.removeItem('3fsPendingWrite');localStorage.removeItem('3fsLocalChangedAt');status('online','Saved globally · realtime ON');return true;
      }catch(e){
        console.warn('3FS live save failed',e);status('error','Live save failed — your data is kept locally and will retry');
        localStorage.setItem('3fsPendingWrite','1');
        setTimeout(()=>window._3fsPushLive(obj,keys),1500);return false;
      }
    });
    return writeChain;
  };
  window._3fsRefreshLive=async function(){if(!client)return init();if(!authReady&&!(await ensureAuth()))return false;return true;};
  window.addEventListener('3fs:datachanged',e=>{if(e.detail?.store)window._3fsPushLive(e.detail.store,e.detail.changedKeys||[]);});
  window.addEventListener('online',()=>{if(window._3fsRefreshLive)window._3fsRefreshLive();});
  setInterval(()=>{if(!client)init();else if(!authReady)ensureAuth();},30000);
})();
