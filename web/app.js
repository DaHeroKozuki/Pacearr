const app=document.getElementById('app'),msg=document.getElementById('message');
function notice(message){msg.textContent=message||'';msg.hidden=!message}
async function api(path,method='GET',data){const response=await fetch('/api/setup/'+path,{method,headers:{'Content-Type':'application/json'},credentials:'same-origin',body:data===undefined?undefined:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw Error(result.error||'Request failed');return result}
function eyeIcon(hidden){return '<svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true"><path d="M2 12 Q12 1 22 12 Q12 23 2 12Z"/><circle cx="12" cy="12" r="3"/>'+(hidden?'<path d="M3 3 L21 21"/>':'')+'</svg>'}
async function show(){try{
 const state=await api('status');
 if(state.initialized&&state.authenticated){await window.mountManager();return}
 app.innerHTML='<section class="auth-card"><span class="eyebrow">YOUR LIBRARY, UNDER CONTROL</span><h2>'+(!state.initialized?'Welcome aboard':'Welcome back')+'</h2><p>'+(!state.initialized?'Create your Pacearr administrator account.':'Sign in to manage your One Pace collection.')+'</p><form id="auth"><label>Username<input name="username" required autocomplete="username" minlength="3"></label><label>Password<input name="password" type="password" required autocomplete="'+(!state.initialized?'new-password':'current-password')+'" minlength="'+(!state.initialized?'12':'1')+'"></label><button class="primary">'+(!state.initialized?'Create account':'Sign in')+'</button></form></section>';
 document.getElementById('auth').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{await api(state.initialized?'login':'create','POST',Object.fromEntries(new FormData(e.target)));if(!state.initialized)notice('Account created. Sign in to continue.');else notice('');await show()}catch(error){notice(error.message);button.disabled=false}};
}catch(error){notice(error.message);const retry=document.createElement('button');retry.textContent='Reload Pacearr';retry.onclick=()=>location.reload();app.append(retry)}}
show();
