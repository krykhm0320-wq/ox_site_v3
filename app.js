function prettifyStatement(s){
  // 문제는 원본 줄바꿈을 무시하고 한 줄로 보기 좋게 정리
  if(!s) return '';
  s = String(s).replace(/\r/g,'');
  // 단어 중간에서 끊긴 줄바꿈 복구
  s = s.replace(/([가-힣])\n{1,}([가-힣])(?=[가-힣])/g, '$1$2');
  // 나머지 줄바꿈은 공백으로
  s = s.replace(/\n+/g, ' ');
  return s.replace(/\s{2,}/g,' ').trim();
}

function prettifyText(s){
  // PDF 텍스트 추출 특유의 어색한 줄바꿈 정리:
  // - 문단 구분(빈 줄)은 유지
  // - 문단 내부의 단일 줄바꿈은 공백으로 치환
  if(!s) return '';
  s = String(s).replace(/\r/g,'');
  // 단어 중간에서 끊긴 줄바꿈(예: 교\n\n육) 복구
  s = s.replace(/([가-힣])\n{2,}([가-힣])(?=[가-힣])/g, '$1$2');
  // normalize multiple spaces
  const paras = s.split(/\n{2,}/).map(p=>{
    // keep bullet/numbered lines as-is if they look like list
    // but still remove mid-line breaks
    const lines = p.split(/\n/).map(x=>x.trim()).filter(x=>x.length>0);
    // If it looks like a multi-line list (many lines starting with bullet/number), keep newlines
    const listLike = lines.length>=2 && lines.every(x=>/^([0-9]+[.)]|[-*•]|①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩)/.test(x));
    if(listLike) return lines.join('\n');
    return lines.join(' ').replace(/\s{2,}/g,' ').trim();
  });
  return paras.join('\n\n').trim();
}

async function loadQuestions(){
  const res = await fetch('questions.json', {cache:'no-store'});
  if(!res.ok) throw new Error('questions.json 로드 실패');
  return await res.json();
}
function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}
const LS_KEY='ox_wrong_v1';
function loadWrong(){ try{ return JSON.parse(localStorage.getItem(LS_KEY)||'[]'); }catch(e){ return []; } }
function saveWrong(list){ localStorage.setItem(LS_KEY, JSON.stringify(list)); }
function addWrong(q, userAnswer){
  const list=loadWrong();
  const key=String(q.id)+'|'+q.statement;
  if(!list.some(x=>x.key===key)){
    list.unshift({key,id:q.id,statement:q.statement,correct:q.answer,picked:userAnswer,explanation:q.explanation||''});
    saveWrong(list);
  }
}

const BM_KEY='ox_bookmark_v1';
function loadBookmarks(){ try{ return JSON.parse(localStorage.getItem(BM_KEY)||'[]'); }catch(e){ return []; } }
function saveBookmarks(list){ localStorage.setItem(BM_KEY, JSON.stringify(list)); }
function isBookmarked(id){ return loadBookmarks().includes(Number(id)); }
function toggleBookmark(id){
  id=Number(id);
  const list=loadBookmarks();
  const i=list.indexOf(id);
  if(i>=0) list.splice(i,1); else list.push(id);
  list.sort((a,b)=>a-b);
  saveBookmarks(list);
}
function removeWrongByKey(key){
  const list=loadWrong();
  const next=list.filter(x=>x.key!==key);
  if(next.length!==list.length) saveWrong(next);
}

let ALL=[], QUIZ=[], idx=0, score=0, locked=false;
let MODE='random20'; // 'random20' | 'sequential'

const elQ=document.getElementById('question');
const elProg=document.getElementById('progress');
const elScore=document.getElementById('score');
const elMeta=document.getElementById('meta');

const btnO=document.getElementById('btnO');
const btnX=document.getElementById('btnX');
const btnNext=document.getElementById('btnNext');
const btnNextTop=document.getElementById('btnNextTop');
const btnRestart=document.getElementById('btnRestart');
const btnSequential=document.getElementById('btnSequential');
const btnRetryWrong=document.getElementById('btnRetryWrong');
const btnBookmarks=document.getElementById('btnBookmarks');
const btnBookmark=document.getElementById('btnBookmark');

const box=document.getElementById('resultBox');
const title=document.getElementById('resultTitle');
const explain=document.getElementById('explain');

const quizView=document.getElementById('quizView');

function setBtnsEnabled(on){
  [btnO,btnX].forEach(b=>{ b.classList.toggle('disabled', !on); b.disabled=!on; });
}
function sample20(){
  const copy=ALL.slice();
  shuffle(copy);
  return copy.slice(0,20);
}

