const $=s=>document.querySelector(s);
let csrf='',gameId='',socket=null;
function getCsrf(){csrf=decodeURIComponent(document.cookie.split('; ').find(x=>x.startsWith('ac_csrf='))?.split('=')[1]||'')}
async function api(url,opts={}){opts.headers={...(opts.headers||{}),'Content-Type':'application/json'};if(csrf)opts.headers['x-csrf-token']=csrf;const r=await fetch(url,{credentials:'include',...opts});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Erreur');return d}
function show(msg){$('#msg').textContent=msg}
function render(state){$('#state').textContent=JSON.stringify(state,null,2)}
function connectSocket(){if(socket)socket.disconnect();socket=io({withCredentials:true});socket.on('connect',()=>{if(gameId)socket.emit('joinGame',gameId)});socket.on('connect_error',()=>show('Temps réel indisponible. Les actions HTTP restent disponibles.'));socket.on('state',render)}
async function login(){try{const d=await api('/api/login',{method:'POST',body:JSON.stringify({username:$('#username').value,password:$('#password').value})});getCsrf();$('#game').hidden=false;show(`Connecté : ${d.username}`);connectSocket();await games()}catch(e){show(e.message)}}
async function register(){try{await api('/api/register',{method:'POST',body:JSON.stringify({username:$('#username').value,password:$('#password').value})});show('Compte créé. Connecte-toi.')}catch(e){show(e.message)}}
async function create(){try{const d=await api('/api/games',{method:'POST',body:JSON.stringify({faction:$('#faction').value})});gameId=d.id;$('#gameid').value=gameId;show(`Partie créée (${d.faction}). En attente d’un autre joueur.`);connectSocket();await load()}catch(e){show(e.message)}}
async function games(){try{const d=await api('/api/games');$('#games').textContent=d.length?d.map(g=>`${g.id} — ${g.players.map(p=>p.username+' ('+p.faction+')').join(', ')}`).join('\n'):'Aucune partie en attente.'}catch(e){show(e.message)}}
async function join(){try{gameId=$('#gameid').value.trim();const d=await api(`/api/games/${encodeURIComponent(gameId)}/join`,{method:'POST'});show(`Partie rejointe — faction ${d.faction}`);connectSocket();await load()}catch(e){show(e.message)}}
async function load(){try{const d=await api(`/api/games/${encodeURIComponent(gameId)}`);render(d.state);show(`Partie ${d.status} — faction ${d.faction} — tour ${d.turn}`);if(socket)socket.emit('joinGame',gameId)}catch(e){show(e.message)}}
async function action(action,target){try{const d=await api(`/api/games/${encodeURIComponent(gameId)}/action`,{method:'POST',body:JSON.stringify({action,target})});render(d.state);await load()}catch(e){show(e.message)}}
$('#login').onclick=login;$('#register').onclick=register;$('#create').onclick=create;$('#join').onclick=join;$('#refresh').onclick=games;$('#collect').onclick=()=>action('collect');$('#recruit').onclick=()=>action('recruit',$('#territory').value);$('#attack').onclick=()=>action('attack',$('#territory').value);$('#end').onclick=()=>action('endTurn');
getCsrf();
