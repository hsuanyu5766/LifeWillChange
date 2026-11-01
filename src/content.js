/* 講座內容資料：後續素材更新只須替換畫面資訊，不需動活動引擎。 */
(function () {
  const chapters = [
    { id:'ch1', name:'看見照片', sub:'直覺觀察與第一次投票', minutes:5, core:'從一般人的身分出發' },
    { id:'ch2', name:'如果我是老師？', sub:'身分假設與第二次投票', minutes:5, core:'教師形象與社會期待' },
    { id:'ch3', name:'換個位置，重新理解', sub:'角色情境抽取與反向挑戰', minutes:12, core:'理解不同角色的價值與立場' },
    { id:'ch4', name:'不理解，然後呢？', sub:'面對觀點分歧', minutes:5, core:'尊重、對話與界線' },
    { id:'ch5', name:'成為自己，還是回應期待？', sub:'即時立場拉鋸與自我整合', minutes:8, core:'自我選擇、角色責任與自我整合' },
    { id:'ch6', name:'從理解走向成為自己', sub:'人生三問與生命反思', minutes:5, core:'看見自己、理解他人、成為自己' }
  ];
  const scene = (id,ch,title,text,kind,opts={}) => ({ id, ch, title, text, kind, steps: [], ...opts });
  const scenes = [
    scene('s01-welcome','ch1','這張照片，你怎麼看？','生命教育互動講座｜40 分鐘。請掃描 QR Code 選擇組別，進入後手機將配合講座活動顯示題目。','welcome'),
    scene('s01-photo','ch1','看見這兩張照片','先觀察，再覺察自己的判斷；接著完成第一輪投票。','photo',{activityId:'a-photo-first',steps:['如果照片中的人是你，你能接受這樣的照片被別人看見嗎？','現在加入新的身分條件：假設你是一名國小教師。','如果你是一名國小教師，而且是照片中的人，你還能接受這樣的照片被別人看見嗎？']}),
    scene('s01-prompt','ch1','第一次投票｜如果是我','如果照片裡的人是你，你能接受這兩張照片被別人看見嗎？','activity',{activityId:'a-photo-first'}),
    scene('s02-reveal','ch2','如果我是老師呢？','照片不變，只加入教師身分這個條件，再重新回答。','identity',{activityId:'a-photo-teacher',steps:['現在，只多知道一件事：如果你是一位國小教師呢？','假如你是照片中的教師，你還能接受這樣的照片被別人看見嗎？']}),
    scene('s02-prompt','ch2','第二次投票｜如果我是老師','如果你現在是一位國小老師，你還能接受這兩張照片被別人看見嗎？','activity',{activityId:'a-photo-teacher'}),
    scene('s02-results','ch2','當我成為老師，判斷改變了嗎？','先比較兩輪的「接受／不接受」分布，再揭露有多少人從接受改為不接受。','pair-results',{steps:['公布兩輪投票分布','揭露「接受 → 不接受」的人數']}),
    scene('s02-reasons','ch2','大家期待的老師是什麼樣子？','穿著打扮、私人生活、公共場合：同一個人因為教師身分而受到哪些期待？','teacher-expectations'),
    scene('s03-perspective','ch3','換個位置，重新理解','如果暫時不從自己的角度評斷，而是看見教師與學生各自重視什麼？','scenario-intro'),
    scene('s03-cards','ch3','換個位置，重新理解','每組抽取一張角色情境；先閱讀角色心聲，不急著公開其他組的結果。','rolecards',{steps:['如果我們換個位置看照片，會發現什麼？','抽卡後先讀懂角色重視什麼，再思考如何提問。']}),
    scene('s03-discuss','ch3','換個位置，你會怎麼看？','請閱讀角色情境，理解角色的心聲，再站在相反立場提出具體的質疑與理由。','scenario-discuss'),
    scene('s03-share','ch3','不同立場的交會','先選教師情境與學生情境各一組分享；如有時間，可以再邀請其他組。','scenario-share'),
    scene('s03-transition','ch3','理解之後，一定要同意嗎？','當雙方都有各自的理由，卻仍無法達成共識，我們還能怎麼做？','scenario-turn'),
    scene('s04-intro','ch4','理解之後，一定要同意嗎？','當雙方都有各自的理由，卻仍無法達成共識，我們還能怎麼做？','ch04-intro',{steps:['當雙方都有各自的理由，卻仍無法達成共識，我們還能怎麼做？']}),
    scene('s04-compare','ch4','當雙方都有自己的理由……','回顧第三環節剛才分享的教師與學生情境。這些是情境原文，不是代表發言逐字稿。','ch04-compare'),
    scene('s04-action','ch4','如果無法取得共識，你會怎麼做？','選擇自己最傾向優先採取的一項行動；不同選項不代表對錯。','ch04-action',{activityId:'a-ch04-action'}),
    scene('s04-results','ch4','面對分歧，我們會如何行動？','觀察全場四種回應取向的分布；不評判哪一種比較正確。','ch04-results',{focusActivityId:'a-ch04-action'}),
    scene('s04-boundary','ch4','理解他人之後，我還能保有自己嗎？','面對不同的期待，我願意調整什麼？又有哪些價值是我不願放棄的？','ch04-boundary'),
    scene('s05-tension','ch5','當兩種價值產生衝突','當「做自己」與「回應社會期待」無法完全兼顧時……你會優先考量什麼？','ch05-intro'),
    scene('s05-vote','ch5','當兩種價值產生衝突','先思考自我選擇與教師角色責任的張力，再作出暫時選擇。','ch05-vote',{activityId:'a-tug',steps:['當「做自己」與「回應期待」無法完全兼顧，你會先考量哪一端？']}),
    scene('s05-live','ch5','當理由開始拉扯','同一輪立場拉鋸中逐步揭露挑戰問題，聽眾可持續調整選擇。','ch05-live',{focusActivityId:'a-tug',steps:['偏向自我選擇：作為教師，你不能忽視哪些責任？','偏向角色責任：你願意為這個身分改變到什麼程度？']}),
    scene('s05-followup','ch5','如果你站在這一邊……','請聽見另一邊的理由，重新思考自己的選擇；拉鋸持續開放。','ch05-reflect',{focusActivityId:'a-tug',steps:['偏向自我選擇：作為教師，你不能忽視哪些責任？','偏向角色責任：你願意為這個身分改變到什麼程度？']}),
    scene('s05-integrate','ch5','我要如何兼顧兩者？','我要如何既不失去自己，也不忽略教師應承擔的責任？','ch05-integrate'),
    scene('s06-transition','ch6','從選擇，走向生命','當我們做出選擇時，也正在決定自己要成為怎樣的人。','ch06-transition'),
    scene('s06-questions','ch6','從選擇走向生命：人生三問','走過照片、他人的期待與自己的選擇，現在，把問題留給自己。','ch06-questions',{steps:['人為何而活？','應如何生活？','要如何才能活出應活的生命？']}),
    scene('s06-silence','ch6','給自己十秒鐘','不用回答別人，只要誠實面對自己。','ch06-silence'),
    scene('s06-ending','ch6','看見自己，理解他人，成為自己','覺察自己、看見不同的理由，最後回到自己相信的生命價值。','ch06-ending',{steps:['看見自己','理解他人','成為自己']}),
    scene('s06-curtain','ch6','這張照片，你怎麼看？','願我們看見角色，也不忘看見人。','ch06-curtain')
  ];
  const roleCards = [
    {id:'teacher-1',badge:'01',role:'教師',title:'新手教師',focus:'專業形象、被認可',quote:'我才剛成為正式老師，還在努力建立學生與家長的信任。',persona:'專業形象、被認可',thought:'我才剛成為正式老師，還在努力建立學生與家長的信任。',image:'assets/rolecards/teacher-1.webp',thumb:'assets/rolecards/teacher-1-thumb.webp'},
    {id:'teacher-2',badge:'02',role:'教師',title:'資深教師',focus:'自主、生活界線',quote:'我教書多年，也希望下班後能自由生活，但我知道老師這個身分有被期待的部分。',persona:'自主、生活界線',thought:'我教書多年，也希望下班後能自由生活，但我知道老師這個身分有被期待的部分。',image:'assets/rolecards/teacher-2.webp',thumb:'assets/rolecards/teacher-2-thumb.webp'},
    {id:'teacher-3',badge:'03',role:'教師',title:'曾被誤解的教師',focus:'安全感、過往經驗',quote:'以前曾因一張私人照片被斷章取義，讓我很長一段時間不敢公開生活。',persona:'安全感、過往經驗',thought:'以前曾因一張私人照片被斷章取義，讓我很長一段時間不敢公開生活。',image:'assets/rolecards/teacher-3.webp',thumb:'assets/rolecards/teacher-3-thumb.webp'},
    {id:'teacher-4',badge:'04',role:'教師',title:'重視師生關係的教師',focus:'真誠、親近感',quote:'我希望學生知道老師也是普通人，不需要永遠維持嚴肅的樣子。',persona:'真誠、親近感',thought:'我希望學生知道老師也是普通人，不需要永遠維持嚴肅的樣子。',image:'assets/rolecards/teacher-4.webp',thumb:'assets/rolecards/teacher-4-thumb.webp'},
    {id:'student-4',badge:'05',role:'教師',title:'重視隱私的教師',focus:'隱私、主體尊嚴',quote:'我不覺得這張照片有什麼不妥，但我不希望私人生活被拿來討論。',persona:'隱私、主體尊嚴',thought:'我不覺得這張照片有什麼不妥，但我不希望私人生活被拿來討論。',image:'assets/rolecards/student-4.webp',thumb:'assets/rolecards/student-4-thumb.webp'},
    {id:'student-1',badge:'A',role:'學生',title:'單純好奇的學生',focus:'好奇、分享',quote:'原來老師私下也會這樣！我只是覺得有趣，想分享給同學看，沒有想那麼多。',persona:'好奇、分享',thought:'原來老師私下也會這樣！我只是覺得有趣，想分享給同學看，沒有想那麼多。',image:'assets/rolecards/student-1.webp',thumb:'assets/rolecards/student-1-thumb.webp'},
    {id:'student-2',badge:'C',role:'學生',title:'認為老師應有不同標準的學生',focus:'專業標準、社會期待',quote:'我覺得老師的行為可能影響學生，所以老師應該比一般人更注意形象。',persona:'專業標準、社會期待',thought:'我覺得老師的行為可能影響學生，所以老師應該比一般人更注意形象。',image:'assets/rolecards/student-2.webp',thumb:'assets/rolecards/student-2-thumb.webp'},
    {id:'student-3',badge:'B',role:'學生',title:'想拉近距離的學生',focus:'親近感、認同',quote:'我覺得這樣的老師很真實，反而讓我更喜歡他。',persona:'親近感、認同',thought:'我覺得這樣的老師很真實，反而讓我更喜歡他。',image:'assets/rolecards/student-3.webp',thumb:'assets/rolecards/student-3-thumb.webp'}
  ];
  const activities = {
    'a-ch04-action':{id:'a-ch04-action',kind:'choice',label:'面對分歧｜行動選擇',question:'當你與對方始終無法達成共識，你會優先怎麼做？',options:['我想先理解對方','我仍想表達自己的立場','我願意保留不同意見','我想先談清楚彼此的界線']},
    'a-photo-first':{id:'a-photo-first',kind:'choice',label:'第一次投票｜一般身分',question:'如果照片中的人是你，你能接受這樣的照片被別人看見嗎？',options:['接受','不接受']},
    'a-photo-teacher':{id:'a-photo-teacher',kind:'choice',label:'第二次投票｜教師身分',question:'如果你是一位國小教師，而且是照片中的人，你還能接受這樣的照片被別人看見嗎？',options:['接受','不接受']},
    'a-initial-choice':{id:'a-initial-choice',kind:'choice',label:'初始感受',question:'如果照片中的人是你，被他人看到時，你最接近哪一種感受？',options:['自在，這也是我的樣子','有點尷尬，希望別人別過度解讀','擔心被誤會或評價','需要看照片被誰看見']},
    'a-change':{id:'a-change',kind:'choice',label:'身分揭露後的變化',question:'知道照片主角是教師後，你的想法有改變嗎？',options:['有改變','沒有改變']},
    'a-expect':{id:'a-expect',kind:'choice',label:'教師形象的期待來源',question:'哪一種期待最容易左右教師形象？',options:['教師的自我期待','學生的期待','社會的期待']},
    'a-role-r1-choice':{id:'a-role-r1-choice',kind:'choice',label:'角色辯證｜第一輪',question:'站在你的角色立場，你最想優先守護哪個價值？',options:['個人隱私與自主','教育專業與形象','學生信任與期待','相互理解與對話']},
    'a-role-r2-choice':{id:'a-role-r2-choice',kind:'choice',label:'角色辯證｜第二輪',question:'面對不同角色的質疑，你認為最恰當的回應是？',options:['清楚說明個人界線','坦誠討論彼此期待','承認行為可能帶來影響','暫緩判斷並蒐集更多資訊']},
    'a-role-r3-choice':{id:'a-role-r3-choice',kind:'choice',label:'角色辯證｜第三輪',question:'知道教師的心聲後，你最傾向哪個看法？',options:['更理解教師私人生活的界線','仍認為教師需要謹慎形塑形象','理解雙方都有合理的期待','需要更多情境才能判斷']},
    'a-tug':{id:'a-tug',kind:'tug',label:'自我選擇 × 角色責任',question:'當「做自己」與「回應社會期待」無法完全兼顧時，你會優先考量什麼？',low:'自我選擇',high:'角色責任',options:['left','right']},
    'a-reflect-choice':{id:'a-reflect-choice',kind:'choice',label:'生命反思',question:'當你思考未來的教師身分，最希望守護什麼？',options:['專業責任與信任','真實自我與自主','與學生相互理解','不同身分之間的平衡']},
    // 舊版活動保留定義，供已建立的舊場次回顧；新版畫面不再開放這些題型。
    'a-initial':{id:'a-initial',kind:'text',label:'舊版初始文字回應',question:'初始感受'},
    'a-role-r1':{id:'a-role-r1',kind:'role',label:'舊版第一輪',question:'第一輪'},
    'a-role-r2':{id:'a-role-r2',kind:'role',label:'舊版第二輪',question:'第二輪'},
    'a-role-r3':{id:'a-role-r3',kind:'role',label:'舊版第三輪',question:'第三輪'},
    'a-scale':{id:'a-scale',kind:'scale',label:'舊版立場刻度',question:'原版光譜',low:'自我實現',high:'受到束縛'},
    'a-reflect':{id:'a-reflect',kind:'reflection',label:'舊版生命反思',question:'生命反思'}
  };
  // v0.9.6：18 個主要畫面（含 Ending）；原本的 s02-reveal 改由 s01-photo 同頁揭露。全部舊場景仍保留於 scenes，
  // 供已存在場次與舊版資料讀取；新播放清單不會導航進入它們。
  const presentationIds = [
    's01-welcome','s01-photo',
    's02-results','s02-reasons',
    's03-cards','s03-discuss','s03-share',
    's04-intro','s04-compare','s04-action','s04-boundary',
    's05-vote','s05-live','s05-integrate',
    's06-questions','s06-silence','s06-ending','s06-curtain'
  ];
  const presentationScenes=presentationIds.map(id=>scenes.find(s=>s.id===id));
  const spec = Object.freeze({id:'photo-lecture',title:'這張照片，你怎麼看？',version:'0.9.8',chapters,scenes,presentationIds,presentationScenes,activities,roleCards,groupCount:8});
  window.LectureContent = spec;
})();
