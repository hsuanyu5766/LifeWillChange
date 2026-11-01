(function(){
 'use strict';
 const spec=window.LectureContent,Core=window.LectureCore,Adapter=window.LectureAdapter,PhotoFlow=window.LecturePhotoFlow;
 const params=new URLSearchParams(location.search),view=params.get('view')||'control',audience=view==='audience',stageOnly=view==='stage',controller=!audience&&!stageOnly;
 const remote=Adapter.type==='supabase';
 const playlist=spec.presentationScenes||spec.scenes;
 const playIndex=id=>playlist.findIndex(x=>x.id===id);
 const playOrdinal=id=>{const i=playIndex(id);return i>=0?String(i+1):'舊版'};
 // The underlying scene IDs remain stable for old Supabase records; only the playback order changes.
 const playNeighbors=(id,delta)=>{
   const visible=playIndex(id);
   if(visible>=0)return playlist[visible+delta]||null;
   const original=Core.sceneIndex(id);
   const candidates=playlist.filter(x=>delta>0?Core.sceneIndex(x.id)>original:Core.sceneIndex(x.id)<original);
   return delta>0?candidates[0]||null:candidates[candidates.length-1]||null;
 };
 const configured=Boolean(window.LectureConfig?.supabaseUrl || window.LectureConfig?.supabasePublishableKey);
 const htmlEsc=s=>String(s??'').replace(/[&<>"']/g,k=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k]));
 const $=s=>document.querySelector(s);
 const ui={drawer:false,join:false,entryBusy:false,selected:'',scale:50,role:'教師',toast:'',list:false,reviewRunId:null,reviewOffset:0,reviewData:null,reviewError:'',reviewBusy:false,groupChoice:'',tugChoice:null,tugBusy:false,tugQueued:null,drawBusy:false,previewCardId:'',shareFilter:'all',scenarioBusy:false,compareFilter:'all'};
 let noticeTimer=null,noticeVersion=0;
 let reviewFetchedAt=0,reviewPromise=null,reviewPending=false;
 let lastStageStructure='',lastStageSummary='',lastControlStructure='',lastGateSignature='';
 const uidKey='photo-lecture-v04-user';let participantId=null;
 try{participantId=sessionStorage.getItem(uidKey)}catch{}
 if(!participantId){participantId=Core.makeId('p');try{sessionStorage.setItem(uidKey,participantId)}catch{}}
 let state=Adapter.get();
 let lastAudienceSignature='';
 let scenarioClockTimer=null;
 let lastTugCommit=0;
 let localGroup=0;try{localGroup=Number(sessionStorage.getItem('lecture-demo-group')||0)}catch{}
 const audienceSignature=()=>{
   // 同一活動持續開放時，講者換幕或統計更新不應清空聽眾輸入中的草稿。
   const r=active(),prev=r?(remote?state.myAnswers?.[r.id]:state.answers[r.id]?.[participantId]):null;
   const chapter=state.currentSceneId==='s01-photo'&&PhotoFlow.phase(state)>=2?'ch2':(spec.scenes[Core.sceneIndex(state.currentSceneId)]?.ch||'');
   return JSON.stringify([chapter,state.activeRunId,r?.status||'',prev?.submittedAt||'',prev?.value||null,state.groupNo,state.myRoleCard,state.groupDrawOpen,state.cardsDrawn,localGroup]);
 };
 function stageStructureSignature(){const scene=currentScene(),r=relevantRun(scene);
   return JSON.stringify([scene.id,state.reveals?.[scene.id]||0,state.activeRunId,r?.id,r?.status,r?.resultVisible,state.status,state.groupDrawOpen,state.cardsDrawn,state.cardsRevealed,state.groupCards,state.reveals?.['s03-discuss-timer'],state.reveals?.['s04-compare-teacher'],state.reveals?.['s04-compare-student'],state.reveals?.['s03-shared-groups'],state.reveals?.['s06-silence-timer']]);
 }
 function stageSummarySignature(){const r=relevantRun(currentScene());
   return r?.resultVisible?JSON.stringify(remote?state.summaries?.[r.id]:Core.summarise(state,r.id)):'';
 }
 function controlStructureSignature(){return JSON.stringify([state.rev,state.currentSceneId,state.activeRunId,state.runs.map(r=>[r.id,r.status,r.resultVisible]),state.joinOpen,state.status,state.groupDrawOpen,state.cardsRevealed,state.cardsDrawn,state.groupCards,state.groupCounts]);}
 function gateSignature(){return remote?JSON.stringify([Adapter.status.ready,Adapter.status.authenticated,Adapter.status.ready?'':Adapter.status.error,Adapter.status.needsGroup,Adapter.status.sessionId,Adapter.status.awaitingChoice]):''}
 function updateConnectionHint(){const el=$('.control-status small');if(el&&remote)el.textContent=Adapter.status.connected?'即時同步':'斷線備援同步';
   const ribbon=$('.demo-ribbon');if(ribbon&&audience&&remote)ribbon.textContent=Adapter.status.connected?'即時連線已建立':'斷線備援同步 · 仍可作答';
 }
 function patchReviewPanel(){const panel=$('#review-panel');if(panel){panel.innerHTML=reviewPanel();return true}return false}
 function applyState(meta={}){
   if(remote&&gateSignature()!==lastGateSignature){render();return}
   if(remote&&!Adapter.status.ready)return;
   if(meta.kind==='status'){updateConnectionHint();return}
   if(audience){if(audienceSignature()!==lastAudienceSignature)render();else updateConnectionHint();return}
   if(stageOnly){
     const structure=stageStructureSignature();
     if(structure!==lastStageStructure){
       // Revealing an on-screen question must not rebuild the tug arena. However,
       // a realtime message may also publish/change its counts; patch both in place.
       if(patchCh06Reveal()||patchCh05Reveal()){
         lastStageStructure=structure;
         const sum=stageSummarySignature();
         if(sum!==lastStageSummary){
           const el=$('.display');
           if(el&&!patchTugStage(el))el.innerHTML=visual(currentScene(),relevantRun(currentScene()));
           lastStageSummary=sum;
         }
         return;
       }
       render();return;
     }
     const sum=stageSummarySignature();
     if(sum!==lastStageSummary){const el=$('.display');if(el){if(!patchTugStage(el))el.innerHTML=visual(currentScene(),relevantRun(currentScene()));lastStageSummary=sum}else render()}
     return;
   }
   if(controlStructureSignature()!==lastControlStructure)render();
   else if(meta.kind==='data'&&meta.source==='stats')patchReviewPanel();
   if(ui.reviewRunId&&meta.kind==='notice'&&meta.source==='stats')void fetchReviews(true);
   else if(ui.reviewRunId&&meta.kind==='notice'&&meta.source==='stats-settle')void fetchReviews(true);
 }

 function patchTugStage(display){
   const run=relevantRun(currentScene());if(!run||!run.resultVisible||spec.activities[run.activityId]?.kind!=='tug')return false;
   const res=remote?state.summaries?.[run.id]:Core.summarise(state,run.id);
   const arena=display.querySelector?.('.tug-arena');if(!res||!arena)return false;
   const left=Number(res.left||0),right=Number(res.right||0),n=left+right,pct=n?left/n*100:50;
   arena.querySelector('.tug-left').style.width=pct+'%';arena.querySelector('.tug-right').style.width=(100-pct)+'%';
   arena.querySelector('.tug-node').style.left=pct+'%';
   const x=display.querySelector('[data-tug-left-percent]'),y=display.querySelector('[data-tug-right-percent]');
   const a=display.querySelector('[data-tug-left-count]'),b=display.querySelector('[data-tug-right-count]');
   const c=display.querySelector('[data-tug-total]');
   if(x)x.textContent=(n?Math.round(pct):0)+'%';if(y)y.textContent=(n?Math.round(100-pct):0)+'%';
   if(a)a.textContent=left+' 人';if(b)b.textContent=right+' 人';if(c)c.textContent=n+' 人已選擇立場 · 不設中立 · 活動開放時可隨時改變';
   return true;
 }
 function patchCh06Reveal(){
   const scene=currentScene();
   if(!stageOnly||!['ch06-questions','ch06-ending'].includes(scene.kind))return false;
   const host=$('.ch06-scene[data-scene]');if(!host||host.dataset.scene!==scene.id)return false;
   if(scene.kind==='ch06-questions'&&!host.classList.contains('ch06-questions'))return false; // 轉場→第一問須重建一次
   const count=Math.max(0,Math.min(3,Number(state.reveals?.[scene.id]||0)));
   host.querySelectorAll('[data-ch06-step]').forEach(el=>el.classList.toggle('shown',Number(el.dataset.ch06Step)<=count));
   const quiet=host.querySelector('.ch06-final-whisper');if(quiet)quiet.classList.toggle('shown',count===3);
   return true;
 }
 function patchCh05Reveal(){
   const scene=currentScene();if(!stageOnly||scene.id!=='s05-live')return false;
   const host=$('.ch05-live[data-scene="s05-live"]');if(!host)return false;
   const phase=Math.max(0,Math.min(2,Number(state.reveals?.['s05-live']||0)));
   host.querySelectorAll('[data-ch05-step]').forEach(el=>{
     const shown=Number(el.dataset.ch05Step)<=phase;
     el.classList.toggle('shown',shown);el.setAttribute('aria-hidden',String(!shown));
   });
   return true;
 }
 function currentScene(){return spec.scenes[Math.max(0,Core.sceneIndex(state.currentSceneId))]}
 function currChapter(){return spec.chapters.find(c=>c.id===(state.currentSceneId==='s01-photo'&&PhotoFlow.phase(state)>=2?'ch2':currentScene().ch))}
 function active(){return Core.runById(state,state.activeRunId)}
 function relevantRun(scene){return scene.focusActivityId||scene.activityId?Core.latestRun(state,scene.focusActivityId||scene.activityId):null}
 function feedback(run){if(!run)return '未開始';return run.status==='open'?'作答中':'已結束'}
 // 提示只是短暫通知；計時結束時直接移除提示節點，不重繪聽眾表單。
 function clearToast(){
   if(noticeTimer!==null&&typeof clearTimeout==='function')clearTimeout(noticeTimer);
   noticeTimer=null;noticeVersion++;ui.toast='';
   $('.toast')?.remove?.();$('.transient-notice')?.remove?.();
 }
 function toast(s,duration=4200){
   if(noticeTimer!==null&&typeof clearTimeout==='function')clearTimeout(noticeTimer);
   const version=++noticeVersion;
   ui.toast=String(s);render();
   noticeTimer=setTimeout(()=>{
     if(version!==noticeVersion)return;
     ui.toast='';noticeTimer=null;
     // 避免到期時重建整頁、清掉使用者下一次正在輸入的草稿。
     $('.toast')?.remove?.();$('.transient-notice')?.remove?.();
   },duration);
 }

 async function commit(action){try{
   if(remote){state=await Adapter.dispatch(action)}
   else state=Adapter.save(Core.change(Adapter.get(),action));
   if(action.type==='START_ACTIVITY'){ui.reviewRunId=state.activeRunId;ui.reviewOffset=0;ui.reviewData=null;reviewFetchedAt=0;fetchReviews(true)}
   clearToast();render()
 }catch(e){if(remote&&/stale revision/i.test(e.message)){await Adapter.refresh(true);toast('講座狀態已更新，請再操作一次')}else toast(e.message||'操作失敗')}}
 function nav(delta){const next=playNeighbors(state.currentSceneId,delta);if(next){if(delta>0&&state.currentSceneId==='s01-photo'&&!PhotoFlow.info(state).readyForResults){toast('請先完成共用畫面的兩輪投票，再進入統計比較');return}if(next.ch==='ch6'&&state.activeRunId){toast('請先結束目前開放的作答，再進入第六環節');return}commit({type:'NAVIGATE',sceneId:next.id})}}
 function roleLink(nextView){const u=new URL(location.href);u.searchParams.set('view',nextView);if(remote&&Adapter.sessionId)u.searchParams.set('session',Adapter.sessionId);u.hash='';return u.href}
 function audienceLink(){return roleLink('audience')}
 function stageLink(token){const u=new URL(roleLink('stage'));const key=token||(remote?Adapter.stageToken:null);if(remote){if(!key)throw Error('尚未取得投影授權，請稍後重試');u.hash=new URLSearchParams({stage:key}).toString()}return u.href}
 function controlLink(){return roleLink('control')}
 function copyUrl(url,label){navigator.clipboard?.writeText(url).then(()=>toast(label+'已複製')).catch(()=>toast('無法複製，請手動複製網址'))}
 async function fetchReviews(force=false){
   if(!controller||!ui.reviewRunId||!Core.runById(state,ui.reviewRunId))return;
   if(reviewPromise){if(force)reviewPending=true;return reviewPromise}
   if(!force&&Date.now()-reviewFetchedAt<2200)return;
   const runId=ui.reviewRunId,offset=ui.reviewOffset;
   ui.reviewBusy=true;
   reviewPromise=(async()=>{
     try{const data=await (remote?Adapter.listResponses(runId,40,offset):Promise.resolve(localResponses(runId,offset)));
       if(ui.reviewRunId===runId&&ui.reviewOffset===offset){ui.reviewData=data;ui.reviewError='';reviewFetchedAt=Date.now()}}
     catch(e){if(ui.reviewRunId===runId)ui.reviewError=e.message||'無法讀取回覆'}
     finally{ui.reviewBusy=false;reviewPromise=null;if(!patchReviewPanel())render();if(reviewPending){reviewPending=false;void fetchReviews(true)}}
   })();return reviewPromise;
 }
 function localResponses(runId,offset){const approvals=new Set(state.featured?.[runId]||[]);
   const values=Core.runAnswers(state,runId).sort((a,b)=>b.submittedAt-a.submittedAt);
   return {total:values.length,items:values.slice(offset,offset+40).map(x=>({...x,approved:approvals.has(x.participantId)}))};
 }
 function openReview(runId){ui.reviewRunId=runId;ui.reviewOffset=0;ui.reviewData=null;reviewFetchedAt=0;render();fetchReviews(true)}
 function controlBtn(action,label,style='',data=''){return `<button class="btn ${style}" data-action="${action}" ${data}>${htmlEsc(label)}</button>`}
 function photoControls(){
   const data=PhotoFlow.info(state),p=data.phase;
   const status=run=>!run?'尚未開放':run.status==='open'?'作答中':'已結束';
   const main=data.next;
   return `<section class="photo-director" aria-label="兩輪投票四階段主控">
     <div class="photo-director-heading"><div><span class="eyebrow">01 → 02｜沉浸式共用場景</span><h3>照片不變，揭露身分</h3></div><span class="photo-director-position">${p+1} / 4</span></div>
     <div class="photo-director-steps" role="list" aria-label="四階段進度">${data.steps.map((step,i)=>`<div role="listitem" class="photo-director-step ${p===i?'current':p>i?'passed':''}" aria-current="${p===i?'step':'false'}"><span class="photo-step-no">${i+1}</span><span>${htmlEsc(step.short)}</span></div>`).join('')}</div>
     <div class="photo-director-active"><strong>目前：${htmlEsc(data.steps[p].title)}</strong><p>${htmlEsc(data.steps[p].subtitle)}</p></div>
     <div class="photo-director-runs"><span>第一輪　<strong class="${data.firstDone?'done':''}">${status(data.first)}</strong></span><span>第二輪　<strong class="${data.secondDone?'done':''}">${status(data.second)}</strong></span></div>
     <div class="photo-director-action">${controlBtn('photo-flow-next',main.label,'primary photo-advance',main.action?'':'disabled')}<p class="muted">${htmlEsc(main.message)}</p></div>
     <p class="photo-director-safety">第一輪結束後才可揭露教師身分；教師身分是假設條件。兩輪結果都不會提前公開。</p>
   </section>`;
 }
 async function photoAdvance(){
   if(state.currentSceneId!=='s01-photo')return;
   const info=PhotoFlow.info(state);
   if(!info.next.action){toast(info.next.message||'目前沒有可執行的下一步');return}
   await commit(info.next.action);
 }

 function cardById(id){return spec.roleCards.find(c=>c.id===id)}
 function cardLabel(card){return card?`${card.role}｜${card.title}`:''}
 function roleCardThumb(card,extra=''){
   if(!card)return '';
   return `<button type="button" class="role-card-thumb ${extra}" data-action="preview-card" data-card="${htmlEsc(card.id)}" aria-label="查看角色情境 ${htmlEsc(card.title)}"><img src="${htmlEsc(card.thumb||card.image)}" alt="角色情境：${htmlEsc(card.badge||'')} ${htmlEsc(card.title)}" loading="lazy" decoding="async"/><span class="role-card-thumb-label">${htmlEsc(card.badge||card.role)}</span></button>`;
 }
 function roleCardFigure(card,eager=false){
   if(!card)return '';
   return `<button type="button" class="role-card-figure" data-action="preview-card" data-card="${htmlEsc(card.id)}" aria-label="放大角色情境 ${htmlEsc(card.title)}"><img src="${htmlEsc(card.image)}" alt="角色情境：${htmlEsc(card.badge||'')} ${htmlEsc(card.title)}" loading="${eager?'eager':'lazy'}" decoding="async"/></button>`;
 }
 function roleCardModal(){
   const card=cardById(ui.previewCardId);if(!card)return '';
   return `<div class="modal-back card-preview-back" data-action="preview-close"><div class="role-card-modal" onclick="event.stopPropagation()"><div class="role-card-modal-head"><div><div class="eyebrow">${htmlEsc(card.badge||card.role)}｜${htmlEsc(card.role)}</div><h2>${htmlEsc(card.title)}</h2><p>${htmlEsc(card.focus||'')}</p></div><button class="btn" data-action="preview-close">關閉</button></div><img src="${htmlEsc(card.image)}" alt="角色情境：${htmlEsc(card.title)}" class="role-card-modal-image" loading="eager" decoding="async"/><p class="muted">已使用壓縮後的 WebP 圖片，以兼顧清晰度與讀取速度。</p></div></div>`;
 }
 function statusBar(){const run=active();return `<div class="status-strip"><span class="dot ${run?'green':''}"></span>${run?'活動開放中：'+htmlEsc(spec.activities[run.activityId].label):'目前無開放活動'} · 第 ${playOrdinal(state.currentSceneId)} / ${playlist.length} 畫面</div>`}
 function render(){const root=$('#app');if(!root)return;lastGateSignature=gateSignature();
   // 配置已填但 SDK 載入失敗時必須明確報錯，不能偷偷退回本機示範。
   if(configured&&!remote){root.innerHTML=configErrorView();return}
   if(remote&&!Adapter.status.ready){root.innerHTML=remoteWaitingView();return}
   root.innerHTML=audience?audienceView():stageOnly?stageView():controlView();
   if(audience)lastAudienceSignature=audienceSignature();
   if(stageOnly){lastStageStructure=stageStructureSignature();lastStageSummary=stageSummarySignature()}
   if(controller)lastControlStructure=controlStructureSignature();
   scheduleScenarioTick();if(ui.join)renderQR();if(stageOnly)renderStageQR()}
 function configErrorView(){
   const cfg=window.LectureConfig||{};
   const missing=(!cfg.supabaseUrl||!cfg.supabasePublishableKey);
   return `<div class="mobile-shell"><div class="phone"><header><div class="mobile-brand">一張照片，為什麼讓我在意？｜連線檢查</div></header><main><div class="mobile-activity"><h1>尚未啟用 Supabase 主控</h1><p class="caution">${missing?'config.js 的專案網址及 Publishable Key 必須都填寫完整。':'偵測到 Supabase 設定，但無法載入 Supabase SDK。請確認網路是否封鎖 jsDelivr CDN，並檢查瀏覽器開發者工具的 Network／Console。'}</p><p>請使用完整版 <strong>index.html</strong>，不要使用 v0.4 單檔示範頁。修正後重新載入。</p></div></main></div></div>`;
 }
 function groupJoinView(){return `<div class="mobile-shell"><div class="phone"><header><div class="mobile-brand">一張照片，為什麼讓我在意？</div><small>加入互動講座</small></header><main class="join-group"><div class="eyebrow">加入場次 · 先選擇組別</div><h1>你是哪一組？</h1><p>請選擇老師現場分配的組別。抽取角色情境時，同組所有聽眾都會看到同一張卡。</p><form id="join-group-form"><label for="group-no">我的討論組別</label><select id="group-no" name="group" required><option value="">請選擇組別</option>${Array.from({length:8},(_,i)=>`<option value="${i+1}">第 ${i+1} 組</option>`).join('')}</select><button class="btn primary submit" type="submit">確認組別並加入</button></form><p class="muted">確認後不可自行換組；若選錯，請向主持人反映。</p>${ui.toast?`<p class="caution transient-notice">${htmlEsc(ui.toast)}</p>`:''}</main></div></div>`}
 function remoteWaitingView(){
   if(stageOnly)return `<div class="mobile-shell"><div class="phone"><header><div class="mobile-brand">一張照片，為什麼讓我在意？｜純投影端</div></header><main><div class="locked"><div class="lock-icon">▣</div><h1>正在連接投影</h1><p>${htmlEsc(Adapter.status.error||'正在驗證專屬投影網址，無須輸入主持人帳號密碼。')}</p><button class="btn" data-action="retry">重新連線</button></div></main></div></div>`;
   if(audience)return Adapter.status.needsGroup?groupJoinView():`<div class="mobile-shell"><div class="phone"><header><div class="mobile-brand">一張照片，為什麼讓我在意？</div></header><main><div class="locked"><div class="lock-icon">◌</div><h1>正在加入講座</h1><p>${htmlEsc(Adapter.status.error||'正在確認本場講座的參與資格，請保持頁面開啟。')}</p><button class="btn" data-action="retry">重新連線</button></div></main></div></div>`;
   return `<div class="mobile-shell"><div class="phone"><header><div class="mobile-brand">主持人主控｜一張照片，為什麼讓我在意？</div></header><main><div class="mobile-activity"><h1>${Adapter.status.authenticated?'講座場次選擇':'主控驗證'}</h1><p>${Adapter.status.authenticated?'已登入主持人帳號，請選擇要操作的講座。':'請使用已獲授權的主持人帳號登入，在這裡控制全場畫面與回覆。'}</p>
   ${!Adapter.status.authenticated?`<form id="host-login-form"><label>Email</label><input name="email" type="email" required autocomplete="username"><label>密碼</label><input name="password" type="password" required autocomplete="current-password"><button class="btn primary submit" type="submit">登入主控</button></form>`:
   Adapter.status.awaitingChoice?`<div class="session-choice"><div class="session-choice-card"><div class="eyebrow">偵測到上次使用的講座</div><h2>要繼續，還是重新開始？</h2><p class="muted">請手動選擇，系統不會自動跳轉到現有活動。</p><div class="session-choice-actions"><button class="btn primary" type="button" data-action="resume-session" ${ui.entryBusy?'disabled':''}>繼續既有活動</button><button class="btn" type="button" data-action="create-session" ${ui.entryBusy?'disabled':''}>重新開始（建立新場次）</button></div><p class="muted">重新開始會永久清除你過往場次及其回覆、抽卡紀錄，且無法還原；建立後須重新提供投影及聽眾連結。</p></div></div>`:
   `<button class="btn primary submit" data-action="create-session" ${ui.entryBusy?'disabled':''}>建立一場新的講座</button>`}
   ${Adapter.status.authenticated?`<p><button class="btn ghost" data-action="logout">登出主持人</button></p>`:''}
   ${Adapter.status.error?`<p class="caution">${htmlEsc(Adapter.status.error)}</p>`:''}${ui.toast?`<p class="caution transient-notice" role="alert">${htmlEsc(ui.toast)}</p>`:''}</div></main></div></div>`;
 }
 function stageView(){
  const scene=currentScene(),chapter=currChapter(),index=playIndex(scene.id),run=relevantRun(scene),activeRun=active();
  return `<div class="shell stage stage-clean ${scene.ch==='ch6'?'ch06-stage-shell':''} ${['s01-welcome','s01-photo','s02-results','s02-reasons'].includes(scene.id)?'v097-s12-stage v097-s12-'+scene.id:''} ${['s03-cards','s03-discuss','s03-share'].includes(scene.id)?'v097-s3-stage v097-s3-'+scene.id:''} ${['s04-intro','s04-compare','s04-action','s04-boundary'].includes(scene.id)?'v097-s4-stage v097-s4-'+scene.id:''} ${['s05-vote','s05-live','s05-integrate'].includes(scene.id)?'v097-s5-stage v097-s5-'+scene.id:''} ${['s06-questions','s06-silence','s06-ending','s06-curtain'].includes(scene.id)?'v097-s6-stage v097-s6-'+scene.id:''}">
    ${!remote?'<div class="demo-banner">本機演示 · 非跨裝置連線</div>':''}
    <header class="topbar"><div class="brand">一張照片，為什麼讓我在意？<small>第 ${spec.chapters.indexOf(chapter)+1} 環節｜${htmlEsc(chapter.name)}</small></div><div class="stage-progress">${index<0?'舊版':String(index+1).padStart(2,'0')} / ${playlist.length}</div></header>
    <main class="viewport unified-stage ${(['rolecards','scenario-intro','scenario-discuss','scenario-share','scenario-turn','discussion-bridge'].includes(scene.kind)?'scenario-stage-viewport ch03-viewport':['ch04-intro','ch04-compare','ch04-action','ch04-results','ch04-boundary'].includes(scene.kind)?'ch04-viewport':scene.kind.startsWith('ch05-')?'ch05-viewport':scene.kind.startsWith('ch06-')?'ch06-viewport':'')}"><section class="story">
      <div class="step-label">第 ${spec.chapters.indexOf(chapter)+1} 環節｜${htmlEsc(chapter.name)} <span>${chapter.minutes} 分鐘</span></div>
      <h1>${htmlEsc(scene.title)}</h1><div class="intro">${htmlEsc(scene.text)}</div>
      <div class="pill">核心議題：${htmlEsc(chapter.core)}</div>

    </section><section class="display">${visual(scene,run)}</section></main>
    <footer class="footer"><div class="status-strip"><span class="dot ${activeRun?'green':''}"></span>${activeRun&&scene.ch!=='ch6'?'正在收集回應':'請仔細聆聽'} · ${htmlEsc(chapter.name)}</div><div class="footer-stage">生命教育互動講座</div></footer>
    ${ui.toast?`<div class="toast">${htmlEsc(ui.toast)}</div>`:''}${roleCardModal()}</div>`;
 }
 function controlView(){
  const scene=currentScene(),chapter=currChapter(),open=active(),run=relevantRun(scene),a=scene.activityId?spec.activities[scene.activityId]:null;
  if(!ui.reviewRunId&&state.runs.length)ui.reviewRunId=state.runs[state.runs.length-1].id;
  return `<div class="control-shell">
   <header class="control-top"><div><div class="eyebrow">講者私人操作端 · v0.9.7 S5</div><h1>一張照片，為什麼讓我在意？</h1><p>六環節・情境導演式主控・即時回饋管理</p></div><div class="control-status"><span class="dot ${open?'green':''}"></span>${open?'活動開放中':'目前未開放活動'}<small>${remote?(Adapter.status.connected?'即時同步':'備援輪詢'):'本機模擬'}</small></div></header>
   ${!remote?'<div class="demo-banner">本機示範，須部署 Supabase 才能跨裝置操作</div>':''}
   <nav class="director-chapters" aria-label="六環節目前進度">${spec.chapters.map((c,i)=>`<div class="director-chapter ${chapter.id===c.id?'active':''}"><span>0${i+1}</span><strong>${htmlEsc(c.name)}</strong></div>`).join('')}</nav>
   <div class="control-grid">
    <section class="control-panel"><h2>播放控制 <span class="panel-count">${playOrdinal(scene.id)} / ${playlist.length}</span></h2>
      <div class="active-scene"><div class="eyebrow">${htmlEsc(chapter.name)} · ${chapter.minutes} 分鐘</div><h3>${htmlEsc(scene.title)}</h3><p>${htmlEsc(scene.text)}</p></div>
      ${scene.kind==='ch05-integrate'&&open?.activityId==='a-tug'?'<p class="caution">立場拉鋸尚在開放中：請先在右側結束目前作答，凍結最終結果。</p>':''}
      <div class="rowbuttons">${controlBtn('prev','← 上一畫面','',!playNeighbors(scene.id,-1)?'disabled':'')}${controlBtn('next','下一畫面 →','primary',!playNeighbors(scene.id,1)||(scene.id==='s01-photo'&&!PhotoFlow.info(state).readyForResults)?'disabled':'')}</div>
      ${scene.id==='s01-photo'?photoControls():scene.kind==='ch06-curtain'?'<div class="scenario-control-block"><strong>正式 Ending｜停留畫面</strong><p>三階結語完成後由主持人手動切入。這一頁不會自動換幕、播放音效或開放新作答。</p></div>':scene.kind==='pair-results'?`<div class="scenario-control-block"><strong>兩次投票結果｜分階段揭露</strong><p>兩輪都結束後，才能公開比較。第一次投票答案不會在第二輪開始前公布。</p><div class="rowbuttons">${controlBtn('publish-pair','① 公布兩輪分布','primary','data-phase="1"')}${controlBtn('publish-pair','② 揭露接受 → 不接受','primary',Number(state.reveals?.['s02-results']||0)<1?'disabled':'data-phase="2"')}${controlBtn('publish-pair','隱藏比較結果','ghost','data-phase="0"')}</div><p class="muted">目前階段：${Number(state.reveals?.['s02-results']||0)===0?'尚未公布':Number(state.reveals?.['s02-results']||0)===1?'僅公布兩輪分布':'已揭露轉向人數'}。人數只計算兩輪皆有作答者。</p></div>`:
      scene.kind==='rolecards'?`<div class="scenario-control-block"><strong>轉場 → 抽卡 → 閱讀（${Number(state.reveals?.[scene.id]||0)}/2）</strong><div class="rowbuttons">${controlBtn('reveal-next','揭露下一步','primary',Number(state.reveals?.[scene.id]||0)>=2?'disabled':'')}${controlBtn('reveal-reset','重置引導','ghost')}</div><p>請在右側開放抽取；A 投影只顯示抽取進度，不提前公開其他組的角色卡。</p><p class="muted">討論後進入代表分享，再由主持人指定公開組別。</p></div>`:
      ['scenario-discuss','scenario-share'].includes(scene.kind)?chapter3Controls(scene):scene.kind==='ch04-compare'?chapter4Controls(scene):['ch05-reflect','ch05-live'].includes(scene.kind)?chapter5Controls(scene):scene.kind.startsWith('ch06-')?chapter6Controls(scene):scene.steps.length?`<div class="scenario-control-block"><strong>同頁逐步揭露 ${Number(state.reveals?.[scene.id]||0)}／${scene.steps.length}</strong><div class="rowbuttons">${controlBtn('reveal-next','揭露下一項','primary',Number(state.reveals?.[scene.id]||0)>=scene.steps.length?'disabled':'')}${controlBtn('reveal-reset','重置引導','ghost')}</div><p class="muted">${htmlEsc(scene.steps[Math.min(scene.steps.length-1,Number(state.reveals?.[scene.id]||0))])}</p></div>`:''}
      <details class="scene-picker"><summary>跳到指定畫面</summary><div class="jump-list">${spec.chapters.map((c,i)=>`<div class="chapter-label">${i+1}｜${htmlEsc(c.name)}</div>${playlist.filter(x=>x.ch===c.id).map(s=>`<button class="jump ${scene.id===s.id?'active':''}" data-action="jump" data-id="${s.id}">${htmlEsc(s.title)}</button>`).join('')}`).join('')}</div></details>
      <h2>投影與加入</h2><p class="muted">A 裝置使用專屬唯讀連結，不須登入，以 F11 全螢幕播放；B 裝置保留此管理介面。請勿公開分享投影連結。</p>
      <div class="rowbuttons">${controlBtn('open-stage','開啟免登入投影','primary')}${controlBtn('copy-stage','複製 A 裝置網址','')}${controlBtn('copy-audience','複製聽眾網址','')}</div>
      ${remote?`<div class="rowbuttons">${controlBtn('toggle-join',state.joinOpen?'停止新裝置加入':'開放新裝置加入','')}${controlBtn('session-chooser','場次選擇','ghost')}${controlBtn('logout','登出主控','ghost')}</div>`:''}
    </section>
    <section class="control-panel"><h2>活動與結果</h2>
      <div class="control-block"><p>目前開放：<strong>${open?htmlEsc(spec.activities[open.activityId].label):'無'}</strong></p>
      ${scene.id==='s01-photo'?'<p class="muted">此共用畫面的投票開放與結束，請使用左側四階段主控，避免跳步。</p>':open?controlBtn('close-activity','結束目前作答','danger'):a?controlBtn('start-activity','開放目前畫面活動','primary',`data-id="${a.id}" ${(scene.id==='s02-reveal'&&Number(state.reveals?.[scene.id]||0)<2)||scene.id==='s05-vote'&&Number(state.reveals?.[scene.id]||0)<1?'disabled':''}`):'<p class="muted">切換至有互動題目的畫面，即可開始活動。</p>'}
      ${scene.id!=='s01-photo'&&run&&run.status==='closed'&&!open&&!(run.activityId==='a-photo-first'&&Core.latestRun(state,'a-photo-teacher'))?controlBtn('reopen','重新開放上一輪','',`data-run="${run.id}"`):''}
      ${scene.id!=='s01-photo'&&run&&!['a-photo-first','a-photo-teacher'].includes(run.activityId)?controlBtn('visible',run.resultVisible?'隱藏本輪投影結果':'公開本輪即時結果',run.resultVisible?'':'primary',`data-run="${run.id}" data-visible="${run.resultVisible?'0':'1'}" ${run.activityId==='a-ch04-action'&&run.status!=='closed'?'disabled':''}`):''}
      <p class="muted">選擇題與左右立場拉鋸可以公開即時統計。</p></div>
      <details class="director-secondary" ${scene.ch==='ch3'?'open':''}><summary>八組角色情境抽取 <span>${Number(state.cardsDrawn||0)} / 8 組</span></summary>
      <div class="control-block"><p><strong>已抽取 ${Number(state.cardsDrawn||0)} / 8 組</strong>　${state.groupDrawOpen?'· 現正開放':'· 尚未開放'}</p>
      <div class="rowbuttons">${controlBtn('group-draw-toggle',state.groupDrawOpen?'停止抽取角色情境':'開放角色情境抽取',state.groupDrawOpen?'danger':'primary')}${controlBtn('group-card-reveal',state.cardsRevealed?'隱藏全場分組結果':'公布角色情境分組',state.cardsRevealed?'':'')}${controlBtn('refresh-group-counts','更新組別人數','ghost')}</div>
      <div class="group-status-grid image-mode">${Array.from({length:8},(_,i)=>{const no=i+1,card=spec.roleCards.find(c=>c.id===state.groupCards?.[no]);return `<div class="group-status ${card?'has-card':''}"><strong>第 ${no} 組</strong><small>${state.groupCounts?.[no]??'—'} 位聽眾</small>${card?`${roleCardThumb(card)}<span>${htmlEsc(cardLabel(card))}</span><em>重視：${htmlEsc(card.focus||card.persona||'')}</em>`:'<span>尚未抽取</span>'}</div>`}).join('')}</div>
      <p class="muted">同組共用一張角色情境圖；每張只會被一組抽到。建議在第三環節開放抽取角色情境，公布分組不會影響已抽取結果。</p></div></details>
      <h2>收到的聽眾回覆</h2>
      <p class="muted">這裡會顯示目前收到的選擇題與立場回覆，A 投影只顯示允許公開的統計。</p>
      <div class="run-tabs">${[...state.runs].reverse().map(r=>`<button class="run-tab ${ui.reviewRunId===r.id?'active':''}" data-action="review-run" data-run="${r.id}">${htmlEsc(spec.activities[r.activityId].label)}${r.status==='open'?' ●':''}</button>`).join('')||'<span class="muted">尚無回覆，請先開放活動。</span>'}</div>
      <div id="review-panel">${reviewPanel()}</div>
    </section>
   </div>${ui.toast?`<div class="toast" role="alert">${htmlEsc(ui.toast)}</div>`:''}${roleCardModal()}</div>`;
 }
 function reviewPanel(){
  const run=Core.runById(state,ui.reviewRunId);if(!run)return '<div class="empty">尚未選擇作答輪次。</div>';
  const a=spec.activities[run.activityId],sum=remote?state.summaries?.[run.id]:Core.summarise(state,run.id);
  const data=ui.reviewData;
  return `<div class="review-head"><strong>${htmlEsc(a.label)}</strong><span>${sum?.n??data?.total??0} 份回覆</span>${controlBtn('refresh-review','重新整理','ghost')}</div>
    ${ui.reviewError?`<div class="caution">${htmlEsc(ui.reviewError)}</div>`:''}
    ${!data?'<div class="empty">正在讀取回應，或按「重新整理」。</div>':
      !data.items.length?'<div class="empty">本輪目前沒有回應。</div>':
      `<div class="response-items">${data.items.map(x=>`<div class="response-item">
      <div class="response-meta"><span>匿名回覆 · ${x.role?htmlEsc(x.role):htmlEsc(a.label)}</span><span>${x.submittedAt?new Date(Number(x.submittedAt)).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'}):''}</span></div>
      <p>${htmlEsc(formatResponse(a,x.value))}</p>
      ${(['text','role','reflection'].includes(a.kind)||(a.kind==='choice'&&String(x.value?.reason||'').trim()))?`<div class="rowbuttons">${controlBtn('feature-response',x.approved?'取消公開':a.kind==='choice'?'核准理由投影':'核准投影',x.approved?'danger':'primary',`data-run="${run.id}" data-participant="${htmlEsc(x.participantId)}" data-approve="${x.approved?'0':'1'}"`)}${x.approved?'<span class="approved">已審核公開（目前的核准版本）</span>':''}</div>`:''}
      </div>`).join('')}</div>
      <div class="review-pager">${controlBtn('review-prev','上一批','',ui.reviewOffset<=0?'disabled':'')}<span>${ui.reviewOffset+1}–${Math.min(ui.reviewOffset+40,data.total)} / ${data.total}</span>${controlBtn('review-next','下一批','',ui.reviewOffset+40>=data.total?'disabled':'')}</div>`}
    ${(['text','role','reflection'].includes(a.kind)||(a.kind==='choice'&&a.reason))?`<div class="control-block"><strong>精選回覆安全機制</strong><p class="muted">最多精選 5 則（選擇題僅有理由時可精選）；核准時保存回覆快照，聽眾之後修改答案也不會自動更新已投影文字。</p>${controlBtn('visible',run.resultVisible?'暫停公開文字':'顯示已核准文字',run.resultVisible?'':'primary',`data-run="${run.id}" data-visible="${run.resultVisible?'0':'1'}"`)}</div>`:''}`;
 }
 function formatResponse(a,v){if(a.kind==='tug')return v.side==='left'?a.low:a.high;if(a.kind==='choice')return String(v.choice||'')+(v.reason?'\n理由：'+v.reason:'');if(a.kind==='scale')return '立場刻度：'+v.scale+' / 100';if(a.kind==='reflection')return `我希望成為一位${v.teacher||''}的老師，也不希望失去${v.self||''}的自己。`;return String(v.text||'')}
 function renderStageQR(){const el=$('#stage-qr');if(!el)return;if(typeof QRCode==='undefined'){el.textContent='QR Code 套件無法載入，請使用參與網址';return}el.innerHTML='';new QRCode(el,{text:audienceLink(),width:190,height:190,colorDark:'#183148',colorLight:'#fff'});}
 function placeholder(title,details){return `<div class="placeholder"><div class="place-icon">◇</div><h2>${htmlEsc(title)}</h2><p>${htmlEsc(details)}</p><small>視覺素材將於下一階段替換，本階段只測試系統結構。</small></div>`}
 function scenarioStageVisual(scene){
  const focus=Math.max(0,Math.min(8,Number(state.reveals?.[scene.id]||0)));
  const groupMap=state.groupCards||{};
  const drawn=Number(state.cardsDrawn||0);
  if(!state.cardsRevealed)return `<div class="scenario-stage"><div class="scenario-heading"><span class="micro">角色情境抽取進度</span><strong>${drawn} / 8 組已完成</strong></div><div class="draw-progress"><div style="width:${drawn/8*100}%"></div></div><p class="scenario-wait">${state.groupDrawOpen?'各組正在抽取角色情境。':'等待主持人開放抽取及公布情境。'}</p><p class="caption">全場分組結果尚未公開，請各組先閱讀手機上的情境圖片。</p></div>`;
  if(focus){
    const card=spec.roleCards.find(x=>x.id===groupMap[focus]);
    if(!card)return `<div class="scenario-stage"><div class="scenario-heading"><span class="micro">第 ${focus} 組｜角色情境</span><strong>尚未完成抽取</strong></div><p class="scenario-wait">可以繼續展示下一組，或返回八組總覽。</p></div>`;
    return `<div class="scenario-stage scenario-stage-focus"><div class="scenario-focus-header"><span class="micro">第 ${focus} 組｜${htmlEsc(card.role)}視角</span><strong>${htmlEsc(card.title)}</strong></div><div class="scenario-focus-grid"><div class="scenario-focus-image"><img src="${htmlEsc(card.image)}" alt="第 ${focus} 組角色情境：${htmlEsc(card.title)}" fetchpriority="high" decoding="async"/></div><div class="scenario-focus-copy"><span class="scenario-badge">${htmlEsc(card.badge||card.role)}</span><h2>${htmlEsc(card.title)}</h2><h3>這個角色重視什麼？</h3><p>${htmlEsc(card.focus||card.persona||'')}</p><h3>他的心聲</h3><blockquote>${htmlEsc(card.quote||card.thought||'')}</blockquote><small>從這個視角思考教師形象與私人生活界線</small></div></div></div>`;
  }
  return `<div class="scenario-stage scenario-stage-overview"><div class="scenario-heading"><span class="micro">八組角色情境總覽</span><strong>${drawn} / 8 組已完成</strong></div><div class="scenario-overview-grid">${Array.from({length:8},(_,i)=>{const n=i+1,card=spec.roleCards.find(x=>x.id===groupMap[n]);return `<div class="scenario-overview-item"><div class="scenario-overview-photo">${card?`<img src="${htmlEsc(card.thumb||card.image)}" alt="第 ${n} 組：${htmlEsc(card.title)}" loading="eager" decoding="async"/>`:'<div class="scenario-empty-photo">待抽取</div>'}</div><div class="scenario-overview-caption"><strong>第 ${n} 組</strong><span>${card?htmlEsc(card.title):'尚未抽取'}</span></div></div>`}).join('')}</div></div>`;
 }
 function scenarioTimerState(){
  const v=state.reveals?.['s03-discuss-timer'];return v&&typeof v==='object'?v:{remaining:240,endAt:null};
 }
 function remainingScenarioSeconds(){const timer=scenarioTimerState();return timer.endAt==null?Math.max(0,Number(timer.remaining??240)):Math.max(0,Math.ceil((Number(timer.endAt)-Date.now())/1000));}
 function formatScenarioClock(seconds){const n=Math.max(0,Math.min(600,Number(seconds)||0));return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}
 function ch06TimerState(){const v=state.reveals?.['s06-silence-timer'];return v&&typeof v==='object'?v:{remaining:10,endAt:null};}
 function remainingCh06Seconds(){const v=ch06TimerState();return v.endAt==null?Math.max(0,Math.min(10,Number(v.remaining??10))):Math.max(0,Math.min(10,Math.ceil((Number(v.endAt)-Date.now())/1000)));}
 function tickCh06Clock(){
   const left=remainingCh06Seconds(),v=ch06TimerState();
   document.querySelectorAll('.ch06-clock-value').forEach(el=>el.textContent='00:'+String(left).padStart(2,'0'));
   document.querySelectorAll('.ch06-time-fill').forEach(el=>el.style.width=left*10+'%');
   document.querySelectorAll('.ch06-clock-state').forEach(el=>el.textContent=left===0?'靜思已完成，等待講者切換':v.endAt!=null?'靜思進行中':left<10?'靜思已暫停':'等待主持人開始');
 }
 function scheduleScenarioTick(){
   if(scenarioClockTimer!==null&&typeof clearTimeout==='function')clearTimeout(scenarioClockTimer);
   scenarioClockTimer=null;
   if(audience||!['scenario-discuss','ch06-silence'].includes(currentScene().kind))return;
   scenarioClockTimer=setTimeout(()=>{scenarioClockTimer=null;if(currentScene().kind==='ch06-silence')tickCh06Clock();else tickScenarioClock();scheduleScenarioTick()},200);
 }
 function tickScenarioClock(){const n=remainingScenarioSeconds();document.querySelectorAll('.lecture-timer-clock').forEach(el=>{el.textContent=formatScenarioClock(n)});document.querySelectorAll('.lecture-timer-progress').forEach(el=>{el.style.width=(n/240*100)+'%'});const r=$('.lecture-timer-state');if(r){const v=scenarioTimerState();r.textContent=n===0?'時間已到':v.endAt!=null?'計時進行中':'已暫停／尚未開始'}}
 function challengeSide(card){return card?.role==='教師'?'學生':'教師'}
 function chapter3StageVisual(scene){
  if(scene.kind==='scenario-intro')return `<div class="ch03-intro"><div class="ch03-overline">CHAPTER 03 · PERSPECTIVE</div><h2>同一張照片，<br>換個位置看見不同的故事。</h2><div class="ch03-identity-row"><div>教師的處境</div><span>↔</span><div>學生的想法</div></div><p>先理解角色的心聲，再站在另一方的立場提出挑戰。</p></div>`;
  if(scene.kind==='scenario-turn'||scene.kind==='discussion-bridge')return `<div class="ch03-intro ch03-turn"><div class="ch03-overline">REFLECTION · 思考轉折</div><h2>${htmlEsc(scene.title)}</h2><p>${htmlEsc(scene.text)}</p></div>`;
  if(scene.kind==='scenario-discuss')return `<div class="v097-ch03-layout v097-ch03-discuss-layout">
    <div class="v097-ch03-illustrated-card"><img src="assets/visual-097/ch03-scene-02.png" alt="小組立場挑戰的正式流程插畫" decoding="async" fetchpriority="high"/><div class="v097-ch03-paper-copy"><span class="v097-ch03-paper-label">GROUP DISCUSSION</span><strong>先理解，再挑戰</strong><small>請口頭討論 · 無須上傳文字</small></div></div>
    <section class="v097-ch03-content v097-ch03-discuss-content"><div class="v097-ch03-kicker">CHAPTER 03 · GROUP DISCUSSION</div><h2>換個位置，你會怎麼看？</h2><p class="v097-ch03-description">讀懂角色的心聲，再換到另一方的立場提出具體理由。</p>
    <div class="v097-ch03-steps"><article><b>01</b><div><strong>這個角色最重視什麼？</strong><p>先看見他的處境與在意的價值。</p></div></article><article><b>02</b><div><strong>換到另一方，你會怎麼質疑？</strong><p>提出理由，而不是只說同意或不同意。</p></div></article></div>
    <div class="v097-ch03-discuss-bottom"><div class="v097-ch03-perspective"><small>反向挑戰規則</small><span>教師情境 → 學生視角</span><span>學生情境 → 教師視角</span></div><div class="v097-ch03-clock"><div><small>小組討論倒數</small><strong class="lecture-timer-clock">${formatScenarioClock(remainingScenarioSeconds())}</strong></div><div class="ch03-time-rail"><i class="lecture-timer-progress" style="width:${remainingScenarioSeconds()/240*100}%"></i></div></div></div>
    </section></div>`;
  if(scene.kind==='scenario-share'){
    const group=Number(state.reveals?.['s03-share']||0),card=state.cardsRevealed?spec.roleCards.find(c=>c.id===state.groupCards?.[group]):null;
    if(!card)return `<div class="v097-ch03-layout v097-ch03-share-layout">
      <div class="v097-ch03-illustrated-card"><img src="assets/visual-097/ch03-scene-03.png" alt="教師與學生代表分享的正式流程插畫" decoding="async" fetchpriority="high"/><div class="v097-ch03-paper-copy"><span class="v097-ch03-paper-label">REPRESENTATIVE SHARING</span><strong>聽見不同的理由</strong><small>教師與學生情境各邀一組</small></div></div>
      <section class="v097-ch03-content v097-ch03-share-wait"><div class="v097-ch03-kicker">CHAPTER 03 · REPRESENTATIVE SHARING</div><h2>不同立場的交會</h2><p>${!state.cardsRevealed?'等待主持人公布分組並邀請代表。':'請主持人在 B 主控選擇要分享的組別。'}</p><div class="v097-ch03-quote-line">理解一個人的理由，不必先認同他的選擇。</div><small>如有時間，主持人可以彈性邀請其他組別。</small></section></div>`;
    const other=challengeSide(card),student=card.role==='學生';
    return `<div class="v097-ch03-active-share"><section class="v097-ch03-rolecard"><div class="v097-ch03-rolecard-caption">第 ${group} 組｜${htmlEsc(card.role)}情境</div><img src="${htmlEsc(card.image)}" alt="第 ${group} 組：${htmlEsc(card.title)}完整角色卡" decoding="async" fetchpriority="high"/></section><section class="v097-ch03-content v097-ch03-share-copy"><div class="v097-ch03-kicker">CHAPTER 03 · REPRESENTATIVE SHARING</div><h2>第 ${group} 組｜${htmlEsc(card.title)}</h2><div class="v097-ch03-role-route"><span>抽到：${htmlEsc(card.role)}情境</span><b>→</b><span>${other}視角挑戰</span></div><article class="v097-ch03-share-quote"><small>這個角色的心聲</small><strong>「${htmlEsc(card.quote||card.thought||'')}」</strong></article><article class="v097-ch03-share-challenge"><small>請站在${other}立場分享</small><strong>「我們想挑戰這個想法，因為……」</strong></article><p class="v097-ch03-share-note">提出具體質疑與理由；理解他人，不代表一定認同。</p></section></div>`;
  }
  return '';
 }
 function chapter4Selected(kind){
   const n=Number(state.reveals?.[kind==='教師'?'s04-compare-teacher':'s04-compare-student']||0);
   const card=state.cardsRevealed?spec.roleCards.find(c=>c.id===state.groupCards?.[n]&&c.role===kind):null;
   return {n,card};
 }
 function chapter4PinnedInfo(){const a=chapter4Selected('教師'),b=chapter4Selected('學生');return `<div class="ch04-pin-status"><div><b>教師情境</b><span>${a.card?`第 ${a.n} 組｜${htmlEsc(a.card.title)}`:'尚未選定'}</span></div><div><b>學生情境</b><span>${b.card?`第 ${b.n} 組｜${htmlEsc(b.card.title)}`:'尚未選定'}</span></div></div>`;}
 function chapter4Controls(){
   const shown=Array.isArray(state.reveals?.['s03-shared-groups'])?state.reveals['s03-shared-groups']:[];
   const entries=shown.map(n=>({n,card:spec.roleCards.find(c=>c.id===state.groupCards?.[n])})).filter(x=>x.card);
   return `<div class="scenario-control-block ch04-choose"><strong>第四環節｜沿用剛才實際分享的兩張情境</strong><p>首次分享的教師、學生情境會自動保留。你也可以從實際分享過的組別中改選，不會影響其他組的抽卡結果。</p>${chapter4PinnedInfo()}<div class="rowbuttons">${controlBtn('share-filter','全部','ghost','data-filter="all"')}${controlBtn('share-filter','教師','ghost','data-filter="教師"')}${controlBtn('share-filter','學生','ghost','data-filter="學生"')}</div><div class="ch03-group-pick">${entries.filter(e=>ui.shareFilter==='all'||e.card.role===ui.shareFilter).map(e=>{const selected=chapter4Selected(e.card.role).n===e.n;return `<button class="ch03-group-button ${selected?'active':''}" data-action="scenario-pin" data-group="${e.n}" data-role="${htmlEsc(e.card.role)}"><strong>第 ${e.n} 組 · ${htmlEsc(e.card.role)}</strong><small>${htmlEsc(e.card.title)}${selected?' · 已選定':''}</small></button>`}).join('')||'<p class="muted">請先回第三環節，選擇教師與學生各一組正式分享。</p>'}</div></div>`;
 }
 function chapter4StageVisual(scene,run){
   if(scene.kind==='ch04-intro')return `<div class="ch04-opening v097-ch04-opening"><div class="ch04-overline">CHAPTER 04 · UNDERSTANDING & DIFFERENCE</div><div class="v097-ch04-opening-center"><div class="v097-ch04-opposing"><span>理解對方</span><i aria-hidden="true"></i><span>保有立場</span></div><h2>理解之後，<br><em>一定要同意嗎？</em></h2><div class="v097-ch04-gold-rule" aria-hidden="true"></div><p class="v095-ch04-sub ${Number(state.reveals?.['s04-intro']||0)>=1?'shown':''}">當雙方都有各自的理由，<br>卻仍無法達成共識，我們還能怎麼做？</p></div><div class="v097-ch04-bottom-hint">從「理解」走向「如何相處」</div></div>`;
   if(scene.kind==='ch04-compare'){
     const sides=['教師','學生'].map(role=>{const item=chapter4Selected(role),card=item.card;return `<article class="ch04-compare-card ${role==='教師'?'teacher':'student'}"><header><span>${role}角色情境</span><strong>${card?'第 '+item.n+' 組':'尚未選定'}</strong></header>${card?`<div class="ch04-compare-inner"><img src="${htmlEsc(card.image)}" alt="${htmlEsc(role)}情境：${htmlEsc(card.title)}" loading="eager" decoding="async"/><div class="ch04-compare-text"><h3>${htmlEsc(card.title)}</h3><small>情境中的原始心聲</small><blockquote>「${htmlEsc(card.quote||card.thought||'')}」</blockquote><p>這組從<strong>${role==='教師'?'學生':'教師'}立場</strong>提出挑戰</p></div></div>`:`<div class="ch04-missing">請 B 主控在第三環節分享，並選定一組${role}情境。</div>`}</article>`}).join('');
     return `<div class="ch04-comparison"><div class="ch04-overline">不同立場的交會 · 承接剛才兩組代表</div><h2>當雙方都有自己的理由……</h2><div class="ch04-compare-grid">${sides}</div><p class="ch04-big-question">理解對方的理由，就一定要認同嗎？</p><p class="ch04-caption">卡片文字為角色情境原文，並非現場代表逐字發言。</p></div>`;
   }
   if(scene.kind==='ch04-action'&&run?.status==='closed'&&run.resultVisible)return chapter4StageVisual({...scene,kind:'ch04-results'},run);
   if(scene.kind==='ch04-action')return `<div class="ch04-poll"><div class="ch04-overline">ACTION · 行動選擇</div><h2>如果我們無法取得共識，<br>你會優先怎麼做？</h2><div class="ch04-options">${spec.activities['a-ch04-action'].options.map((o,i)=>`<div class="ch04-option"><span>${'ABCD'[i]}</span>${htmlEsc(o)}</div>`).join('')}</div><p>${run?.status==='open'?'請拿起手機，選擇最接近自己真實想法的行動。':run?.status==='closed'?'作答已結束。等待主持人於此畫面公布全場選擇。':'等待主持人開放手機作答。'}</p></div>`;
   if(scene.kind==='ch04-results'){
     const res=run?.resultVisible?(remote?state.summaries?.[run.id]:Core.summarise(state,run.id)):null;
     if(!res)return `<div class="ch04-poll ch04-wait"><div class="ch04-overline">COLLECTIVE CHOICES · 全場回應</div><h2>不同的回應，<br>反映不同的在意。</h2><p>結果尚未公布。請先完成投票，再由主持人開啟統計。</p></div>`;
     const opts=spec.activities['a-ch04-action'].options,n=Number(res.n||0);
     return `<div class="ch04-result"><div class="ch04-overline">COLLECTIVE CHOICES · 全場行動選擇</div><h2>面對分歧，我們會如何行動？</h2><p>共 ${n} 位聽眾作答 · 沒有標準答案</p><div class="ch04-bars">${opts.map((o,i)=>{const cnt=Number(res.counts?.[o]||0),pc=n?Math.round(cnt/n*100):0;return `<div class="ch04-bar"><div class="ch04-bar-head"><span><b>${'ABCD'[i]}</b>${htmlEsc(o)}</span><strong>${cnt} 人 · ${pc}%</strong></div><div class="ch04-track"><i style="width:${n?100*cnt/n:0}%"></i></div></div>`}).join('')}</div><p class="ch04-bottom">我們不必選擇相同的行動，才能開始理解彼此。</p></div>`;
   }
   return `<div class="ch04-ending v097-ch04-ending"><div class="ch04-overline">CHAPTER 04 · REFLECTION</div><div class="v097-ch04-end-center"><div class="v097-ch04-symbol" aria-hidden="true"><span></span><i></i><span></span></div><h2>理解他人之後，<br><em>我還能保有自己嗎？</em></h2><div class="ch04-reflect-grid"><div><b>01 · 可以調整的部分</b><p>面對不同的期待，<br>我願意調整什麼？</p></div><div><b>02 · 想守護的價值</b><p>有哪些價值，<br>是我不願放棄的？</p></div></div></div><p class="v097-ch04-end-next">接下來，當自我選擇與教師角色責任拉扯，我又會怎麼選？</p></div>`;
 }
 function chapter3Controls(scene){
   if(scene.kind==='scenario-discuss'){
     const tm=scenarioTimerState(),secs=remainingScenarioSeconds();
     return `<div class="scenario-control-block"><strong>小組討論倒數｜預設 4 分鐘</strong><p>討論內容採口頭交流，手機持續顯示各組已抽取的情境。</p><div class="ch03-controller-clock lecture-timer-clock">${formatScenarioClock(secs)}</div><div class="rowbuttons">${controlBtn('scenario-timer',secs===240&&tm.endAt==null?'開始倒數':tm.endAt!=null?'暫停倒數':'繼續倒數','primary',`data-command="${tm.endAt!=null?'timer-pause':'timer-start'}" ${secs<=0?'disabled':''}`)}${controlBtn('scenario-timer','重設為 04:00','ghost','data-command="timer-reset"')}</div><p class="muted lecture-timer-state">${tm.endAt!=null?'計時進行中':'已暫停／尚未開始'}</p></div>`;
   }
   if(scene.kind==='scenario-share'){
     const map=state.groupCards||{},groups=Array.from({length:8},(_,i)=>{const no=i+1;return {no,card:spec.roleCards.find(c=>c.id===map[no])}});
     const list=groups.filter(g=>g.card&&(ui.shareFilter==='all'||g.card.role===ui.shareFilter));
     return `<div class="scenario-control-block"><strong>代表分享｜自由指定組別</strong><p>原則先選教師情境與學生情境各一組；時間充裕再邀請其他組。</p><div class="rowbuttons">${controlBtn('share-filter','全部','',`data-filter="all"`)}${controlBtn('share-filter','教師情境','',`data-filter="教師"`)}${controlBtn('share-filter','學生情境','',`data-filter="學生"`)}</div><p class="muted">目前篩選：${ui.shareFilter==='all'?'全部':ui.shareFilter+'情境'}，目前投影：${Number(state.reveals?.['s03-share']||0)?'第 '+state.reveals['s03-share']+' 組':'尚未指定'}。</p>${!state.cardsRevealed?`<p class="caution">請先按下右側「公布角色情境分組」，才可公開代表情境。</p>`:''}<div class="ch03-group-pick">${list.map(g=>`<button class="ch03-group-button ${Number(state.reveals?.['s03-share']||0)===g.no?'active':''}" data-action="scenario-spotlight" data-group="${g.no}" ${!state.cardsRevealed?'disabled':''}><strong>第 ${g.no} 組</strong><small>${htmlEsc(g.card.role)}｜${htmlEsc(g.card.title)}</small></button>`).join('')||'<p class="muted">目前尚未有符合條件的已抽取組別。</p>'}</div><div class="rowbuttons">${controlBtn('scenario-spotlight','返回等待代表畫面','ghost','data-group="0"')}</div><p class="muted">首次展示的教師／學生情境會自動保留為第四環節的對照情境。若額外邀請更多組，可在第四環節手動更換。</p>${chapter4PinnedInfo()}</div>`;
   }
   return '';
 }
 async function scenarioCommit(command,value){
   if(ui.scenarioBusy)return;ui.scenarioBusy=true;
   try{if(remote)state=await Adapter.scenarioControl(command,value);else state=Adapter.save(Core.change(Adapter.get(),{type:'SCENARIO_CONTROL',command,value}));render()}
   catch(e){toast(e.message||'操作失敗')}finally{ui.scenarioBusy=false}
 }
 function chapter5Controls(scene){
  const phase=Math.min(2,Math.max(0,Number(state.reveals?.[scene.id]||0))),run=Core.latestRun(state,'a-tug');
  return `<div class="scenario-control-block ch05-control-block"><strong>反向提問｜逐步揭露</strong><p>不中斷原本的拉鋸投票。聽眾仍能在手機改變立場，A 會持續更新同一輪統計。</p><div class="rowbuttons">${controlBtn('reveal-next',phase===0?'① 揭露自我選擇方問題':phase===1?'② 揭露角色責任方問題':'兩側問題已全部揭露','primary',phase===2?'disabled':'')}${controlBtn('reveal-reset','重置兩側提問','ghost')}</div><p class="muted">目前已揭露 ${phase}／2 題。${run?.status==='open'?'拉鋸投票仍開放，請在結束前讓聽眾自由換邊。':run?'投票已結束，可直接進入自我整合。':'尚未建立立場拉鋸活動。'}</p></div>`;
 }
 function chapter6Controls(scene){
   if(scene.kind==='ch06-silence'){
     const timer=ch06TimerState(),left=remainingCh06Seconds();
     return `<div class="scenario-control-block ch06-control"><strong>十秒靜思｜B 主控計時</strong><p>按下開始後 A 投影才會倒數；倒數結束不會自動換幕。可暫停或重設。</p><div class="ch06-controller-clock ch06-clock-value">00:${String(left).padStart(2,'0')}</div><p class="muted ch06-clock-state">${left===0?'靜思已完成，等待講者切換':timer.endAt!=null?'靜思進行中':'等待主持人開始'}</p><div class="rowbuttons">${controlBtn('ch06-timer',timer.endAt!=null?'暫停倒數':left<10?'繼續倒數':'開始十秒靜思','primary',`data-command="${timer.endAt!=null?'pause':'start'}" ${left<=0?'disabled':''}`)}${controlBtn('ch06-timer','重設 00:10','ghost','data-command="reset"')}</div></div>`;
   }
   if(['ch06-questions','ch06-ending'].includes(scene.kind)){
     const phase=Math.max(0,Math.min(3,Number(state.reveals?.[scene.id]||0)));
     const unit=scene.kind==='ch06-questions'?'問':'階';
     return `<div class="scenario-control-block ch06-control"><strong>${scene.kind==='ch06-questions'?'人生三問｜逐題揭露':'最終階梯｜逐階浮現'}</strong><p>目前 ${phase} / 3 ${unit}已揭露。B 每按一次才前進；最後一階定格，不自動換頁。</p><div class="rowbuttons">${controlBtn('ch06-prev',`返回上一${unit}`,'ghost',phase===0?'disabled':'')}${controlBtn('reveal-next',`揭露下一${unit}`,'primary',phase===3?'disabled':'')}${controlBtn('reveal-reset','重設','ghost')}</div></div>`;
   }
   return '';
 }
 async function ch06PrevCommit(){
   try{if(remote)state=await Adapter.ch06Prev();else state=Adapter.save(Core.change(Adapter.get(),{type:'CH06_PREV'}));render()}
   catch(e){if(remote&&/stale revision/i.test(e.message))await Adapter.refresh(true);toast(e.message||'返回上一階失敗')}
 }
 async function ch06TimerCommit(command){
   try{
     if(remote)state=await Adapter.ch06Timer(command);
     else state=Adapter.save(Core.change(Adapter.get(),{type:'CH06_TIMER',command}));
     render();
   }catch(e){if(remote&&/stale revision/i.test(e.message))await Adapter.refresh(true);toast(e.message||'靜思控制失敗')}
 }
 function ch05Rail(run,compact=false){
   const activity=spec.activities['a-tug'];
   const res=run?.resultVisible?(remote?state.summaries?.[run.id]:Core.summarise(state,run.id)):null;
   const left=Math.max(0,Number(res?.left||0)),right=Math.max(0,Number(res?.right||0)),n=left+right,pct=n?left/n*100:50;
   const shown=!!res;
   return `<div class="ch05-rail ${compact?'compact':''} ${shown?'':'unpublished'}">
     <div class="ch05-rail-labels"><div><span>LEFT · 自我選擇</span><strong data-tug-left-percent>${shown?(n?Math.round(pct):0)+'%':'—'}</strong><small data-tug-left-count>${shown?left+' 人':'尚未公布'}</small></div><div><span>RIGHT · 角色責任</span><strong data-tug-right-percent>${shown?(n?Math.round(100-pct):0)+'%':'—'}</strong><small data-tug-right-count>${shown?right+' 人':'尚未公布'}</small></div></div>
     <div class="tug-arena" aria-label="自我選擇與角色責任的即時比例"><div class="tug-left" style="width:${shown?pct:50}%"></div><div class="tug-right" style="width:${shown?100-pct:50}%"></div><div class="tug-center-line"></div><i class="tug-node" style="left:${shown?pct:50}%"></i></div>
     <div class="ch05-rail-foot"><span>${run?.status==='open'?'● 活動進行中':run?.status==='closed'?'● 本輪已結束':'○ 等待開放'}</span><span data-tug-total>${shown?n+' 人已選擇立場 · 不設中立 · 活動開放時可隨時改變':'全場結果尚未公布 · 請先獨立作答'}</span></div>
   </div>`;
 }
 function chapter5StageVisual(scene,run){
   const activity=spec.activities['a-tug'];
   if(scene.kind==='ch05-intro')return `<div class="ch05-stage ch05-intro"><div class="ch05-kicker">CHAPTER 05 · VALUE CONFLICT</div><h2>當「做自己」與<br>「回應社會期待」<br>無法完全兼顧時……</h2><div class="ch05-intro-values"><span>自我選擇</span><b>×</b><span>角色責任</span></div><p>現在，問題回到我們自己身上。</p></div>`;
   if(scene.kind==='ch05-vote')return `<div class="ch05-stage ch05-vote v097-ch05-vote"><div class="ch05-kicker">CHAPTER 05 · CHOICE & RESPONSIBILITY</div><div class="v097-ch05-vote-head"><p class="v097-ch05-overline">當「自己」與「教師」的期待交會</p><h2>你的選擇是什麼？</h2><p class="ch05-question">${htmlEsc(activity.question)}</p></div><div class="ch05-vote-grid"><article><div>01 · LEFT</div><strong>自我選擇</strong><p>保留自己的生活方式、自主性與個人價值</p></article><article><div>02 · RIGHT</div><strong>角色責任</strong><p>思考教師身分帶來的專業責任與他人期待</p></article></div><div class="ch05-vote-info">${run?.status==='open'?'活動已開放｜拿起手機，選擇一個目前更優先的價值':run?.status==='closed'?'本輪投票已結束｜準備觀察全場立場':'請仔細聆聽｜等待主持人開放投票'} · 沒有中立選項</div><div class="v097-ch05-vote-foot">這是此刻的優先選擇，不代表另一種價值不重要。</div></div>`;
   if(scene.kind==='ch05-live')return `<div class="ch05-stage ch05-live v097-ch05-live" data-scene="s05-live"><div class="ch05-kicker">CHAPTER 05 · LIVE VALUE TUG</div><h2>當價值產生拉扯，<br><em>你會站在哪一邊？</em></h2><div class="ch05-live-principles"><span>保留自己重視的生活與價值</span><span>回應教師身分的責任與期待</span></div>${ch05Rail(run)}<div class="v095-live-prompts">${scene.steps.map((q,i)=>`<div class="v095-live-prompt ${Number(state.reveals?.['s05-live']||0)>=i+1?'shown':''}" data-ch05-step="${i+1}" aria-hidden="${Number(state.reveals?.['s05-live']||0)<i+1}"><b>${i+1===1?'自我選擇方':'角色責任方'} · 反向提問</b><span>${htmlEsc(q)}</span></div>`).join('')}</div><div class="ch05-live-note">聽見另一端的理由後，可以重新選擇。立場拉鋸不會中斷。</div></div>`;
   if(scene.kind==='ch05-reflect'){
     const phase=Math.min(2,Math.max(0,Number(state.reveals?.['s05-followup']||0)));
     return `<div class="ch05-stage ch05-reflect"><div class="ch05-kicker">STEP 03 · REFLECTION</div><h2>如果你站在這一邊……</h2><div class="ch05-reflect-grid"><article class="ch05-reflect-card left ${phase<1?'waiting':''}"><div class="ch05-card-head"><b>偏向自我選擇</b><small>LEFT · MY CHOICE</small></div>${phase>=1?`<h3>作為教師的你，<br>不能忽視哪些責任？</h3><p>當我保留自由，我仍應承擔什麼？</p>`:'<div class="ch05-hidden-question">等待主持人揭露思考問題</div>'}</article><article class="ch05-reflect-card right ${phase<2?'waiting':''}"><div class="ch05-card-head"><b>偏向角色責任</b><small>RIGHT · MY RESPONSIBILITY</small></div>${phase>=2?`<h3>你願意為這個身分<br>改變到什麼程度？</h3><p>當我回應期待，哪些部分仍屬於自己？</p>`:'<div class="ch05-hidden-question">等待主持人揭露思考問題</div>'}</article></div><div class="ch05-reflect-bottom"><p>聽完另一邊的理由，你還會維持原本的選擇嗎？</p>${ch05Rail(run,true)}</div></div>`;
   }
   if(scene.kind==='ch05-integrate')return `<div class="ch05-stage ch05-integrate v097-ch05-integrate"><div class="ch05-kicker">CHAPTER 05 · SELF-INTEGRATION</div><div class="v097-ch05-integrate-main"><div class="ch05-line"><span class="v097-ch05-self">自我選擇</span><i aria-hidden="true"></i><span class="v097-ch05-duty">角色責任</span></div><div class="v097-ch05-rule" aria-hidden="true"></div><h2>我要如何<br><em>既不失去自己，</em><br>也不忽略教師應承擔的責任？</h2><p>選擇一個優先考量的價值，<br>不代表另一個價值必須消失。</p></div><div class="v097-ch05-integrate-foot">找到自己能夠承擔的選擇，讓價值走進生活。</div></div>`;
   return '';
 }
 function chapter6StageVisual(scene){
   const phase=Math.max(0,Math.min(3,Number(state.reveals?.[scene.id]||0)));
   if(scene.kind==='ch06-transition')return `<div class="ch06-scene ch06-transition" data-scene="${scene.id}"><div class="ch06-topline">CHAPTER 06 · REFLECTION</div><h2>當我們做出選擇時，<br>也正在決定自己<br>要成為怎樣的人。</h2><p>從看待他人，回到自己的生命。</p></div>`;
   if(scene.kind==='ch06-questions'){
     if(phase===0)return `<div class="ch06-scene ch06-transition" data-scene="${scene.id}"><div class="ch06-topline">CHAPTER 06 · REFLECTION</div><h2>當我們做出選擇時，<br>也正在決定自己<br>要成為怎樣的人。</h2><p>從看待他人，回到自己的生命。</p></div>`;
     const cards=[
       ['人為何而活？','「面對這兩張照片，我為什麼會產生這樣的感受？」','我在意他人看法，是因為我想要成為什麼樣的人？'],
       ['應如何生活？','「當我成為老師，別人眼中的我改變了嗎？」','當我的生活方式同時受到自己的想法與別人的期待影響時，我會怎麼選擇？'],
       ['要如何才能活出應活的生命？','「如果有一天，你成為大家眼中的好老師，卻變得不像自己，該怎麼辦？」','我願意如何實踐自己相信的價值？']
     ];
     return `<div class="ch06-scene ch06-questions" data-scene="${scene.id}"><div class="ch06-topline">CHAPTER 06 · LIFE QUESTIONS</div><h2>人生三問</h2><p class="ch06-sub">走過照片、他人的期待與自己的選擇，現在，把問題留給自己。</p><div class="ch06-question-grid">${cards.map(([title,context,reflect],i)=>`<article class="ch06-question-card ${phase>=i+1?'shown':''}" data-ch06-step="${i+1}"><span class="ch06-q-num">0${i+1}</span><h3>${htmlEsc(title)}</h3><div class="ch06-q-rule"></div><strong>${htmlEsc(context)}</strong><p>${htmlEsc(reflect)}</p></article>`).join('')}</div><div class="ch06-footer-note">由講者逐題揭露 · 問題不需要立即回答</div></div>`;
   }
   if(scene.kind==='ch06-silence')return `<div class="ch06-scene ch06-silence" data-scene="${scene.id}"><div class="ch06-topline">QUIET MOMENT · 靜思</div><h2>給自己十秒鐘</h2><p>不用回答別人，只要誠實面對自己。</p><strong class="ch06-clock-value">00:${String(remainingCh06Seconds()).padStart(2,'0')}</strong><div class="ch06-time-track"><i class="ch06-time-fill" style="width:${remainingCh06Seconds()*10}%"></i></div><div class="ch06-clock-state">等待主持人開始</div></div>`;
   if(scene.kind==='ch06-ending')return `<div class="ch06-scene ch06-ending" data-scene="${scene.id}"><div class="ch06-ending-label">LOOK INWARD · UNDERSTAND OTHERS · BECOME YOURSELF</div><svg class="ch06-stairs" viewBox="0 0 1600 900" preserveAspectRatio="none" aria-hidden="true">${['M105 835 H535 V652','M535 652 H960 V417','M960 417 H1515 V232'].map((d,i)=>`<g class="ch06-stair-segment ${phase>=i+1?'shown':''}" data-ch06-step="${i+1}"><path class="ch06-stair-glow" d="${d}"/><path class="ch06-stair-line" d="${d}"/></g>`).join('')}</svg><div class="ch06-stair-title step1 ${phase>=1?'shown':''}" data-ch06-step="1"><span>◉　第一階</span><h2>看見自己</h2><p>覺察自己的感受與期待</p></div><div class="ch06-stair-title step2 ${phase>=2?'shown':''}" data-ch06-step="2"><span>♧　第二階</span><h2>理解他人</h2><p>看見不同立場的理由</p></div><div class="ch06-stair-title step3 ${phase>=3?'shown':''}" data-ch06-step="3"><span>✦　第三階</span><h2>成為自己</h2><p>實踐自己相信的價值</p></div><div class="ch06-final-whisper ${phase===3?'shown':''}">讓選擇，成為生命的實踐。</div></div>`;
   if(scene.kind==='ch06-curtain')return `<div class="ch06-scene ch06-curtain" data-scene="${scene.id}"><div class="ch06-curtain-kicker">THE END · LIFE EDUCATION</div><div class="ch06-curtain-main"><span class="ch06-curtain-mark">✦</span><h2>這張照片，你怎麼看？</h2><p>願我們看見角色，也不忘看見人。</p><i></i><small>感謝你的參與</small></div></div>`;
   return '';
 }
 function visual(scene,run){
  const a=scene.activityId?spec.activities[scene.activityId]:null;
  if(['scenario-intro','scenario-discuss','scenario-share','scenario-turn','discussion-bridge'].includes(scene.kind))return chapter3StageVisual(scene);
  if(scene.kind.startsWith('ch04-'))return chapter4StageVisual(scene,run);
  if(scene.kind.startsWith('ch05-'))return chapter5StageVisual(scene,run);
  if(scene.kind.startsWith('ch06-'))return chapter6StageVisual(scene);
  if(scene.kind==='welcome')return `<div class="intro-card"><div class="eyebrow">互動式生命教育講座</div><h2>一張照片，<br>為什麼讓我在意？</h2><p>講座、活動與即時回饋都在同一個舞台。</p><div id="stage-qr" class="welcome-qr"></div><p class="qr-caption">掃描 QR Code 加入講座</p></div>`;
  if(scene.kind==='photo'||scene.kind==='identity'){
    const shared=scene.id==='s01-photo',phase=Number(state.reveals?.[scene.id]||0),isTeacher=shared?phase>=2:scene.kind==='identity';
    const question=shared?phase===1?spec.activities['a-photo-first'].question:phase===3?spec.activities['a-photo-teacher'].question:phase===2?'現在，只加入一個條件：假設你是一名國小教師。':'先看看這兩張照片。':phase<2?'照片沒有改變，現在多了一個條件。':spec.activities['a-photo-teacher'].question;
    const vote=shared?(phase===1?Core.latestRun(state,'a-photo-first'):phase===3?Core.latestRun(state,'a-photo-teacher'):null):run;
    const hint=shared?(phase===0?'你注意到了什麼？這個判斷從何而來？':phase===2?'請看著相同的照片，讓這個新身分條件停留一會兒。':vote?.status==='open'?'手機投票開放中：接受／不接受':vote?.status==='closed'?'本輪投票已結束':'等待主持人開放本輪投票'):(phase<2?'先觀察，再作判斷':vote?.status==='open'?'手機投票開放中':'等待主持人開放投票');
    return `<div class="v095-photo-stage v096-photo-stage ${isTeacher?'v095-identity':''}" data-photo-phase="${phase}"><div class="v095-photo-topline">${isTeacher?'CHAPTER 02 · IDENTITY':'CHAPTER 01 · FIRST IMPRESSION'}</div><div class="v095-photogrid"><figure><img src="assets/photos/photo-1-v090.webp" alt="男性日常照片" />${isTeacher?'<figcaption class="v096-teacher-label">假設為教師</figcaption>':''}</figure><figure><img src="assets/photos/photo-2-v090.webp" alt="女性日常照片" />${isTeacher?'<figcaption class="v096-teacher-label">假設為教師</figcaption>':''}</figure></div><div class="v095-photo-question">${htmlEsc(question)}</div><p class="v095-photo-hint">${htmlEsc(hint)}</p></div>`;
  }
  if(scene.kind==='pair-results')return renderPairComparison();
  if(scene.kind==='teacher-expectations')return `<div class="teacher-expected v097-expectation-stage"><div class="v097-overline">CHAPTER 02 · SOCIAL EXPECTATIONS</div><h2>大家期待的老師是什麼樣子？</h2><div class="teacher-expected-grid">${[['assets/visual-097/expectation-attire.png','穿著打扮'],['assets/visual-097/expectation-private-life.png','私人生活'],['assets/visual-097/expectation-public.png','公共場合']].map(([f,label])=>`<figure class="v097-expectation-figure"><img src="${f}" alt="${label}：常見的教師形象期待（供討論，非規範）" loading="eager" decoding="async"/></figure>`).join('')}</div><p class="v097-expectation-note">這些是值得檢視的社會期待，不是對教師生活樣貌的標準答案。</p></div>`;
  if(scene.kind==='expectations')return `<div class="expectations">${['自我期待','學生期待','社會期待'].map(s=>`<div>${s}</div>`).join('')}</div>`;
  if(scene.kind==='theory')return `<div class="theory"><h2>高夫曼｜劇場理論</h2><div class="cols"><div><strong>前臺</strong><p>向特定觀眾呈現的形象</p></div><div><strong>後臺</strong><p>相對不對同一觀眾開放的情境</p></div></div><p>兩者都是情境中的自我呈現。</p></div>`;
  if(scene.kind==='rolecards'){
    const phase=Number(state.reveals?.[scene.id]||0),drawn=Math.max(0,Math.min(8,Number(state.cardsDrawn||0)));
    if(state.cardsRevealed)return scenarioStageVisual(scene);
    const art='assets/visual-097/ch03-scene-01.png';
    const head=phase===0?'換個位置，看見不同的故事':phase===1?'現在，換你進入一個角色':'先讀懂他的故事，再思考自己的立場';
    const desc=phase===0?'如果暫時不從自己的角度評價，而是試著理解另一個人的處境？':phase===1?'每組抽取一張角色卡，同組看到同一個故事。':'請閱讀手機上的角色卡，不急著公開其他組的情境。';
    const prompt=phase===0?'先看見他人的處境':phase===1?'正在抽取角色情境':'理解角色最重視的價值';
    return `<div class="v097-ch03-layout v097-ch03-draw-layout">
      <div class="v097-ch03-illustrated-card"><img src="${art}" alt="抽取角色卡的正式情境插畫" decoding="async" fetchpriority="high"/><div class="v097-ch03-paper-copy"><span class="v097-ch03-paper-label">ROLE PLAY · PERSPECTIVE</span><strong>${prompt}</strong><small>教師 5 張 · 學生 3 張</small></div></div>
      <section class="v097-ch03-content v097-ch03-draw-content"><div class="v097-ch03-kicker">CHAPTER 03 · PERSPECTIVE</div><h2>${head}</h2><p>${desc}</p><div class="v097-ch03-draw-grid">${Array.from({length:8},(_,i)=>`<div class="v097-ch03-card-back ${i<drawn?'is-drawn':''}"><span>${i<drawn?'✓':'?'}</span><small>第 ${i+1} 組</small></div>`).join('')}</div><div class="v097-ch03-draw-status"><span>已抽取 <strong>${drawn}／8</strong> 組</span><span>${phase===0?'準備開始':phase===1?(state.groupDrawOpen?'各組正在抽卡':'等待主持人開放抽卡'):'各組閱讀個別角色卡'}</span></div><p class="v097-ch03-privacy">角色卡由各組手機閱讀；投影不提前顯示其他組抽中的身分。</p></section>
      </div>`;
  }
  if(scene.kind==='scenario')return placeholder('角色衝突情境','教師與學生都有可以理解的需求；先不預設哪一方正確。');
  if(scene.kind==='tension')return `<div class="tension"><span>自我實現</span><strong>×</strong><span>受到束縛</span></div>`;
  if(scene.kind==='recap')return `<div class="recap">${spec.chapters.slice(0,5).map((c,i)=>`<div>${i+1}　${htmlEsc(c.name)}</div>`).join('')}</div>`;
  if(scene.kind==='closing')return `<div class="closing">哲學思考　·　人學探索<br>價值思辨　·　終極關懷<br><strong>生命實踐</strong></div>`;
  if(scene.kind==='activity'&&a){return `<div class="activity-card"><div class="micro">活動｜${htmlEsc(a.label)}</div><h2>${htmlEsc(a.question)}</h2><p>${run?`本輪狀態：${feedback(run)}`:'尚未建立本輪活動'}</p>${renderSummary(run,scene)}</div>`}
  if(['results','tug','discussion'].includes(scene.kind)){return `<div class="result-card"><div class="micro">${scene.kind==='tug'?'即時立場拉鋸':'討論與回饋'}</div><h2>${run?htmlEsc(spec.activities[run.activityId].label):'尚未開始活動'}</h2>${renderSummary(run,scene)}</div>`}
  return placeholder('此幕內容區',scene.text);
 }
 function renderPairComparison(){
  const phase=Number(state.reveals?.['s02-results']||0);
  if(!phase)return `<div class="pair-comparison pair-hidden"><div class="micro">兩次投票｜對照結果</div><h2>答案已收集，結果尚未公布</h2><p>主持人將先展示兩輪分布，再揭露看法轉變的人數。</p></div>`;
  const data=remote?state.pairedComparison:Core.photoVotePairSummary(state);
  if(!data||!data.first||!data.second)return `<div class="pair-comparison"><p>比較資料正在同步，請稍後。</p></div>`;
  const group=(title,summary)=>{
    const n=Number(summary.n||0),yes=Number(summary.counts?.['接受']||0),no=Number(summary.counts?.['不接受']||0);
    const bar=(label,v,cls)=>`<div class="pair-option"><div><span>${label}</span><strong>${v} 人 · ${n?Math.round(v/n*100):0}%</strong></div><div class="pair-track"><div class="${cls}" style="width:${n?v/n*100:0}%"></div></div></div>`;
    return `<section class="pair-group"><div class="pair-group-title">${title}</div><p>共 ${n} 份回答</p>${bar('接受',yes,'yes')}${bar('不接受',no,'no')}</section>`;
  };
  return `<div class="pair-comparison"><div class="micro">兩次投票比較</div><div class="pair-group-grid">${group('第一次｜一般身分',data.first)}${group('第二次｜教師身分',data.second)}</div>${phase>=2?`<section class="pair-highlight"><span class="micro">值得觀察的改變</span><strong>${Number(data.acceptToReject||0)} 人</strong><p>第一次選擇「接受」，第二次改為「不接受」</p><small>僅比對同一位聽眾兩輪都有作答者；有效配對共 ${Number(data.paired||0)} 人</small></section>`:`<div class="pair-pending">觀察兩輪分布後，主持人將揭露「接受 → 不接受」的人數。</div>`}</div>`;
 }
 function renderSummary(run,scene){
  if(!run)return `<p class="empty">活動尚未開始。講者可以在主控開啟這個活動。</p>`;
  if(!run.resultVisible)return `<div class="private-results"><span>◌ 統計尚未公開</span><p>講者可以先收集回應，再決定何時公布。</p></div>`;
  const res=remote?state.summaries?.[run.id]:Core.summarise(state,run.id),a=spec.activities[run.activityId];
  if(!res)return '<div class="empty">統計資料尚未公開或正在同步。</div>';
  if(a.kind==='choice')return `<div class="stat-block"><div>本輪 ${res.n} 份回應</div>${Object.entries(res.counts).map(([name,n])=>`<div class="bar-row"><span>${htmlEsc(name)}</span><div class="bar-bg"><div style="width:${res.n?100*n/res.n:0}%"></div></div><strong>${n}</strong></div>`).join('')}${(res.featured||[]).length?`<div class="approved-reasons"><strong>聽眾的理由</strong>${res.featured.map(x=>`<blockquote>${htmlEsc(x.value.reason||'')}</blockquote>`).join('')}</div>`:''}</div>`;
  if(a.kind==='tug'){
   const left=Number(res.left||0),right=Number(res.right||0),n=left+right,pct=n?left/n*100:50;
   return `<div class="live-tug"><div class="tug-side-labels"><span>${htmlEsc(a.low)}</span><span>${htmlEsc(a.high)}</span></div><div class="tug-arena"><div class="tug-left" style="width:${pct}%"></div><div class="tug-right" style="width:${100-pct}%"></div><i class="tug-node" style="left:${pct}%"></i></div><div class="tug-counts"><div><strong data-tug-left-percent>${n?Math.round(pct):0}%</strong><small data-tug-left-count>${left} 人</small></div><div><strong data-tug-right-percent>${n?Math.round(100-pct):0}%</strong><small data-tug-right-count>${right} 人</small></div></div><p class="caption" data-tug-total>${n} 人已選擇立場 · 不設中立 · 活動開放時可隨時改變</p></div>`;
  }
  if(a.kind==='scale'){
   const avg=res.mean===null?50:res.mean;
   return `<div class="tug-graph"><div class="tug-head">${htmlEsc(a.low)} <span>${htmlEsc(a.high)}</span></div><div class="track"><i class="center"></i><i class="node" style="left:${avg}%"></i></div><div class="average">${res.mean===null?'等待回應':`全場平均 ${res.mean.toFixed(1)} / 100`}</div><div class="histogram">${res.histogram.map(n=>`<div style="height:${n?Math.max(10,n/Math.max(1,...res.histogram)*100):3}%"></div>`).join('')}</div><div class="caption">左側 ${res.left}　中間 ${res.middle}　右側 ${res.right}　（共 ${res.n} 份）</div></div>`;
  }
  const featured=res.featured||[];
  return `<div class="text-results"><p>本輪共 ${res.n} 份回應</p>${featured.length?featured.map(x=>`<blockquote>${htmlEsc(a.kind==='reflection'?`我希望成為一位${x.value.teacher}的老師，也不希望失去${x.value.self}的自己。`:x.value.text||'')}</blockquote>`).join(''):'<div class="empty">文字不會自動公開，需由講者挑選後才顯示。</div>'}</div>`;
 }
 function drawerView(scene,open){const run=relevantRun(scene),activity=scene.activityId?spec.activities[scene.activityId]:null;
  return `<div class="scrim" data-action="drawer-close"><aside class="drawer" onclick="event.stopPropagation()"><div class="drawer-head"><strong>講者主控</strong>${controlBtn('drawer-close','關閉','ghost')}</div>
   ${remote?'<p class="muted">已驗證的主控帳號，可於投影上直接操作。</p>':'<p class="caution">本機架構示範 · 此頁沒有真實主持人驗證，不可公開作正式活動。</p>'}
   <h3>章節與畫面</h3><div class="jump-list">${spec.chapters.map((c,i)=>`<div class="chapter-label">${i+1}｜${htmlEsc(c.name)} · ${c.minutes} 分鐘</div>${playlist.filter(x=>x.ch===c.id).map(s=>`<button class="jump ${state.currentSceneId===s.id?'active':''}" data-action="jump" data-id="${s.id}">${htmlEsc(s.title)}</button>`).join('')}`).join('')}</div>
   <h3>活動控制</h3><div class="control-block"><p>目前開放：<strong>${open?htmlEsc(spec.activities[open.activityId].label):'無'}</strong></p>
    ${open?controlBtn('close-activity','結束目前作答','danger'):activity?controlBtn('start-activity','開放目前畫面的活動','primary',`data-id="${activity.id}"`):'<p class="muted">目前畫面沒有綁定活動。可至指定題目畫面開啟。</p>'}
    ${run&&run.status==='closed'&&!open?controlBtn('reopen','重新開放上一輪','',`data-run="${run.id}"`):''}
    ${run?controlBtn('visible',run.resultVisible?'隱藏結果':'公布本輪結果','',`data-run="${run.id}" data-visible="${run.resultVisible?'0':'1'}"`):''}
    <div class="muted">活動不隨換幕自動結束。新的活動採用新的作答紀錄 ID；重新開放則沿用原紀錄。</div>
   </div>
   <h3>匿名文字回應</h3><p class="muted">為避免未經檢視的私人文字直接出現在全場投影，本投影主控不顯示原文。正式版須在講者自己的私人裝置審核，才可指定公開；投影畫面不需切換模式。</p>
   ${remote?`<h3>進場管理</h3>${controlBtn('toggle-join',state.joinOpen?'停止新裝置加入':'重新開放加入',state.joinOpen?'':'primary')}`:''}
   <h3>現場工具</h3>${controlBtn('join','加入資訊')}${controlBtn('fullscreen','全螢幕')}${remote?controlBtn('end-session','結束本場講座','danger')+' '+controlBtn('logout','登出主持人','ghost'):controlBtn('csv','匯出本機 CSV')+' '+controlBtn('reset','重置原型','danger')}
  </aside></div>`
 }
 function renderReview(run){const a=spec.activities[run.activityId],vals=Core.runAnswers(state,run.id);if(!['text','role','reflection'].includes(a.kind))return '<p class="muted">此活動沒有需要人工挑選的文字。</p>';
  if(!vals.length)return '<p class="muted">本輪尚無回應。</p>';
  return `<div class="review-list">${vals.slice(-20).reverse().map(x=>{const marked=(state.featured[run.id]||[]).includes(x.participantId),v=x.value;const txt=a.kind==='reflection'?`我希望成為一位${v.teacher}的老師，也不希望失去${v.self}的自己。`:v.text;return `<div class="review"><p>${htmlEsc(txt)}</p>${controlBtn('feature',marked?'取消精選':'精選投影','',`data-run="${run.id}" data-participant="${x.participantId}"`)}</div>`}).join('')}</div>`
 }
 function joinView(){return `<div class="modal-back" data-action="join-close"><div class="modal" onclick="event.stopPropagation()"><h2>加入這場講座</h2><p>聽眾掃描 QR Code 後，全程保持同一個手機頁面；非活動時間顯示聆聽鎖定畫面。</p><div class="qr" id="qr"><p>${remote?'掃碼後自動加入本場講座':'參與網址如下（本機示範無法跨裝置同步）'}</p></div><code>${htmlEsc(audienceLink())}</code><div class="rowbuttons">${controlBtn('copy','複製連結')}${controlBtn('join-close','返回講座','primary')}</div></div></div>`}
 function renderQR(){const el=$('#qr');if(!el)return;if(typeof QRCode==='undefined')return;const host=location.hostname;if(!host||host==='localhost'||host==='127.0.0.1')return;el.innerHTML='';new QRCode(el,{text:audienceLink(),width:164,height:164,colorDark:'#183148',colorLight:'#fff'})}
 function myGroup(){return remote?Number(state.groupNo||0):localGroup}
 function myRoleCard(){return spec.roleCards.find(c=>c.id===(remote?state.myRoleCard:state.groupCards?.[localGroup]))}
 function roleCardPanel(){if(currentScene().ch!=='ch3')return '';
  const gn=myGroup(),card=myRoleCard();return `<div class="audience-role-card"><div class="eyebrow">第 ${gn} 組｜角色情境</div>${card?`<h2>${htmlEsc(card.badge||card.role)}｜${htmlEsc(card.title)}</h2>${roleCardFigure(card,true)}<p class="caption">點按圖片可放大閱讀。同組其他成員會看到同一張情境圖片。</p><p><strong>角色身分：</strong>${htmlEsc(card.role)}</p><p><strong>重視：</strong>${htmlEsc(card.focus||card.persona||'')}</p><p><strong>一句心聲：</strong>${htmlEsc(card.quote||card.thought||'')}</p><p class="muted">請先理解此角色的想法，接著從相反立場提出具體質疑與理由。</p>`:state.groupDrawOpen?`<h2>準備抽取角色情境</h2><p>每組只需抽一次，同組成員會同步看到結果。</p><button class="btn primary" data-action="draw-card" ${ui.drawBusy?'disabled':''}>${ui.drawBusy?'抽取中…':'抽取角色情境'}</button><p class="muted">抽到後會直接顯示圖片卡，兼顧清楚閱讀與載入速度。</p>`:'<p>請仔細聆聽，等待主持人開放角色情境抽取。</p>'}</div>`}
 function audienceView(){const run=active(),scene=currentScene(),a=run?spec.activities[run.activityId]:null,prev=run?(remote?state.myAnswers?.[run.id]:state.answers[run.id]?.[participantId]):null;
  if(!remote&&!localGroup)return groupJoinView();
  return `<div class="mobile-shell"><div class="phone"><header><div class="mobile-brand">一張照片，為什麼讓我在意？</div><small>第 ${myGroup()} 組 · 第 ${spec.chapters.indexOf(currChapter())+1} 環節</small></header><main><div class="demo-ribbon">${remote?(Adapter.status.connected?'即時連線已建立':'斷線備援同步 · 仍可作答'):'本機同步架構原型 · 非現場連線版'}</div>
   ${roleCardPanel()}
   ${(!run||scene.ch==='ch6')?`<div class="locked"><div class="lock-icon">♙</div><h1>請仔細聆聽</h1><p>目前尚未開放活動。講者開放後，這裡會自動顯示題目。</p><span>不需要重新掃碼</span></div>`:
   `<div class="mobile-activity"><span class="tag">${prev?'已作答 · 可更新':'活動已開放'}</span><h1>${htmlEsc(a.label)}</h1><p>${htmlEsc(a.question)}</p>${a.kind==='tug'?audienceForm(a,prev):audienceForm(a,prev)}</div>`}
   </main><footer>請勿輸入姓名、學號或其他可辨識個人的資訊。</footer></div>${ui.toast?`<div class="toast" role="status" aria-live="polite">${htmlEsc(ui.toast)}</div>`:''}${roleCardModal()}</div>`
 }
 function audienceForm(a,prev){const v=prev?.value||{},submitLabel=prev?'更新我的回答':'送出我的回答';let fields='';
  if(a.kind==='text'||a.kind==='role')fields=`${a.kind==='role'?`<div class="role-selector"><label>本輪示範角色（正式版依小組分派）</label><select name="role"><option ${ui.role==='教師'?'selected':''}>教師</option><option ${ui.role==='學生'?'selected':''}>學生</option></select></div>`:''}<label for="response">我的想法</label><textarea id="response" name="text" maxlength="500" rows="6" required>${htmlEsc(v.text||'')}</textarea>`;
  if(a.kind==='choice')fields=`<fieldset><legend>請選擇</legend>${a.options.map(opt=>`<label class="choice"><input type="radio" name="choice" value="${htmlEsc(opt)}" ${v.choice===opt?'checked':''} required/>${htmlEsc(opt)}</label>`).join('')}</fieldset>${a.reason?`<label for="reason">我的理由（可選填）</label><textarea id="reason" name="reason" rows="3" maxlength="300">${htmlEsc(v.reason||'')}</textarea>`:''}`;
  if(a.kind==='tug'){
   const side=ui.tugChoice||v.side||'';
   return `<div class="tug-choice-wrap"><p class="muted">當「做自己」與「回應社會期待」無法完全兼顧時，你會優先考量什麼？請選擇一個較優先的價值，點按即送出；活動期間可隨時換邊。</p><div class="tug-choice-actions"><button type="button" class="tug-choice left ${side==='left'?'chosen':''}" data-action="tug-pick" data-side="left" ${''}><strong>${htmlEsc(a.low)}</strong><span>${side==='left'?'✓ 我目前的選擇':'選擇這一邊'}</span></button><button type="button" class="tug-choice right ${side==='right'?'chosen':''}" data-action="tug-pick" data-side="right" ${''}><strong>${htmlEsc(a.high)}</strong><span>${side==='right'?'✓ 我目前的選擇':'選擇這一邊'}</span></button></div><p class="caption">沒有中立選項，重新點選另一側即可更新。</p></div>`;
  }
  if(a.kind==='scale'){const val=Number(v.scale??50);fields=`<div class="scale-label"><span>${htmlEsc(a.low)}</span><span>${htmlEsc(a.high)}</span></div><div class="value" id="scale-val">${val}</div><input type="range" id="scale-input" name="scale" min="0" max="100" step="1" value="${val}"/><p>50 可以表示兩端並存，或暫時無法偏向其中一邊。</p>`}
  if(a.kind==='reflection')fields=`<label>我希望成為一位怎樣的老師？</label><input name="teacher" maxlength="60" required value="${htmlEsc(v.teacher||'')}" placeholder="例如：願意理解學生"/><label>不希望因為成為老師，而失去什麼？</label><input name="self" maxlength="60" required value="${htmlEsc(v.self||'')}" placeholder="例如：自在的自己"/>`;
  return `<form id="response-form" data-run="${active().id}">${fields}<button class="btn primary submit" type="submit">${submitLabel}</button></form>`
 }
 function exportCSV(){const lines=[['活動ID','作答輪次ID','匿名參與者','角色','內容','提交時間']];state.runs.forEach(r=>{Object.values(state.answers[r.id]||{}).forEach(x=>{lines.push([r.activityId,r.id,x.participantId,x.role||'',JSON.stringify(x.value),new Date(x.submittedAt).toISOString()])})});const csv='\ufeff'+lines.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));link.download='講座回應_本機示範.csv';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)}
 async function pickTug(side){
   if(!['left','right'].includes(side))return;
   if(ui.tugBusy){ui.tugQueued=side;return}
   const run=active();if(!run||spec.activities[run.activityId]?.kind!=='tug')return;
   const previous=remote?state.myAnswers?.[run.id]?.value?.side:state.answers[run.id]?.[participantId]?.value?.side;
   if(previous===side)return;
   ui.tugBusy=true;ui.tugChoice=side;render();
   try{
     if(remote){const delay=Math.max(0,1100-(Date.now()-lastTugCommit));if(delay)await new Promise(resolve=>setTimeout(resolve,delay));await Adapter.submit({runId:run.id,value:{side}});lastTugCommit=Date.now();}
     else state=Adapter.save(Core.change(Adapter.get(),{type:'SUBMIT',runId:run.id,participantId,value:{side}}));
     // 不跳出遮蔽操作的成功提示，按鈕自身就是目前立場。
   }catch(e){ui.tugChoice=null;toast(e.message||'立場更新失敗')}
   finally{ui.tugBusy=false;const next=ui.tugQueued;ui.tugQueued=null;ui.tugChoice=null;render();
     if(next&&next!==side)setTimeout(()=>{void pickTug(next)},1100)}
 }
 document.addEventListener('click',e=>{const btn=e.target.closest('[data-action]');if(!btn)return;const action=btn.dataset.action;if(btn.classList.contains('scrim')&&!e.target.classList.contains('scrim'))return;
   if(action==='next')nav(1);else if(action==='prev')nav(-1);
   else if(action==='jump'){if(spec.scenes.find(x=>x.id===btn.dataset.id)?.ch==='ch6'&&state.activeRunId){toast('請先結束目前開放的作答，再進入第六環節')}else{commit({type:'NAVIGATE',sceneId:btn.dataset.id});ui.drawer=false;render()}}
   else if(action==='drawer'||action==='drawer-close'){ui.drawer=action==='drawer'?!ui.drawer:false;render()}
   else if(action==='join'||action==='join-close'){ui.join=action==='join';render()}
   else if(action==='publish-pair'){
     (async()=>{try{const phase=Number(btn.dataset.phase);if(remote)state=await Adapter.publishPair(phase);else state=Adapter.save(Core.change(Adapter.get(),{type:'SET_PAIR_PHASE',phase}));render()}catch(e){toast(e.message||'公布失敗')}})();
   }
   else if(action==='photo-flow-next'){void photoAdvance()}
   else if(action==='reveal-next')commit({type:'REVEAL_NEXT'});
   else if(action==='reveal-reset')commit({type:'REVEAL_RESET'});
   else if(action==='group-draw-toggle')commit({type:'SET_GROUP_DRAW_OPEN',open:!state.groupDrawOpen});
   else if(action==='group-card-reveal')commit({type:'SET_CARDS_REVEALED',visible:!state.cardsRevealed});
   else if(action==='refresh-group-counts'&&remote){Adapter.refresh(true,'manual-group').catch(e=>toast(e.message))}
   else if(action==='preview-card'){ui.previewCardId=btn.dataset.card||'';render()}
   else if(action==='preview-close'){ui.previewCardId='';render()}
   else if(action==='share-filter'){ui.shareFilter=btn.dataset.filter||'all';render()}
   else if(action==='scenario-spotlight'){void scenarioCommit('spotlight',Number(btn.dataset.group||0))}
   else if(action==='scenario-timer'){void scenarioCommit(btn.dataset.command)}
   else if(action==='ch06-timer'){void ch06TimerCommit(btn.dataset.command)}
   else if(action==='ch06-prev'){void ch06PrevCommit()}
   else if(action==='scenario-pin'){void scenarioCommit(btn.dataset.role==='教師'?'pin-teacher':'pin-student',Number(btn.dataset.group))}
   else if(action==='draw-card'){
     if(ui.drawBusy)return;ui.drawBusy=true;btn.disabled=true;
     (async()=>{try{if(remote)await Adapter.drawRoleCard();else state=Adapter.save(Core.change(Adapter.get(),{type:'DRAW_CARD',groupNo:localGroup}));render()}catch(e){toast(e.message||'抽取角色情境失敗')}finally{ui.drawBusy=false}})();
   }
   else if(action==='tug-pick'){void pickTug(btn.dataset.side)}
   else if(action==='start-activity')commit({type:'START_ACTIVITY',activityId:btn.dataset.id});
   else if(action==='close-activity')commit({type:'CLOSE_ACTIVITY'});
   else if(action==='reopen')commit({type:'REOPEN_ACTIVITY',runId:btn.dataset.run});
   else if(action==='visible')commit({type:'SET_RESULT_VISIBLE',runId:btn.dataset.run,visible:btn.dataset.visible==='1'});
   else if(action==='feature')commit({type:'FEATURE',runId:btn.dataset.run,participantId:btn.dataset.participant});
   else if(action==='review-run')openReview(btn.dataset.run);
   else if(action==='refresh-review'){reviewFetchedAt=0;fetchReviews(true)}
   else if(action==='review-next'||action==='review-prev'){ui.reviewOffset=Math.max(0,ui.reviewOffset+(action==='review-next'?40:-40));ui.reviewData=null;reviewFetchedAt=0;render();fetchReviews(true)}
   else if(action==='feature-response'){(async()=>{try{
      if(remote){state=await Adapter.featureResponse(btn.dataset.run,btn.dataset.participant,btn.dataset.approve==='1')}
      else state=Adapter.save(Core.change(Adapter.get(),{type:'FEATURE',runId:btn.dataset.run,participantId:btn.dataset.participant}));
      await fetchReviews(true);render();
     }catch(err){if(remote&&/stale revision/i.test(err.message))await Adapter.refresh(true);toast(err.message||'核准失敗')}})()}
   else if(action==='open-stage'){const tab=window.open('about:blank','_blank');(async()=>{try{const token=remote?await Adapter.getStageToken():null;const url=stageLink(token);if(tab){tab.opener=null;tab.location.replace(url)}else toast('瀏覽器封鎖新視窗，請使用「複製 A 裝置網址」')}catch(err){tab?.close();toast(err.message||'投影連結取得失敗')}})()}
   else if(action==='copy-stage'){(async()=>{try{const token=remote?await Adapter.getStageToken():null;const url=stageLink(token);await navigator.clipboard.writeText(url);toast('A 裝置投影連結已複製')}catch(err){toast('無法複製：'+(err.message||'請改用開啟純投影'))}})()}
   else if(action==='copy-audience'){copyUrl(audienceLink(),'聽眾網址')}
   else if(action==='reset'&&!remote){if(confirm('確定清空本機所有示範回應並重置講座？'))commit({type:'RESET'})}
   else if(action==='toggle-join'&&remote){commit({type:'SET_JOIN_OPEN',open:!state.joinOpen})}
   else if(action==='end-session'&&remote){if(confirm('確定結束講座？結束後將無法再開放活動。'))commit({type:'END_SESSION'})}
   else if(action==='resume-session'&&remote){
     if(ui.entryBusy)return;ui.entryBusy=true;render();
     Adapter.resumeSession().catch(err=>toast(err.message)).finally(()=>{ui.entryBusy=false;render()});
   }
   else if(action==='create-session'&&remote){
     if(ui.entryBusy)return;
     if(!confirm('確定重新開始講座？\n\n系統會永久刪除「你建立的所有舊場次」，包含聽眾回覆、投票、分組與抽卡紀錄，無法復原。\n\n新的投影網址與聽眾 QR Code 必須重新提供。\n\n若要保留目前資料，請選「取消」並使用「繼續既有活動」。'))return;
     ui.entryBusy=true;render();
     Adapter.createSession().catch(err=>toast(err.message)).finally(()=>{ui.entryBusy=false;render()});
   }
   else if(action==='session-chooser'&&remote){Adapter.showSessionChooser().catch(err=>toast(err.message))}
   else if(action==='logout'&&remote){Adapter.logout().catch(err=>toast(err.message))}
   else if(action==='retry'&&remote){location.reload()}
   else if(action==='csv'){if(remote)toast('正式版 CSV 匯出尚未開放');else exportCSV()}
   else if(action==='copy'){navigator.clipboard?.writeText(audienceLink()).then(()=>toast('已複製參與網址')).catch(()=>toast('無法自動複製，請手動選取網址'))}
   else if(action==='fullscreen'){if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen().catch(()=>toast('全螢幕無法啟用，可改用 F11'))}
 });
 document.addEventListener('input',e=>{if(e.target.id==='scale-input'){const out=$('#scale-val');if(out)out.textContent=e.target.value}});
 document.addEventListener('submit',async e=>{
  if(e.target.id==='join-group-form'){
    e.preventDefault();const selected=Number(new FormData(e.target).get('group'));
    if(!Number.isInteger(selected)||selected<1||selected>8){toast('請選擇組別');return}
    try{if(remote)await Adapter.selectGroup(selected);else{localGroup=selected;try{sessionStorage.setItem('lecture-demo-group',String(selected))}catch{}render()}}
    catch(err){toast(err.message||'無法加入組別')}return;
  }
  if(e.target.id==='host-login-form'){e.preventDefault();const fd=new FormData(e.target);try{await Adapter.login(String(fd.get('email')||''),String(fd.get('password')||''))}catch(err){toast(err.message)}return}
  if(e.target.id!=='response-form')return;e.preventDefault();const fd=new FormData(e.target),runId=e.target.dataset.run,run=Core.runById(state,runId),a=run&&spec.activities[run.activityId];if(!a)return;const v={};if(a.kind==='choice'){v.choice=fd.get('choice');v.reason=fd.get('reason')||''}if(a.kind==='text'||a.kind==='role')v.text=fd.get('text');if(a.kind==='scale')v.scale=Number(fd.get('scale'));if(a.kind==='reflection'){v.teacher=fd.get('teacher');v.self=fd.get('self')}ui.role=String(fd.get('role')||ui.role);
  if(remote){try{await Adapter.submit({runId,role:a.kind==='role'?ui.role:null,value:v});toast('已收到你的回答',2800)}catch(err){toast(err.message)}}
  else commit({type:'SUBMIT',runId,participantId,role:a.kind==='role'?ui.role:null,value:v});});
 document.addEventListener('keydown',e=>{if(audience||stageOnly||/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'')||e.ctrlKey||e.altKey||e.metaKey)return;
  if(e.key==='Escape'){if(ui.drawer||ui.join){ui.drawer=false;ui.join=false;render()}return}
  if(ui.drawer||ui.join)return;
  if(e.key==='ArrowRight'){e.preventDefault();nav(1)}if(e.key==='ArrowLeft'){e.preventDefault();nav(-1)}if(e.key.toLowerCase()==='c'){ui.drawer=true;render()}if(e.key.toLowerCase()==='q'){ui.join=true;render()}
 });
 Adapter.subscribe((s,meta)=>{state=s;applyState(meta)});render();
 // v0.6.1：正常連線不再使用固定 5 秒輪詢清單；僅由收到回覆通知、手動操作或重連觸發。
})();
