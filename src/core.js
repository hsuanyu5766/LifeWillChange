/* 純資料狀態引擎：未依賴 DOM、Supabase 或 localStorage。 */
(function(){
  'use strict';
  const c=window.LectureContent;
  const clone=x=>JSON.parse(JSON.stringify(x));
  const makeId=(prefix='run')=>`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
  function initial(){return {schemaVersion:1,lectureId:c.id,currentSceneId:c.scenes[0].id,reveals:{},activeRunId:null,runs:[],answers:{},featured:{},groupDrawOpen:false,cardsRevealed:false,cardsDrawn:0,groupCards:{},groupCounts:{},rev:0,updatedAt:Date.now()}}
  function sceneIndex(id){return c.scenes.findIndex(x=>x.id===id)}
  function assertState(s){if(!s||!Array.isArray(s.runs)||!s.answers||sceneIndex(s.currentSceneId)<0)throw Error('無效的講座狀態')}
  function latestRun(s,activityId){return [...s.runs].reverse().find(r=>r.activityId===activityId)||null}
  function runById(s,id){return s.runs.find(r=>r.id===id)||null}
  function runAnswers(s,runId){return Object.values(s.answers[runId]||{})}
  function change(s,action){
    assertState(s);const next=clone(s);let run;
    switch(action.type){
      case 'NAVIGATE':{
        if(sceneIndex(action.sceneId)<0)throw Error('不存在的畫面');
        next.currentSceneId=action.sceneId;break;
      }
      case 'SET_PAIR_PHASE':{
        if(next.currentSceneId!=='s02-results')throw Error('請先切換到兩次投票比較畫面');
        const phase=Number(action.phase),first=latestRun(next,'a-photo-first'),second=latestRun(next,'a-photo-teacher');
        if(![0,1,2].includes(phase))throw Error('無效的公布階段');
        if(phase>0&&(!first||!second||first.status!=='closed'||second.status!=='closed'))throw Error('必須先完成兩輪投票才能公布');
        if(phase===2&&Number(next.reveals['s02-results']||0)<1)throw Error('請先公布兩輪分布');
        next.reveals['s02-results']=phase;break;
      }
      case 'SCENARIO_CONTROL':{
        const op=String(action.command||''),sceneId=next.currentSceneId;
        if(op==='spotlight'){
          if(sceneId!=='s03-share')throw Error('請先切換到代表分享畫面');
          if(!next.cardsRevealed)throw Error('請先公布角色情境分組');
          const n=Number(action.value);
          if(!Number.isInteger(n)||n<0||n>8)throw Error('無效的組別');
          if(n>0&&!next.groupCards[n])throw Error('該組尚未抽取角色情境');
          next.reveals['s03-share']=n;
          if(n>0){
            const card=c.roleCards.find(x=>x.id===next.groupCards[n]);
            const key=card?.role==='教師'?'s04-compare-teacher':'s04-compare-student';
            const shown=Array.isArray(next.reveals['s03-shared-groups'])?next.reveals['s03-shared-groups']:[];
            if(!shown.includes(n))next.reveals['s03-shared-groups']=[...shown,n];
            if(!Number(next.reveals[key]||0))next.reveals[key]=n;
          }
        }else if(op==='pin-teacher'||op==='pin-student'){
          if(!['s03-share','s04-compare'].includes(sceneId))throw Error('請在分享或對照畫面選擇情境');
          if(!next.cardsRevealed)throw Error('請先公布角色情境分組');
          const n=Number(action.value),card=c.roleCards.find(x=>x.id===next.groupCards[n]);
          if(!Number.isInteger(n)||!card)throw Error('無效的組別');
          const role=op==='pin-teacher'?'教師':'學生';
          if(card.role!==role)throw Error('情境分類不符合');
          if(!(next.reveals['s03-shared-groups']||[]).includes(n))throw Error('僅能選擇第三環節實際分享過的組別');
          next.reveals[op==='pin-teacher'?'s04-compare-teacher':'s04-compare-student']=n;
        }else{
          if(sceneId!=='s03-discuss')throw Error('請先切換到小組討論畫面');
          const prev=next.reveals['s03-discuss-timer']||{remaining:240,endAt:null},now=Date.now();
          const remaining=prev.endAt===null?Number(prev.remaining||0):Math.max(0,Math.ceil((Number(prev.endAt)-now)/1000));
          if(op==='timer-start')next.reveals['s03-discuss-timer']={remaining,endAt:remaining>0?now+remaining*1000:null};
          else if(op==='timer-pause')next.reveals['s03-discuss-timer']={remaining,endAt:null};
          else if(op==='timer-reset')next.reveals['s03-discuss-timer']={remaining:240,endAt:null};
          else throw Error('未知的討論控制指令');
        }break;
      }
      case 'SET_GROUP_DRAW_OPEN':next.groupDrawOpen=!!action.open;break;
      case 'SET_CARDS_REVEALED':next.cardsRevealed=!!action.visible;break;
      case 'DRAW_CARD':{
        if(!next.groupDrawOpen)throw Error('抽卡尚未開放');
        const gn=Number(action.groupNo);
        if(!Number.isInteger(gn)||gn<1||gn>8)throw Error('組別無效');
        if(!next.groupCards[gn]){
          const used=new Set(Object.values(next.groupCards));
          const available=c.roleCards.filter(x=>!used.has(x.id));
          if(!available.length)throw Error('角色卡已抽完');
          next.groupCards[gn]=available[Math.floor(Math.random()*available.length)].id;
          next.cardsDrawn=Object.keys(next.groupCards).length;
        }break;
      }
      case 'CH06_TIMER':{
        if(next.currentSceneId!=='s06-silence')throw Error('請先切換到十秒靜思畫面');
        const command=String(action.command||''),old=next.reveals['s06-silence-timer']||{remaining:10,endAt:null};
        const now=Date.now(),left=old.endAt==null?Number(old.remaining??10):Math.max(0,Math.ceil((Number(old.endAt)-now)/1000));
        if(command==='reset')next.reveals['s06-silence-timer']={remaining:10,endAt:null};
        else if(command==='pause')next.reveals['s06-silence-timer']={remaining:left,endAt:null};
        else if(command==='start')next.reveals['s06-silence-timer']={remaining:left,endAt:left>0?now+left*1000:null};
        else throw Error('未知的靜思控制指令');
        break;
      }
      case 'CH06_PREV':{
        const scene=c.scenes[sceneIndex(next.currentSceneId)];
        if(!['s06-questions','s06-ending'].includes(scene.id))throw Error('只能在第六環節的揭露畫面返回');
        next.reveals[scene.id]=Math.max(0,Number(next.reveals[scene.id]||0)-1);break;
      }
      case 'REVEAL_NEXT':{
        const scene=c.scenes[sceneIndex(next.currentSceneId)];
        const target=Math.min(scene.steps.length,Number(next.reveals[scene.id]||0)+1);
        if(scene.id==='s01-photo'&&target>=2&&latestRun(next,'a-photo-first')?.status!=='closed')throw Error('請先結束第一次投票再揭露教師身分');
        next.reveals[scene.id]=target;break;
      }
      case 'REVEAL_RESET':next.reveals[next.currentSceneId]=0;break;
      case 'START_ACTIVITY':{
        if(!c.activities[action.activityId])throw Error('不存在的活動');
        if(next.currentSceneId==='s01-photo'){
          const phase=Number(next.reveals['s01-photo']||0);
          if(action.activityId==='a-photo-first'&&phase!==1)throw Error('請先顯示第一次投票問題');
          if(action.activityId==='a-photo-teacher'&&(phase!==3||latestRun(next,'a-photo-first')?.status!=='closed'))throw Error('請先完成第一輪並揭露教師身分');
        }
        if(next.activeRunId)throw Error('請先結束正在開放的活動');
        run={id:makeId(),activityId:action.activityId,status:'open',resultVisible:false,startedAt:Date.now(),closedAt:null};
        next.runs.push(run);next.activeRunId=run.id;next.answers[run.id]={};break;
      }
      case 'REOPEN_ACTIVITY':{
        if(next.activeRunId)throw Error('請先結束正在開放的活動');
        run=runById(next,action.runId);if(!run||run.status!=='closed')throw Error('找不到已結束的活動');
        run.status='open';run.closedAt=null;next.activeRunId=run.id;break;
      }
      case 'CLOSE_ACTIVITY':{
        run=runById(next,next.activeRunId);if(!run)throw Error('目前沒有開放的活動');
        run.status='closed';run.closedAt=Date.now();next.activeRunId=null;break;
      }
      case 'SET_RESULT_VISIBLE':{
        run=runById(next,action.runId);if(!run)throw Error('找不到活動紀錄');
        run.resultVisible=!!action.visible;break;
      }
      case 'SUBMIT':{
        run=runById(next,action.runId);
        if(!run||run.id!==next.activeRunId||run.status!=='open')throw Error('本輪活動尚未開放');
        const a=c.activities[run.activityId],v=action.value||{};
        if(a.kind==='choice'&&!a.options.includes(v.choice))throw Error('請選擇有效選項');
        if((a.kind==='text'||a.kind==='role')&&(!v.text||!String(v.text).trim()))throw Error('請輸入回應');
        if(a.kind==='tug'&&!['left','right'].includes(v.side))throw Error('必須選擇左側或右側');
        if(a.kind==='scale'&&(!Number.isInteger(Number(v.scale))||Number(v.scale)<0||Number(v.scale)>100))throw Error('立場刻度必須介於 0 至 100');
        if(a.kind==='reflection'&&(!String(v.teacher||'').trim()||!String(v.self||'').trim()))throw Error('請完成兩個欄位');
        if(!action.participantId)throw Error('缺少匿名參與者 ID');
        const value={};
        if(a.kind==='choice'){value.choice=v.choice;if(a.reason)value.reason=String(v.reason||'').slice(0,300)}
        if(a.kind==='text'||a.kind==='role')value.text=String(v.text).trim().slice(0,500);
        if(a.kind==='scale')value.scale=Number(v.scale);
        if(a.kind==='tug')value.side=v.side;
        if(a.kind==='reflection'){value.teacher=String(v.teacher).trim().slice(0,60);value.self=String(v.self).trim().slice(0,60)}
        next.answers[run.id][action.participantId]={participantId:action.participantId,role:action.role||null,submittedAt:Date.now(),value};break;
      }
      case 'FEATURE':{
        run=runById(next,action.runId);if(!run)throw Error('找不到活動紀錄');
        if(!next.answers[run.id]?.[action.participantId])throw Error('找不到回應');
        const set=new Set(next.featured[run.id]||[]);
        if(set.has(action.participantId))set.delete(action.participantId);else set.add(action.participantId);
        next.featured[run.id]=[...set].slice(-3);break;
      }
      case 'RESET':return initial();
      default:throw Error('未知的控制指令');
    }
    next.rev++;next.updatedAt=Date.now();return next;
  }
  function summarise(s,runId){
    const run=runById(s,runId);if(!run)return null;
    const a=c.activities[run.activityId],values=runAnswers(s,run.id),n=values.length;
    if(a.kind==='choice'){const counts=Object.fromEntries(a.options.map(x=>[x,0]));values.forEach(x=>counts[x.value.choice]++);return {n,counts,featured:(s.featured[run.id]||[]).map(id=>s.answers[run.id]?.[id]).filter(Boolean)};}
    if(a.kind==='tug')return {n,left:values.filter(x=>x.value.side==='left').length,right:values.filter(x=>x.value.side==='right').length};
    if(a.kind==='scale'){
      const histogram=Array.from({length:10},()=>0);let sum=0;
      for(const x of values){const v=x.value.scale;histogram[Math.min(9,Math.floor(v/10))]++;sum+=v}
      return {n,mean:n?sum/n:null,histogram,left:values.filter(x=>x.value.scale<45).length,middle:values.filter(x=>x.value.scale>=45&&x.value.scale<=55).length,right:values.filter(x=>x.value.scale>55).length};
    }
    return {n,featured:(s.featured[run.id]||[]).map(id=>s.answers[run.id]?.[id]).filter(Boolean)};
  }
  function photoVotePairSummary(s){
    const a=latestRun(s,'a-photo-first'),b=latestRun(s,'a-photo-teacher');
    const first=a?runAnswers(s,a.id):[],second=b?runAnswers(s,b.id):[];
    const secondById=new Map(second.map(x=>[x.participantId,x.value.choice]));
    let paired=0,acceptToReject=0,rejectToAccept=0,acceptBoth=0,rejectBoth=0;
    for(const x of first){const y=secondById.get(x.participantId),v=x.value.choice;if(!['接受','不接受'].includes(y))continue;
      paired++;if(v==='接受'&&y==='不接受')acceptToReject++;
      else if(v==='不接受'&&y==='接受')rejectToAccept++;
      else if(v==='接受')acceptBoth++;else if(v==='不接受')rejectBoth++;
    }
    return {first:{n:first.length,counts:{'接受':first.filter(x=>x.value.choice==='接受').length,'不接受':first.filter(x=>x.value.choice==='不接受').length}},
      second:{n:second.length,counts:{'接受':second.filter(x=>x.value.choice==='接受').length,'不接受':second.filter(x=>x.value.choice==='不接受').length}},
      paired,acceptToReject,rejectToAccept,acceptBoth,rejectBoth};
  }
  window.LectureCore={initial,change,sceneIndex,latestRun,runById,runAnswers,summarise,photoVotePairSummary,makeId};
})();
