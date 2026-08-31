// 3FS Authentication bridge
// Keeps the existing 3FS admin login while establishing a real Supabase
// anonymous session for the shared database/realtime layer.
(function(){
  const ADMIN='3FS', PASS='3FS@media', KEY='3fsAdminSession';
  let loggedIn = localStorage.getItem(KEY)==='1';
  let supabaseClient = null;
  let supabaseReady = Promise.resolve(false);
  const profile={id:'3fs-admin',email:'',full_name:'3FS Admin',role:'admin',is_active:true};

  function emit(){
    window.dispatchEvent(new CustomEvent('3fs:authchange',{detail:{user:loggedIn?profile:null,profile:loggedIn?profile:null}}));
  }

  async function initSupabaseAuth(){
    try{
      const cfg=window.SUPABASE_CONFIG||{};
      if(!cfg.url || !cfg.publishableKey || !window.supabase) throw new Error('Supabase client/config unavailable');
      supabaseClient=window.supabase.createClient(cfg.url,cfg.publishableKey,{
        auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
      });
      window._3fsSupabaseClient=supabaseClient;
      const existing=await supabaseClient.auth.getSession();
      if(existing?.data?.session){
        window._3fsSupabaseSession=existing.data.session;
        return true;
      }
      const result=await supabaseClient.auth.signInAnonymously();
      if(result.error) throw result.error;
      window._3fsSupabaseSession=result.data.session||null;
      return !!result.data.session;
    }catch(err){
      console.error('3FS Supabase authentication error:',err);
      window.dispatchEvent(new CustomEvent('3fs:autherror',{detail:{error:err}}));
      return false;
    }
  }

  supabaseReady=initSupabaseAuth();
  authRetryTimer=setInterval(async()=>{
    if(supabaseClient && !(await supabaseClient.auth.getSession())?.data?.session){
      const ok=await initSupabaseAuth();
      if(ok) window.dispatchEvent(new CustomEvent('3fs:authchange',{detail:{user:loggedIn?profile:null,profile:loggedIn?profile:null}}));
    }
  },15000);

  function mount(){
    if(document.getElementById('threefs-login')) return;
    const s=document.createElement('style');
    s.id='threefs-login-css';
    s.textContent=`#threefs-login{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;background:radial-gradient(circle at 50% 20%,rgba(245,181,27,.16),transparent 35%),#03070e;padding:20px}#threefs-login .loginbox{width:min(420px,94vw);background:linear-gradient(145deg,#0d1b2e,#081323);border:1px solid #3b4a63;border-radius:20px;padding:30px;box-shadow:0 25px 90px #000}#threefs-login img{width:88px;height:88px;object-fit:cover;border-radius:50%;display:block;margin:0 auto 15px;background:#fff}#threefs-login h1{font-size:30px;text-align:center;margin:0 0 5px}#threefs-login p{text-align:center;color:#aebbd0;margin:0 0 22px}#threefs-login label{display:block;color:#c9d7eb;font-weight:700;margin:12px 0 6px}#threefs-login input{width:100%;padding:12px;border-radius:10px;border:1px solid #34455f;background:#07101d;color:#fff;outline:none;box-sizing:border-box}#threefs-login button{width:100%;margin-top:18px;padding:12px;border:0;border-radius:10px;background:linear-gradient(135deg,#ffd13b,#e9a90e);font-weight:800;color:#111;cursor:pointer}#threefs-login .err{min-height:20px;text-align:center;color:#ff9b9b;margin-top:10px;font-size:13px}`;
    document.head.appendChild(s);
    const wrap=document.createElement('div');wrap.id='threefs-login';
    wrap.innerHTML=`<div class="loginbox"><img src="3fs-logo.jpg" alt="3FS"><h1>3FS Admin Login</h1><p>Creative Studio Management Dashboard</p><form id="threefs-login-form"><label>Admin</label><input id="threefs-admin" autocomplete="username" placeholder="Enter admin" required><label>Password</label><input id="threefs-pass" type="password" autocomplete="current-password" placeholder="Enter password" required><button type="submit">Login to 3FS</button><div class="err" id="threefs-login-error"></div></form></div>`;
    document.body.appendChild(wrap);
    document.getElementById('threefs-login-form').addEventListener('submit',async function(e){
      e.preventDefault();
      const a=document.getElementById('threefs-admin').value.trim(),p=document.getElementById('threefs-pass').value;
      if(a!==ADMIN||p!==PASS){document.getElementById('threefs-login-error').textContent='Incorrect admin or password.';return;}
      loggedIn=true;localStorage.setItem(KEY,'1');hide();emit();
      await supabaseReady;
      if(!supabaseClient) document.getElementById('threefs-login-error')?.textContent;
    });
  }
  function show(){mount();const x=document.getElementById('threefs-login');if(x)x.style.display='grid';}
  function hide(){const x=document.getElementById('threefs-login');if(x)x.remove();}

  window.threefsAuth={
    client:()=>supabaseClient||window._3fsSupabaseClient||null,
    profile:()=>loggedIn?profile:null,
    role:()=>loggedIn?'admin':'',
    roleLabel:()=>loggedIn?'Team Member • Admin':'',
    is:(r)=>loggedIn&&r==='admin',
    can:()=>loggedIn,
    signIn:async({email,password}={})=>{
      const ok=(email===ADMIN&&password===PASS);
      if(ok){loggedIn=true;localStorage.setItem(KEY,'1');hide();emit();await supabaseReady;}
      return {data:{session:ok?{user:profile}:null},error:ok?null:new Error('Invalid credentials')};
    },
    signUp:async()=>({data:null,error:new Error('Sign up disabled')}),
    signOut:async()=>{loggedIn=false;localStorage.removeItem(KEY);show();emit();return {error:null};},
    resetPassword:async()=>({error:new Error('Password reset disabled')}),
    ready:()=>Promise.all([supabaseReady]).then(()=>loggedIn)
  };
  window._3fsAuthReady=supabaseReady;
  if(!loggedIn) mount(); else emit();
})();
