/* 同來源同瀏覽器示範 Adapter。不能用於真實多人講座。 */
(function(){
  const key='photo-lecture-v04-state';
  const C=window.LectureCore;
  const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel(key):null;
  let handlers=[],fallback=C.initial();
  function get(){try{const s=JSON.parse(localStorage.getItem(key));if(s&&s.schemaVersion===1&&s.lectureId===window.LectureContent.id&&C.sceneIndex(s.currentSceneId)>=0){s.groupDrawOpen??=false;s.cardsRevealed??=false;s.groupCards??={};s.groupCounts??={};s.cardsDrawn??=Object.keys(s.groupCards).length;fallback=s;return s;}}catch{}return fallback}
  function notify(){handlers.forEach(fn=>fn(get()))}
  function save(s){fallback=s;try{localStorage.setItem(key,JSON.stringify(s));channel?.postMessage({type:'updated'})}catch{}notify();return s}
  channel&&(channel.onmessage=notify);
  addEventListener('storage',e=>{if(e.key===key)notify()});
  window.LectureAdapter={type:'local-demo',get,save,subscribe(fn){handlers.push(fn);return ()=>handlers=handlers.filter(x=>x!==fn)}};
})();