function buildSequential(){
  // 안전하게 id 오름차순으로 정렬 (JSON 순서가 바뀌어도 항상 1번부터)
  return ALL.slice().sort((a,b)=>{
    const ai=Number(a.id); const bi=Number(b.id);
    if(Number.isFinite(ai) && Number.isFinite(bi)) return ai-bi;
    return String(a.id).localeCompare(String(b.id));
  });
}

function totalCount(){
  return QUIZ.length || 0;
}
function modeLabel(){
  if(MODE==='sequential') return '순서대로';
  if(MODE==='wrongOnly') return '틀린문제';
  if(MODE==='bookmarks') return '북마크';
  return '랜덤20제';
}
function updateMeta(q){
  const w=loadWrong().length;
  const b=loadBookmarks().length;
  const idPart = q ? ` · 문항번호: ${q.id}` : '';
  elMeta.textContent=`모드: ${modeLabel()}${idPart} · 틀린문제: ${w}개 · 북마크: ${b}개`;
}
function render(){
  const q=QUIZ[idx];
  elQ.textContent=prettifyStatement(q.statement);
  elProg.textContent=`${idx+1} / ${totalCount()}`;
  elScore.textContent=`점수: ${score}`;
  updateMeta(q);
  const marked=isBookmarked(q.id);
  btnBookmark.textContent = marked ? '★ 북마크됨' : '☆ 북마크';
  box.classList.add('hidden'); box.classList.remove('good','bad');
  title.textContent=''; explain.textContent='';
  locked=false; setBtnsEnabled(true);
}
function finish(){
  const t=totalCount();
  elQ.textContent=`끝. 점수 ${score}/${t}`;
  elProg.textContent=`${t} / ${t}`;
  updateMeta(null);
  setBtnsEnabled(false); box.classList.add('hidden'); locked=true;
}

function showResult(picked){
  const q = QUIZ[idx];
  const correct = q.answer;
  const ok = picked === correct;

  const key = String(q.id) + '|' + q.statement;

  if(ok){
    score += 1;
    // 틀린문제 목록에서 제거 (맞추면 제거)
    removeWrongByKey(key);
  }else{
    // 틀린문제 목록에 추가/유지 (또 틀리면 유지)
    addWrong(q, picked);
  }

  box.classList.remove('hidden');
  box.classList.toggle('good', ok);
  box.classList.toggle('bad', !ok);
  title.textContent = ok ? `정답 (정답: ${correct})` : `오답 (정답: ${correct})`;
  explain.textContent = (q.explanation && String(q.explanation).trim()) ? q.explanation : '(해설 추출 누락)';
  locked = true;
  setBtnsEnabled(false);
}

btnO.addEventListener('click', ()=>{ if(!locked) showResult('O'); });
btnX.addEventListener('click', ()=>{ if(!locked) showResult('X'); });
function onNextClick(){
  if(!locked) return;
  if(idx<QUIZ.length-1){ idx+=1; render(); } else { finish(); }
}

btnNext.addEventListener('click', onNextClick);
btnNextTop.addEventListener('click', onNextClick);

btnRestart.addEventListener('click', ()=>{ restart('random20'); });
btnSequential.addEventListener('click', ()=>{ restart('sequential'); });
btnRetryWrong.addEventListener('click', ()=>{ restart('wrongOnly'); });
btnBookmarks.addEventListener('click', ()=>{ restart('bookmarks'); });
btnBookmark.addEventListener('click', ()=>{
  const q=QUIZ[idx];
  toggleBookmark(q.id);
  render();
});

function buildWrongQuiz(){
  const list=loadWrong();
  if(list.length===0) return [];
  const byId=new Map(ALL.map(q=>[Number(q.id), q]));
  return list.map(x=>{
    const q=byId.get(Number(x.id));
    if(q) return q;
    return {id:x.id, statement:x.statement, answer:x.correct, explanation:x.explanation||''};
  });
}
function buildBookmarksQuiz(){
  const ids=loadBookmarks();
  if(ids.length===0) return [];
  const byId=new Map(ALL.map(q=>[Number(q.id), q]));
  return ids.map(id=>byId.get(Number(id))).filter(Boolean);
}
function restart(mode){
  MODE = mode || MODE || 'random20';
  if(MODE==='sequential') QUIZ = buildSequential();
  else if(MODE==='wrongOnly') QUIZ = buildWrongQuiz();
  else if(MODE==='bookmarks') QUIZ = buildBookmarksQuiz();
  else QUIZ = sample20();
  if(QUIZ.length===0){ MODE='random20'; QUIZ=sample20(); }
  idx=0; score=0; locked=false;
  quizView.classList.remove('hidden');
  render();
}

(async ()=>{
  ALL=await loadQuestions();
  restart('random20');
})().catch(e=>{
  elQ.textContent='불러오기 실패: '+e.message;
});
