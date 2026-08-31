// 3FS Live Database Sync V4
// Low-latency Supabase sync: one authenticated client, atomic JSONB section patches,
// Realtime-first updates, and a very light health check.
(function(){
  const cfg=window.SUPABASE_CONFIG||{};
  let client=null, channel=null, ready=false, authReady=false;
  let writeChain=Promise.resolve();
  let serverSnapshot=null;

  function configured(){return !!(cfg.url&&cfg.publishableKey&&window.supabase)}
  function status(state,text){window.dispatchEvent(new CustomEvent('3fs:syncstatus',{detail:{state,text}}))}
  function clone(v){try{return structuredClone(v)}catch(e){return JSON.parse(JSON.stringify(v))}}

  async function ensureAuth(){
    if(!client)return false;
    try{
      const current=await client.auth.getSession();
      if(current?.data?.session){authReady=true;window._3fsSupabaseSession=current.data.session;return true}
      const sign=await client.auth.signInAnonymously();
      if(sign.error)throw sign.error;
      authReady=!!sign.data?.session;
      window._3fsSupabaseSession=sign.data?.session||null;
      return authReady;
    }catch(e){
      authReady=false;
      console.warn('3FS Supabase anonymous auth failed:',e);
      status('offline','Shared database authentication unavailable — retrying');
      return false;
    }
  }

  async function readServer(){
    if(!client||!authReady)return null;
    const r=await client.from('threefs_state').select('data,updated_at').eq('id',1).maybeSingle();
    if(r.error)throw r.error;
    return r.data||null;
  }

  async function pull(){
    if(!client||!authReady)return false;
    try{
      const row=await readServer();
      if(!row?.data)return true;
      serverSnapshot=clone(row.data);
      const serverAt=new Date(row.updated_at||0).getTime();
      const localAt=Number(localStorage.getItem('3fsLastSyncedAt')||0);
      const localChangedAt=Number(localStorage.getItem('3fsLocalChangedAt')||0);
      if(localChangedAt>serverAt || localStorage.getItem('3fsPendingWrite')==='1'){
        // Keep newer local edits. They will be pushed instead of being overwritten.
        return window._3fsPushLive ? !!(await window._3fsPushLive(JSON.parse(localStorage.getItem('3fsData')||'{}'))) : false;
      }
      if(serverAt>=localAt){
        localStorage.setItem('3fsData',JSON.stringify(row.data));
        localStorage.setItem('3fsLastSyncedAt',String(serverAt));
        localStorage.removeItem('3fsLocalChangedAt');
        window.dispatchEvent(new Event('3fs:live-refresh'));
      }
      return true;
    }catch(e){console.warn('3FS live pull failed',e);return false}
  }

  window.init3FSLiveSync=async function(){
    if(!configured()){status('offline','Supabase configuration missing');return false}
    if(ready&&client)return true;
    try{
      status('connecting','Connecting to shared database…');
      client=window._3fsSupabaseClient||window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
      window._3fsSupabaseClient=client;
      if(!(await ensureAuth()))return false;
      const first=await readServer();
      if(first?.data){
        const serverAt=new Date(first.updated_at||0).getTime();
        const localChangedAt=Number(localStorage.getItem('3fsLocalChangedAt')||0);
        if(localChangedAt>serverAt || localStorage.getItem('3fsPendingWrite')==='1'){
          serverSnapshot=clone(first.data);
          const local=JSON.parse(localStorage.getItem('3fsData')||'{}');
          await window._3fsPushLive(local);
        }else{
          serverSnapshot=clone(first.data);
          localStorage.setItem('3fsData',JSON.stringify(first.data));
          localStorage.setItem('3fsLastSyncedAt',String(serverAt));
          window.dispatchEvent(new Event('3fs:live-refresh'));
        }
      }
      ready=true;
      if(channel)try{await client.removeChannel(channel)}catch(e){}
      channel=client.channel('3fs-live-shared-v7')
        .on('postgres_changes',{event:'*',schema:'public',table:'threefs_state',filter:'id=eq.1'},payload=>{
          if(!payload.new?.data)return;
          serverSnapshot=clone(payload.new.data);
          const at=new Date(payload.new.updated_at||0).getTime();
          const localAt=Number(localStorage.getItem('3fsLastSyncedAt')||0);
          if(localStorage.getItem('3fsPendingWrite')!=='1' && at>=localAt){
            localStorage.setItem('3fsData',JSON.stringify(payload.new.data));
            localStorage.setItem('3fsLastSyncedAt',String(at));
            window.dispatchEvent(new Event('3fs:live-refresh'));
          }
          status('online','Live update received');
        })
        .subscribe(state=>{
          if(state==='SUBSCRIBED')status('online','Live database connected · realtime ON');
          else if(state==='CHANNEL_ERROR'||state==='TIMED_OUT')status('error','Realtime reconnecting…');
        });
      return true;
    }catch(e){
      console.warn('3FS Supabase connection failed:',e);ready=false;
      status('offline','Shared database unavailable — retrying automatically');
      return false;
    }
  };

  // Fast path: send only changed top-level sections. The SQL function merges the patch
  // atomically in Postgres, so we avoid the old read-then-write round trip.
  window._3fsPushLive=function(obj,changedKeys){
    if(!client||!authReady||!obj)return Promise.resolve(false);
    const keys=changedKeys&&changedKeys.length?changedKeys:Object.keys(obj);
    const patch={};
    for(const k of keys)patch[k]=clone(obj[k]);
    writeChain=writeChain.then(async()=>{
      localStorage.setItem('3fsPendingWrite','1');
      status('saving','Saving globally…');
      try{
        let r=await client.rpc('threefs_merge_state',{p_patch:patch});
        let merged=r.data?.[0]||r.data||null;
        // Fallback to a normal authenticated upsert if the RPC is missing or stale.
        if(r.error){
          console.warn('3FS merge RPC failed; using direct upsert fallback',r.error);
          const full=clone(obj);
          r=await client.from('threefs_state').upsert({id:1,data:full,updated_at:new Date().toISOString(),updated_by:(window._3fsSupabaseSession?.user?.id||null)}).select('data,updated_at').single();
          if(r.error)throw r.error;
          merged=r.data;
        }
        if(merged?.data){
          serverSnapshot=clone(merged.data);
          localStorage.setItem('3fsData',JSON.stringify(merged.data));
          localStorage.setItem('3fsLastSyncedAt',String(new Date(merged.updated_at||Date.now()).getTime()));
        }else{
          const local=clone(obj); if(serverSnapshot){for(const k of keys)serverSnapshot[k]=clone(local[k]);}
          localStorage.setItem('3fsData',JSON.stringify(local));
        }
        localStorage.removeItem('3fsPendingWrite');
        localStorage.removeItem('3fsLocalChangedAt');
        status('online','Saved globally · realtime ON');
        return true;
      }catch(e){
        console.warn('3FS live save failed',e);
        // Keep the pending marker so a later reload/pull never overwrites unsaved edits.
        status('error','Global save failed — retrying without losing your data');
        setTimeout(()=>{if(window._3fsPushLive)window._3fsPushLive(obj,keys)},1200);
        return false;
      }
    });
    return writeChain;
  };

  window._3fsRefreshLive=async function(){
    if(!client&&configured())return window.init3FSLiveSync();
    if(client&&!authReady){if(!(await ensureAuth()))return false;ready=true}
    return pull();
  };

  window.addEventListener('3fs:datachanged',e=>{
    if(window._3fsPushLive&&e.detail?.store)window._3fsPushLive(e.detail.store,e.detail.changedKeys||[]);
  });

  // Realtime carries changes; this is only a fallback health check every 60s.
  setInterval(async()=>{
    if(!client&&configured())await window.init3FSLiveSync();
    else if(client&&!authReady)await ensureAuth();
    else if(ready)await pull();
  },60000);
})();
