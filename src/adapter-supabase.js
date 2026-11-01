/* v0.6.2 事件驅動同步 + 無登入投影
 * 正常 Realtime 連線：只在狀態通知、統計通知或本機提交後讀取快照；不定時輪詢。
 * 斷線／重連／恢復可見：補讀可信快照；連線異常才啟動錯峰備援輪詢。
 * Realtime 訊息不包含任何原始答案或憑證。
 */
(function(){
 'use strict';
 const cfg=window.LectureConfig||{};
 if(!cfg.supabaseUrl||!cfg.supabasePublishableKey||!window.supabase?.createClient)return;
 const C=window.LectureCore;
 const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{
   auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false},
   realtime:{params:{eventsPerSecond:5}}
 });
 const params=new URLSearchParams(location.search);
 const audience=params.get('view')==='audience';
 const stageOnly=params.get('view')==='stage';
 const stageToken=stageOnly?new URLSearchParams(location.hash.slice(1)).get('stage'):null;
 const SESSION_KEY='photo-lecture-v05-host-session';
 let sessionId=params.get('session')||(!audience&&!stageOnly?localStorage.getItem(SESSION_KEY):null);
 let state=C.initial(),handlers=[],channels=[],ready=false,busy=false,queued=false,queuedSource='queued';
 let credential=null,projectionToken=null,stageChannel=null,pollTimer=null,statsTimer=null,statsSettleTimer=null;
 let currentHash='',generation=0,publicOnline=false,statsOnline=false;
 const status={mode:'supabase',audience,stageOnly,authenticated:false,ready:false,needsGroup:false,error:'',sessionId,connected:false,awaitingChoice:!audience&&!stageOnly&&!!sessionId};
 function fire(meta={kind:'data',source:'unknown'}){for(const h of handlers){try{h(state,meta)}catch(e){console.warn(e)}}}
 function updateStatus(values){const changed=Object.keys(values).some(k=>status[k]!==values[k]);Object.assign(status,values);if(changed)fire({kind:'status',source:'connection'})}
 function acceptState(incoming,source){const hash=JSON.stringify(incoming);
   if(hash===currentHash)return false;
   currentHash=hash;state=incoming;fire({kind:'data',source});return true;
 }
 function storageKey(){return 'photo-lecture-v05-attendee:'+sessionId}
 function loadCredential(){try{return JSON.parse(localStorage.getItem(storageKey())||'null')}catch{return null}}
 function saveCredential(v){credential=v;localStorage.setItem(storageKey(),JSON.stringify(v))}
 const rpc=async(name,args={})=>{const {data,error}=await client.rpc(name,args);if(error)throw new Error(error.message);return data};
 function clearTimers(){clearTimeout(pollTimer);clearTimeout(statsTimer);clearTimeout(statsSettleTimer);pollTimer=statsTimer=statsSettleTimer=null}
 function fallbackDelay(){const base=Math.max(7000,Math.min(30000,Number(cfg.maxFallbackPollMs)||9000));return base+Math.floor(Math.random()*3000)}
 function scheduleFallback(){clearTimeout(pollTimer);pollTimer=null;
   if(!ready||!sessionId||status.connected)return;
   pollTimer=setTimeout(async()=>{pollTimer=null;if(!ready||status.connected)return;
     await refresh(false,'fallback');scheduleFallback();
   },fallbackDelay());
 }
 async function refresh(force=true,source='manual'){
   if(!sessionId||!ready)return;
   if(busy){queued=true;queuedSource=source;return}
   busy=true;const currentGeneration=generation;
   try{
     let incoming=audience?
       await rpc('lecture_audience_snapshot',{p_session:sessionId,p_participant:credential.participantId,p_token:credential.token}):
       stageOnly?await rpc('lecture_stage_snapshot',{p_session:sessionId,p_token:stageToken}):
       await rpc('lecture_host_snapshot',{p_session:sessionId});
     if(stageOnly){stageChannel=incoming.projectionChannel;delete incoming.projectionChannel;}
     if(currentGeneration!==generation)return;
     acceptState(incoming,source);
     if(status.error)updateStatus({error:''});
   }catch(e){if(currentGeneration===generation)updateStatus({error:e.message})}
   finally{
     busy=false;
     if(queued){const next=queuedSource;queued=false;queuedSource='queued';void refresh(true,next)}
   }
 }
 function channelStatus(){
   const wasOnline=status.connected,online=publicOnline&&(audience||stageOnly||statsOnline);
   updateStatus({connected:online});
   if(online){clearTimeout(pollTimer);pollTimer=null;if(!wasOnline)void refresh(true,'reconnect')}
   else scheduleFallback();
 }
 function notifyStats(){
   // 讓私人主控收到「有新回覆」通知，即使選擇題數量未改變、理由被修改亦然。
   fire({kind:'notice',source:'stats'});
   clearTimeout(statsTimer);
   statsTimer=setTimeout(()=>{statsTimer=null;void refresh(true,'stats')},350);
   // SQL 每 800ms 節流廣播；最後一批作答可能沒有另一則廣播。
   // 收到事件後只補查一次，確保大量集中提交的最終統計能收斂，不是循環輪詢。
   clearTimeout(statsSettleTimer);
   statsSettleTimer=setTimeout(()=>{statsSettleTimer=null;void refresh(true,'stats-settle');fire({kind:'notice',source:'stats-settle'})},1700);
 }
 async function setupChannels(){
   generation++;
   const channelGeneration=generation;
   clearTimers();
   for(const ch of channels)await client.removeChannel(ch);
   channels=[];publicOnline=false;statsOnline=false;updateStatus({connected:false});
   try{
     await client.realtime.setAuth();
     const publicCh=client.channel(stageOnly?stageChannel:('lecture:public:'+sessionId),{config:{private:true}})
       .on('broadcast',{event:'state_changed'},()=>{if(channelGeneration===generation)void refresh(true,'state')})
       .on('broadcast',{event:'stats_changed'},()=>{if(stageOnly&&channelGeneration===generation)notifyStats()})
       .subscribe(s=>{
         if(channelGeneration!==generation)return;
         if(s==='SUBSCRIBED')publicOnline=true;
         else if(['TIMED_OUT','CHANNEL_ERROR','CLOSED'].includes(s))publicOnline=false;
         channelStatus();
       });
     channels.push(publicCh);
     if(!audience&&!stageOnly){
       const statsCh=client.channel('lecture:stats:'+sessionId,{config:{private:true}})
         .on('broadcast',{event:'stats_changed'},()=>{if(channelGeneration===generation)notifyStats()})
         .subscribe(s=>{
           if(channelGeneration!==generation)return;
           if(s==='SUBSCRIBED')statsOnline=true;
           else if(['TIMED_OUT','CHANNEL_ERROR','CLOSED'].includes(s))statsOnline=false;
           channelStatus();
         });
       channels.push(statsCh);
     }
     scheduleFallback();
   }catch(e){updateStatus({connected:false,error:'即時頻道暫不可用，已啟用斷線備援同步'});scheduleFallback()}
 }
 async function boot(){
   try{
     if(stageOnly){
       if(!sessionId||!stageToken)throw Error('投影連結不完整，請從 B 主控重新複製 A 裝置網址');
       // 驗證唯讀能力憑證，不呼叫 Supabase Auth 登入或建立聽眾身分。
       let incoming=await rpc('lecture_stage_snapshot',{p_session:sessionId,p_token:stageToken});
       stageChannel=incoming.projectionChannel;delete incoming.projectionChannel;
       if(!stageChannel)throw Error('投影通知頻道無效');
       acceptState(incoming,'boot');ready=true;updateStatus({ready:true,error:''});await setupChannels();
     }else if(audience){
       if(!sessionId)throw Error('缺少場次連結，請重新掃描 QR Code');
       credential=loadCredential();
       let prior=null;
       if(credential){try{prior=await rpc('lecture_audience_snapshot',{p_session:sessionId,p_participant:credential.participantId,p_token:credential.token})}
         catch{credential=null;localStorage.removeItem(storageKey())}}
       if(!credential||!prior?.groupNo){ready=false;updateStatus({ready:false,needsGroup:true,error:''});return}
       ready=true;updateStatus({ready:true,needsGroup:false});acceptState(prior,'boot');await setupChannels();
     }else{
       const {data:{session}}=await client.auth.getSession();updateStatus({authenticated:!!session});
       if(!session){updateStatus({ready:false,error:''});return}
       if(!sessionId){updateStatus({ready:false,awaitingChoice:false,error:''});return}
       // v0.7.2：重新開啟主持端時只驗證帳號，不自行跳進先前場次。
       if(status.awaitingChoice){updateStatus({ready:false,error:''});return}
       ready=true;await refresh(true,'boot');if(status.error){ready=false;updateStatus({ready:false});return}
       updateStatus({ready:true});await setupChannels();
       // 先取得專屬唯讀連結，使用者按下複製時不必等待首次 RPC。
       void getStageToken().catch(e=>console.warn('投影連結預先取得失敗：',e.message));
     }
   }catch(e){updateStatus({ready:false,error:e.message})}
 }
 async function selectGroup(groupNo){
   if(!audience||!sessionId)throw Error('不是聽眾加入頁面');
   const num=Number(groupNo);
   if(!Number.isInteger(num)||num<1||num>8)throw Error('請先選擇 1 至 8 組');
   if(credential)await rpc('lecture_audience_set_group',{p_session:sessionId,p_participant:credential.participantId,p_token:credential.token,p_group:num});
   else saveCredential(await rpc('lecture_audience_join_group',{p_session:sessionId,p_group:num}));
   await boot();
 }
 async function drawRoleCard(){
   if(!audience||!credential||!ready)throw Error('請先選擇組別');
   const result=await rpc('lecture_audience_draw_card',{p_session:sessionId,p_participant:credential.participantId,p_token:credential.token});
   await refresh(true,'draw');return result;
 }
 async function login(email,password){
   const {error}=await client.auth.signInWithPassword({email,password});if(error)throw Error(error.message);
   await boot();
 }
 async function logout(){
   ready=false;generation++;clearTimers();
   for(const ch of channels)await client.removeChannel(ch);channels=[];
   const {error}=await client.auth.signOut();if(error)throw Error(error.message);
   projectionToken=null;updateStatus({authenticated:false,ready:false,connected:false,error:'',awaitingChoice:!!sessionId});
 }
 async function getStageToken(rotate=false){
   if(audience||stageOnly||!status.authenticated||!sessionId)throw Error('只有主持人可以取得投影連結');
   if(!projectionToken||rotate)projectionToken=await rpc('lecture_host_stage_link',{p_session:sessionId,p_rotate:rotate});
   return projectionToken;
 }
 // 只有主持人明確點擊「繼續」後，才連線並讀取舊講座。
 async function resumeSession(){
   if(audience||stageOnly||!status.authenticated||!sessionId)throw Error('請先登入並選擇有效的講座場次');
   ready=true;projectionToken=null;
   updateStatus({ready:false,error:''});
   await refresh(true,'resume');
   if(status.error){ready=false;updateStatus({ready:false,awaitingChoice:true});throw Error(status.error)}
   try{localStorage.setItem(SESSION_KEY,sessionId)}catch{}
   updateStatus({ready:true,awaitingChoice:false,error:''});
   await setupChannels();
   void getStageToken().catch(e=>console.warn('投影連結預先取得失敗：',e.message));
 }
 // 從既有控制台回到場次入口，A 投影仍顯示原本場次。
 async function showSessionChooser(){
   if(audience||stageOnly||!status.authenticated)throw Error('僅限主持人操作');
   ready=false;generation++;clearTimers();
   for(const ch of channels)await client.removeChannel(ch);
   channels=[];publicOnline=false;statsOnline=false;
   updateStatus({ready:false,awaitingChoice:!!sessionId,connected:false,error:''});
 }
 async function createSession(){
   // v0.9.8：只呼叫安全新場次 RPC；未升級 SQL 時拒絕建立，避免誤刪歷史資料。
   const id=await rpc('lecture_host_create_safe',{p_title:'這張照片，你怎麼看？'});
   sessionId=id;projectionToken=null;localStorage.setItem(SESSION_KEY,id);
   const u=new URL(location.href);u.searchParams.set('session',id);history.replaceState(null,'',u);
   ready=true;status.sessionId=id;
   await refresh(true,'create-session');updateStatus({ready:true,awaitingChoice:false,error:''});await setupChannels();
   void getStageToken().catch(e=>console.warn('投影連結預先取得失敗：',e.message));return id;
 }
 async function dispatch(action){
   if(audience||stageOnly)throw Error('投影及聽眾端沒有講座控制權限');
   const payload={...action};delete payload.type;
   const result=await rpc('lecture_host_action',{
     p_session:sessionId,p_action:action.type,p_payload:payload,p_expected_revision:state.rev
   });
   if(result.currentSceneId==='s02-results'&&Number(result.reveals?.['s02-results']||0)>0){
     const enriched=await rpc('lecture_host_snapshot',{p_session:sessionId});acceptState(enriched,'command');
   }else acceptState(result,'command');return state;
 }
 async function ch06Prev(){
   if(audience||stageOnly||!status.authenticated||!sessionId)throw Error('只有主持人能控制揭露進度');
   const result=await rpc('lecture_host_ch06_prev',{p_session:sessionId,p_expected_revision:state.rev});
   acceptState(result,'command');return state;
 }
 async function ch06Timer(command){
   if(audience||stageOnly||!status.authenticated||!sessionId)throw Error('只有主持人能控制靜思倒數');
   const result=await rpc('lecture_host_ch06_timer',{p_session:sessionId,p_command:command,p_expected_revision:state.rev});
   acceptState(result,'command');return state;
 }
 async function publishPair(phase){
   if(audience||stageOnly||!status.authenticated||!sessionId)throw Error('只有主持人能公布比較結果');
   const result=await rpc('lecture_host_publish_pair',{p_session:sessionId,p_phase:Number(phase),p_expected_revision:state.rev});
   acceptState(result,'command');return state;
 }
 async function scenarioControl(command,value=null){
   if(audience||stageOnly||!status.authenticated||!sessionId)throw Error('僅限主持人控制角色情境');
   const result=await rpc('lecture_host_scenario_control',{
      p_session:sessionId,p_command:String(command),p_value:value,p_expected_revision:state.rev
   });acceptState(result,'command');return state;
 }
 async function listResponses(runId,limit=40,offset=0){
   if(audience||stageOnly||!status.authenticated||!sessionId)throw Error('只有登入的主持人能檢視回應');
   return rpc('lecture_host_responses',{p_session:sessionId,p_run:runId,p_limit:limit,p_offset:offset});
 }
 async function featureResponse(runId,participantId,approve){
   if(audience||stageOnly||!status.authenticated||!sessionId)throw Error('只有主持人能核准回覆');
   const result=await rpc('lecture_host_feature',{
     p_session:sessionId,p_run:runId,p_participant:participantId,
     p_approve:approve,p_expected_revision:state.rev
   });
   acceptState(result,'command');return state;
 }
 async function submit({runId,value,role}){
   if(!audience||!credential)throw Error('缺少參與者憑證');
   await rpc('lecture_audience_submit',{p_session:sessionId,p_participant:credential.participantId,
     p_token:credential.token,p_run:runId,p_answer:value,p_role:role||null});
   await refresh(true,'submit');return state;
 }
 // 重新切回分頁、斷網復原時補齊快照，不做固定畫面重繪。
 if(typeof document!=='undefined'&&document.addEventListener)
   document.addEventListener('visibilitychange',()=>{if(!document.hidden&&ready)void refresh(true,'visible')});
 if(typeof addEventListener==='function')
   addEventListener('online',()=>{if(ready)void refresh(true,'online')});
 window.LectureAdapter={type:'supabase',get:()=>state,status,client,dispatch,submit,login,logout,createSession,
   listResponses,featureResponse,publishPair,scenarioControl,ch06Timer,ch06Prev,getStageToken,selectGroup,drawRoleCard,resumeSession,showSessionChooser,subscribe(fn){handlers.push(fn);return ()=>handlers=handlers.filter(h=>h!==fn)},
   refresh,get sessionId(){return sessionId},get stageToken(){return projectionToken},get participantId(){return credential?.participantId||null}};
 boot();
})();
