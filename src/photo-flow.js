/* v0.9.6｜共用照片場景的四階段純狀態模型。禁止自動替聽眾作答。 */
(function(){
 'use strict';
 const FIRST='a-photo-first',SECOND='a-photo-teacher',SCENE='s01-photo';
 const steps=[
   {title:'觀察照片',subtitle:'先看見自己的直覺與判斷依據',short:'觀察'},
   {title:'第一次投票',subtitle:'照片中的人如果是你，能接受照片被看見嗎？',short:'第一輪'},
   {title:'教師身分揭露',subtitle:'照片不變，只加入假設為國小教師的條件',short:'揭露身分'},
   {title:'第二次投票',subtitle:'以相同兩張照片再次作答，不提前公布結果',short:'第二輪'}
 ];
 const latest=(s,id)=>[...(s.runs||[])].reverse().find(r=>r.activityId===id)||null;
 const phase=s=>Math.max(0,Math.min(3,Number(s.reveals?.[SCENE]||0)));
 function info(s){
   const p=phase(s),first=latest(s,FIRST),second=latest(s,SECOND),active=(s.runs||[]).find(r=>r.id===s.activeRunId)||null;
   const firstDone=first?.status==='closed',secondDone=second?.status==='closed';
   let next={label:'',message:'',action:null};
   if(p===0)next={label:'進入第一次投票',message:'先完成照片觀察與引導。',action:{type:'REVEAL_NEXT'}};
   else if(p===1){
     if(active?.activityId===FIRST)next={label:'結束第一次投票',message:'關閉第一輪作答，不公開任何結果。',action:{type:'CLOSE_ACTIVITY'}};
     else if(active)next={label:'先結束其他活動',message:'已有其他作答正在進行。',action:null};
     else if(!first)next={label:'開放第一次投票',message:'A 顯示問題，C 手機開始作答。',action:{type:'START_ACTIVITY',activityId:FIRST}};
     else if(firstDone)next={label:'揭露教師身分',message:'保留兩張照片，手動加入「假設為教師」標籤。',action:{type:'REVEAL_NEXT'}};
     else next={label:'等待第一輪結束',message:'目前活動狀態尚未同步。',action:null};
   }else if(p===2){
     if(!firstDone)next={label:'先結束第一次投票',message:'第一輪未關閉，不可進入第二輪。',action:null};
     else if(active)next={label:'先結束其他活動',message:'不能同時開放兩個活動。',action:null};
     else next={label:'呈現第二輪問題',message:'講者先停頓，再讓聽眾重新思考。',action:{type:'REVEAL_NEXT'}};
   }else{
     if(!firstDone)next={label:'先完成第一次投票',message:'請先關閉第一輪，才能繼續。',action:null};
     else if(active?.activityId===SECOND)next={label:'結束第二次投票',message:'保留兩輪獨立答案，等待下一頁比較。',action:{type:'CLOSE_ACTIVITY'}};
     else if(active)next={label:'先結束其他活動',message:'不能同時開放其他活動。',action:null};
     else if(!second)next={label:'開放第二次投票',message:'C 手機出現第二輪，不會看見第一輪統計。',action:{type:'START_ACTIVITY',activityId:SECOND}};
     else if(secondDone)next={label:'進入兩輪比較',message:'兩輪皆已關閉，才能在下一頁公布結果。',action:{type:'NAVIGATE',sceneId:'s02-results'}};
     else next={label:'等待第二輪結束',message:'目前活動狀態尚未同步。',action:null};
   }
   return {phase:p,steps,first,second,firstDone,secondDone,active,next,readyForResults:firstDone&&secondDone&&p===3};
 }
 window.LecturePhotoFlow=Object.freeze({SCENE,FIRST,SECOND,steps,phase,info});
})();
