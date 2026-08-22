/* ==================================================================
   프로파일 엔진 + 설계서 렌더러 + AI 심화
   ================================================================== */

const $ = id => document.getElementById(id);
const md = s => String(s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
  .replace(/\n/g,'<br>');
const band = v => BANDS.find(b => v >= b.min) || BANDS[BANDS.length-1];
const GRADE = {'초':'초등 고학년','중':'중학생','고':'고등학생'};

/* ---------- 입력칸 ---------- */
(function(){
  $('scoreInputs').innerHTML = ORDER.map(c=>{
    const a=KB[c];
    return `<div><div class="areahead"><span class="dot" style="background:${a.color}"></span>
      <label style="margin:0">${a.ko}<span class="code">${c}</span></label></div>
      <input type="number" id="s_${c}" min="0" max="200" placeholder="0" oninput="livePreview()">
      <p class="hint">${a.short}</p></div>`;
  }).join('');
  $('childInputs').innerHTML = ORDER.map(c=>{
    const a=KB[c];
    return `<div><div class="areahead"><span class="dot" style="background:${a.color}"></span>
      <label style="margin:0">${a.ko}<span class="code">${c}</span></label></div>
      <input type="number" id="c_${c}" min="0" max="200" placeholder="—"></div>`;
  }).join('');
})();

function fillSample(){
  const v={LAB:79,RAB:95,LPB:34,RPB:107}, cv={LAB:72,RAB:68,LPB:28,RPB:104};
  ORDER.forEach(c=>{ $('s_'+c).value=v[c]; $('c_'+c).value=cv[c]; });
  $('name').value='김주엽'; $('grade').value='중';
  $('ex').value=7; $('inv').value=5; $('pos').value=18; $('neg').value=0;
  $('wpos').value=12; $('wneg').value=4; $('word').value='';
  livePreview();
}

/* ================================================================
   1. 프로파일 추출
   ================================================================ */
function buildProfile(){
  const s={}, miss=[];
  ORDER.forEach(c=>{ const v=parseInt($('s_'+c).value,10); if(isNaN(v)) miss.push(c); s[c]=v; });
  if(miss.length) return { error:'네 영역 점수를 모두 입력해 주세요.' };

  const child={}; let hasChild=true;
  ORDER.forEach(c=>{ const v=parseInt($('c_'+c).value,10); if(isNaN(v)) hasChild=false; child[c]=v; });

  const n = id => parseInt($(id).value,10)||0;
  const sorted=[...ORDER].sort((a,b)=>s[b]-s[a]);
  const comp = ORDER.filter(c=>s[c]>=80);
  const top1=sorted[0], top2=sorted[1], low=sorted[3];
  const gap12=s[top1]-s[top2], spread=s[top1]-s[low];

  const kind = comp.length===0?'기준선 미도달'
             : comp.length===1?'Single Brain Type'
             : comp.length===2?'Double Brain Type'
             : comp.length===3?'Triple Brain Type':'Whole Brain Type';

  const diagOfTop=DIAGONAL[top1], diagIsLowest=(diagOfTop===low);
  const pairKey=[top1,top2].sort().join('+');
  const usePair=(s[top2]>=80)||(gap12<=12&&s[top2]>=70);

  const ex=n('ex'), inv=n('inv'), eiTot=ex+inv;
  const eiKey = !eiTot?'balanced' : (ex/eiTot>=0.7?'extra' : ex/eiTot<=0.35?'intro':'balanced');

  let shift=null;
  if(hasChild){
    const cs=[...ORDER].sort((a,b)=>child[b]-child[a]);
    const moves=ORDER.map(c=>({c,d:s[c]-child[c]})).sort((a,b)=>Math.abs(b.d)-Math.abs(a.d));
    shift={childTop:cs[0], sameTop:cs[0]===top1, biggest:moves[0]};
  }

  return { name:$('name').value.trim()||'학생', grade:$('grade').value,
    mode: ($('mode')&&$('mode').value)||'both',
    scores:s, child:hasChild?child:null, shift,
    sorted, comp, kind, top1, top2, low, gap12, spread,
    diagOfTop, diagIsLowest, pairKey, usePair, ex, inv, eiKey,
    pos:n('pos'), neg:n('neg'), wpos:n('wpos'), wneg:n('wneg'),
    word:$('word').value.trim() };
}

/* ================================================================
   2. 4분면 그래프
   ================================================================ */
function chart(s, child, big){
  const R=big?150:118, C=big?200:165, MAX=130, k=1/Math.SQRT2, VB=big?408:336;
  const dir={LAB:[-1,-1],RAB:[1,-1],LPB:[-1,1],RPB:[1,1]};
  const pt=(v,c)=>{const d=Math.min(Math.max(v,0),MAX)/MAX*R;return [C+dir[c][0]*k*d, C+dir[c][1]*k*d];};
  const poly=o=>['LAB','RAB','RPB','LPB'].map(c=>pt(o[c],c).map(x=>x.toFixed(1)).join(',')).join(' ');
  const rings=[40,60,80,100,130].map(v=>{
    const d=v/MAX*R*k;
    return `<polygon points="${C},${(C-d).toFixed(1)} ${(C+d).toFixed(1)},${C} ${C},${(C+d).toFixed(1)} ${(C-d).toFixed(1)},${C}"
      fill="none" stroke="${v===80?'#9C9382':'#DED8C9'}" stroke-width="${v===80?1.3:.9}" ${v===80?'stroke-dasharray="6 4"':''}/>`;
  }).join('');
  const q=(x,y,c)=>`<rect x="${x}" y="${y}" width="${R}" height="${R}" fill="${KB[c].color}" opacity=".085"/>`;
  const childPoly = child?`<polygon points="${poly(child)}" fill="none" stroke="#9AA6C9" stroke-width="1.4" stroke-dasharray="5 4"/>`:'';
  const dots=ORDER.map(c=>{
    const [x,y]=pt(s[c],c), fs=big?19:14;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${big?6:5.5}" fill="${KB[c].color}" stroke="#F4F1EA" stroke-width="2.2"/>
      <text x="${(x+dir[c][0]*(big?22:16)).toFixed(1)}" y="${(y+dir[c][1]*(big?22:16)+fs*.34).toFixed(1)}"
        text-anchor="middle" font-size="${fs}" font-weight="800" fill="#12100E"
        style="font-variant-numeric:tabular-nums">${s[c]}</text>`;
  }).join('');
  const off=R*k+(big?12:8), fs2=big?12.5:11;
  const labs=[['LAB',C-off,C-off,'end'],['RAB',C+off,C-off,'start'],
              ['LPB',C-off,C+off+(big?20:18),'end'],['RPB',C+off,C+off+(big?20:18),'start']]
    .map(([c,x,y,a])=>`<text x="${x}" y="${y}" text-anchor="${a}" font-size="${fs2}" font-weight="700"
      letter-spacing=".04em" fill="${KB[c].color}">${KB[c].ko} ${c}</text>`).join('');
  return `<svg viewBox="0 0 ${VB} ${VB}" width="100%" style="max-width:${big?420:340}px;display:block;margin:0 auto">
    ${q(C-R,C-R,'LAB')}${q(C,C-R,'RAB')}${q(C-R,C,'LPB')}${q(C,C,'RPB')}
    <line x1="${C}" y1="${C-R-8}" x2="${C}" y2="${C+R+8}" stroke="#CFC7B6" stroke-width=".9"/>
    <line x1="${C-R-8}" y1="${C}" x2="${C+R+8}" y2="${C}" stroke="#CFC7B6" stroke-width=".9"/>
    ${rings}${childPoly}
    <polygon points="${poly(s)}" fill="#123227" fill-opacity=".13" stroke="#123227" stroke-width="2" stroke-linejoin="round"/>
    ${dots}${labs}
    <text x="${C}" y="${VB-8}" text-anchor="middle" font-size="10" fill="#8A847A">점선 마름모 = 80점 기준선${child?' · 회색 = 소아청소년기':''}</text>
  </svg>`;
}


/* ================================================================
   학습법 시각화 — 표 대신 그림으로
   ================================================================ */
function vizPaired(ev){
  const rows=ev.table;
  return `<div class="vz">
    <div class="vzhead"><span>${ev.cols[0]}</span>
      <span class="vzk"><i class="c1"></i>${ev.cols[1]}<i class="c2"></i>${ev.cols[2]}</span></div>
    ${rows.map((r,i)=>{
      const a=parseInt(r[1]), b=parseInt(r[2]), best=(i===rows.length-1);
      return `<div class="vzrow ${best?'best':''}">
        <div class="vzlab">${r[0]}${best?'<em>가장 오래 남음</em>':''}</div>
        <div class="vzbars">
          <div class="vzb"><i class="c1" style="width:${a}%"></i><b>${r[1]}</b></div>
          <div class="vzb"><i class="c2" style="width:${b}%"></i><b>${r[2]}</b></div>
        </div></div>`;
    }).join('')}
    <div class="vzarrow">시간이 지날수록 <b>순위가 뒤집힙니다</b></div>
  </div>`;
}

function vizDuo(ev){
  const rows=ev.table, mx=Math.max(...rows.map(r=>parseInt(r[1])));
  return `<div class="vz">
    <div class="vzhead"><span>${ev.cols[0]}</span><span class="vzk">${ev.cols[1]}</span></div>
    ${rows.map(r=>{
      const v=parseInt(r[1]), win=(v===mx);
      return `<div class="vzrow ${win?'best':''}">
        <div class="vzlab">${r[0]}</div>
        <div class="vzbars"><div class="vzb big"><i class="${win?'c2':'c1'}" style="width:${(v/mx*100).toFixed(1)}%"></i><b>${r[1]}</b></div></div>
      </div>`;
    }).join('')}
    <div class="vzarrow">문제 <b>순서만</b> 바꿨는데 <b>24%p</b> 차이</div>
  </div>`;
}

function vizEffect(ev){
  const rows=ev.table;
  const val=r=>parseFloat(String(r[1]).replace(/[^0-9.]/g,''));
  const mx=Math.max(...rows.map(val));
  return `<div class="vz">
    <div class="vzhead"><span>${ev.cols[0]}</span><span class="vzk">${ev.cols[1]} — 클수록 효과 큼</span></div>
    ${rows.map((r,i)=>`<div class="vzrow ${i===0?'best':''}">
      <div class="vzlab">${r[0]}<em>${r[2]}</em></div>
      <div class="vzbars"><div class="vzb big"><i class="${i<2?'c2':'c1'}" style="width:${(val(r)/mx*100).toFixed(1)}%"></i><b>${r[1]}</b></div></div>
    </div>`).join('')}
    <div class="vzarrow">위 두 개가 <b>꺼내기·설명하기</b> 계열 · 아래 두 개가 흔히 쓰는 방법</div>
  </div>`;
}

function vizTimeline(ev){
  const rows=ev.table;
  return `<div class="vz">
    <div class="vzhead"><span>${ev.cols[0]}</span><span class="vzk">${ev.cols[1]}</span></div>
    <table class="t" style="margin:6px 0 20px">
      <tbody>${rows.map(r=>`<tr><td class="k">${r[0]}</td><td class="v">${r[1]}</td></tr>`).join('')}</tbody></table>
    <div class="tlx"><div class="tlx-line"></div>
      ${[['공부한 날','0'],['2~3일 뒤','+3'],['1주일 뒤','+7'],['시험','D']].map((x,i)=>
        `<div class="tlx-n ${i===3?'end':''}"><span class="tlx-d">${x[1]}</span><b>${x[0]}</b></div>`).join('')}
    </div>
    <p class="src" style="margin-top:2px">한 단원을 <b>최소 세 번, 서로 다른 날에</b> 만나는 것이 기본 세트입니다.</p>
  </div>`;
}

function renderViz(c){
  const f={paired:vizPaired, duo:vizDuo, effect:vizEffect, timeline:vizTimeline}[c.viz];
  return f ? f(c.evidence) : '';
}

function methodCards(){
  return `<div class="mcards">${CORE.map(c=>`
    <div class="mcard">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${c.icon}"/></svg>
      <span class="mn">${c.n}</span><b>${c.name}</b><span class="md">${c.card}</span>
    </div>`).join('')}</div>`;
}

/* ================================================================
   3. 설계서 렌더
   ================================================================ */
let P=null;

function generate(){
  const p=buildProfile();
  if(p.error){ alert(p.error); return; }
  P=p;
  $('report').innerHTML=renderReport(p);
  $('input').style.display='none';
  $('result').style.display='block';
  window.scrollTo(0,0);
}
function backToInput(){ $('result').style.display='none'; $('input').style.display='block'; window.scrollTo(0,0); }
function toggleEdit(){
  const on=document.body.classList.toggle('editing');
  $('report').setAttribute('contenteditable', on?'true':'false');
  if(on) $('report').focus();
}

function sec(idx, kicker, title, lead, body, cls){
  return `<section class="sec ${cls||''}"><div class="wrap">
    <div class="sechead"><div class="idx">${idx}</div><div>
      <div class="kicker">${kicker}</div><h2>${title}</h2>
      ${lead?`<p>${md(lead)}</p>`:''}
    </div></div>${body}</div></section>`;
}

function renderReport(p){
  /* ── 캠프 모드 ────────────────────────────────────────────
     both   결합 캠프 — 9섹션 전부
     career 진로 캠프 — 학습법 상세(03·04·05)를 뺀다
     study  자기주도학습 캠프 — 진로·로드맵(06·07)을 뺀다
     번호는 남은 섹션에 다시 매긴다. 「01 02 05」처럼 비어 보이면 안 된다. */
  const MODE = p.mode || 'both';
  const SKIP = MODE==='career' ? ['03','04','05']
             : MODE==='study'  ? ['06','07'] : [];
  const on = k => !SKIP.includes(k);
  let _n = 0;
  const num = () => String(++_n).padStart(2,'0');
  const s=p.scores, A=KB[p.top1], B=KB[p.top2], L=KB[p.low];
  const H=[];

  /* ---------- 표지 ---------- */
  H.push(`<div class="cover"><div class="wrap">
    <div class="eyebrow">${p.name} · ${GRADE[p.grade]} · HBTS 진로·학습 설계서</div>
    <h1>${md(A.oneLine).replace(/, /,',<br>')}</h1>
    <div class="std">
      <span>가장 높은 영역<b>${A.ko} ${s[p.top1]}</b></span>
      <span>가장 낮은 영역<b>${L.ko} ${s[p.low]}</b></span>
      <span>격차<b>${p.spread}점</b></span>
      <span>유형<b>${p.kind}</b></span>
    </div>
  </div></div>`);

  /* ---------- 01 프로파일 ---------- */
  let pf = `<div class="profile"><div>${chart(s,p.child,true)}</div>
    <div class="scores">${ORDER.map(a=>{
      const b=band(s[a]), cls = a===p.top1?'top' : a===p.low?'low' : '';
      return `<div class="srow ${cls}">
        <span class="nm"><span class="sw" style="background:${KB[a].color}"></span>
          <b>${KB[a].ko}</b><i>${a}</i></span>
        <span><span class="big">${s[a]}</span><span class="lv">${b.label}</span></span></div>`;
    }).join('')}</div></div>`;

  pf += `<p class="src" style="margin-top:18px">80점이 기준선입니다. 넘은 영역이 현재 기능이 뛰어난 영역(Competency Area)이며,
    그것이 타고난 것인지 후천적으로 개발한 것인지는 전문가 분석 영역이라 이 설계서는 <b>현재 점수 기준</b>으로만 씁니다.</p>`;

  if(p.comp.length===0) pf += `<div class="callout"><h5>80점을 넘은 영역이 없습니다</h5>
    <p>나쁜 결과가 아닙니다. 어느 한쪽이 아직 뚜렷하게 튀지 않았다는 뜻이고, 성장기에는 흔한 형태입니다.
    <b>앞으로 무엇을 많이 해보느냐에 따라 어느 쪽이든 올라올 수 있는 상태</b>로 보는 편이 맞습니다.</p>
    <p style="margin-bottom:0">아래 설계는 지금 가장 높은 <b>${A.ko} ${s[p.top1]}점</b>을 기준으로 썼습니다.
    확정된 방향이 아니라 <b>먼저 시험해볼 방향</b>으로 읽어주세요.</p></div>`;
  if(p.comp.length===4) pf += `<div class="callout"><h5>네 영역이 모두 80점을 넘었습니다</h5>
    <p style="margin-bottom:0">네 방식을 두루 쓸 수 있다는 뜻입니다. 다만 <b>다 잘한다는 건 우선순위를 정하기 어렵다는 뜻</b>이기도 합니다.
    이 경우 검사보다 <b>실제로 해봤을 때 덜 지치는 쪽</b>이 더 정확한 기준이 됩니다.</p></div>`;

  if(on('01')) H.push(sec(num(),'Profile','두뇌 프로파일','',pf));

  /* ---------- 02 나는 이런 사람 ---------- */
  let who = `<h3 class="blk">${A.ko}(${p.top1}) ${s[p.top1]}점 — ${A.nick}</h3>
    <ul class="pl">${A.traits.map(t=>`<li>${md(t)}</li>`).join('')}</ul>`;

  if(p.usePair){
    who += `<h3 class="blk">${B.ko}(${p.top2}) ${s[p.top2]}점도 함께 높습니다 — ${B.nick}</h3>
      <ul class="pl">${B.traits.slice(0,5).map(t=>`<li>${md(t)}</li>`).join('')}</ul>`;
    const cb=COMBO[p.pairKey];
    if(cb) who += `<div class="callout"><h5>두 영역이 겹치는 자리 — ${cb.name}</h5>
      <p>${md(cb.desc)}</p>${cb.note?`<p class="src" style="margin-top:10px">${md(cb.note)}</p>`:''}</div>`;
  } else {
    who += `<div class="pull">${A.ko} ${s[p.top1]}점과 2순위 ${B.ko} ${s[p.top2]}점의 차이가 <b>${p.gap12}점</b>으로 뚜렷합니다.
      ${A.ko} 쪽 특징이 특히 강하게 나타나는 편이라, 이 영역을 중심으로 설계하는 편이 낫습니다.</div>`;
  }

  if(p.diagIsLowest && s[p.top1]>=80 && p.spread>=30){
    who += `<div class="warnbox"><b>가장 강한 영역의 대각선이 가장 낮습니다</b><br>
      결과지는 대각선에 있는 두 영역이 <b>서로 반대 성격</b>이라고 설명합니다.
      ${A.ko}가 가장 높고 그 대각선인 ${L.ko}가 가장 낮은 지금 형태는
      <b>강점이 뚜렷한 대신 그 반대편이 확실히 비어 있는</b> 모양입니다.
      강점 쪽으로 밀되, 비어 있는 쪽은 <b>노력이 아니라 도구로</b> 메우는 편이 효율적입니다.</div>`;
  }

  who += `<h4 class="mini">이 유형이 힘을 내는 자리</h4>
    <ul class="pl">${A.core.map(t=>`<li>${md(t)}</li>`).join('')}</ul>`;

  if(on('02')) H.push(sec(num(),'Identity','나는 이런 사람입니다','', who, 'alt'));

  /* ---------- 03 학습 과학 (다크) ---------- */
  let core = CORE.map(c=>{
    let t = `<div class="core"><div class="ch"><div class="cn">${c.n}</div><div>
        <h3>${c.name}</h3><div class="eng">${c.eng}</div></div></div>
      <p class="one">${md(c.oneLine)}</p>
      <div class="body">
        ${c.why.map(w=>`<p>${md(w)}</p>`).join('')}
        <div class="callout"><h5>${c.evidence.head}</h5>
          ${renderViz(c)}
          <p style="margin:12px 0 0">${md(c.evidence.note)}</p>
          <p class="src">${c.evidence.src}</p></div>
        <h4 class="mini">이렇게 합니다</h4>
        <ol class="step">${c.how.map(h=>`<li>${md(h)}</li>`).join('')}</ol>
        <p class="src" style="margin-top:14px">${md(c.tip)}</p>
        ${c.warn?`<div class="warnbox">${md(c.warn)}</div>`:''}
        ${c.worry?`<p style="margin-top:14px;font-size:14.5px;opacity:.85">${md(c.worry)}</p>`:''}
      </div></div>`;
    return t;
  }).join('');

  if(on('03')) H.push(sec(num(),'Learning Science','공부는 이 네 가지로 갑니다',
    '이 네 가지는 수백 편의 연구로 검증된 것이고, **유형과 상관없이 모든 학생에게 똑같이 효과가 있습니다.** 여기부터가 실제로 성적을 움직이는 부분입니다.',
    methodCards() + core, 'dark'));

  /* ---------- 04 나의 진입로 ---------- */
  const en = ENTRY[p.top1];
  let entry = `<p>${md(en.intro)}</p>
    <div class="entry">${en.map.map(([k,v])=>`<div class="er"><b>${k}</b><span>${md(v)}</span></div>`).join('')}</div>`;

  const ei=EI[p.eiKey];
  entry += `<h3 class="blk">외향성 ${p.ex} : 내향성 ${p.inv} — ${ei.title}</h3>
    <p>${md(ei.body)}</p><div class="pull">${md(ei.todo)}</div>`;

  entry += `<h3 class="blk">${AB_TEST.title}</h3><p>${md(AB_TEST.lead)}</p>
    <ol class="step">${AB_TEST.steps.map(x=>`<li><b>${x.n}</b> — ${md(x.d)}</li>`).join('')}</ol>
    <div class="callout"><h5>왜 느낌이 아니라 숫자인가</h5><p style="margin-bottom:0">${md(AB_TEST.note)}</p></div>`;

  entry += `<h3 class="blk">${DAILY.title}</h3>
    <table class="t"><tbody>${DAILY.rows.map(r=>`<tr><td class="k">${r[0]}</td><td class="v">${r[1]}</td></tr>`).join('')}</tbody></table>
    <p>${md(DAILY.note)}</p><p class="src">${DAILY.src}</p>`;

  if(on('04')) H.push(sec(num(),'Entry Point',`${en.label}`,
    '위 네 가지를 **어떤 모습으로 시작하면 이 학생이 첫 주에 포기하지 않을지**에 대한 제안입니다.',
    entry));

  /* ---------- 05 시험 계획 ---------- */
  let exam = `<p>${md(EXAM_PLAN.lead)}</p>
    <table class="t"><tbody>${EXAM_PLAN.rows.map(r=>
      `<tr><td class="k">${r[0]}</td><td>${md(r[1])}</td></tr>`).join('')}</tbody></table>`;

  const ws=WEAK_SUPPORT[p.low];
  if(ws && s[p.low]<60){
    exam += `<h3 class="blk">${ws.title} — 현재 ${s[p.low]}점</h3>
      <p>약점을 없애자는 게 아니라, <b>강점을 쓰는 데 방해가 되지 않게</b> 막아두자는 뜻입니다.</p>
      <h4 class="mini">이런 일이 생길 수 있습니다</h4>
      <ul class="pl">${ws.signs.map(t=>`<li>${md(t)}</li>`).join('')}</ul>
      <div class="warnbox">${p.low==='LPB'
        ? '결과지는 좌측후뇌가 취약한 경우에 대해 이렇게 설명합니다. <b>약한 영역의 일을 의식적으로 피하면 그 취약점이 더 악화될 수 있습니다.</b>'
        : '<b>약한 영역의 일을 계속 피하면 그 부분이 더 굳어질 수 있습니다.</b>'} 피하는 게 아니라 <b>도구로 막는 것</b>이 방법입니다.</div>
      <h4 class="mini">그래서 이렇게 막습니다</h4>
      <ul class="pl">${ws.fixes.map(t=>`<li>${md(t)}</li>`).join('')}</ul>`;
  } else if(s[p.low]>=60){
    exam += `<div class="callout"><h5>크게 취약한 영역이 없습니다</h5><p style="margin-bottom:0">
      네 영역 중 가장 낮은 ${L.ko}도 <b>${s[p.low]}점</b>으로 보통 이상입니다.
      막아야 할 것보다 <b>가장 높은 영역을 어디에 쓸지</b>를 정하는 게 먼저입니다.</p></div>`;
  }

  if(on('05')) H.push(sec(num(),'Exam Plan','시험 2주 계획표','', exam, 'alt'));

  /* ---------- 06 진로 ---------- */
  let car = `<p>아래는 <b>정답 목록이 아니라 탐색을 시작할 지도</b>입니다. 여기 없는 직업이 답일 수도 있습니다.
    중요한 건 직업 이름이 아니라 <b>「내가 어떤 방식으로 일할 때 힘이 나는가」</b>입니다.</p>
    <h4 class="mini">${A.ko}(${p.top1}) 기준 — 대표 분야</h4>
    <div class="tags">${A.fields.map(f=>`<span>${f}</span>`).join('')}</div>`;

  if(p.usePair){
    car += `<h4 class="mini">${B.ko}(${p.top2}) 기준 — 대표 분야</h4>
      <div class="tags">${B.fields.map(f=>`<span>${f}</span>`).join('')}</div>`;
    const cb=COMBO[p.pairKey];
    if(cb) car += `<div class="callout"><h5>두 개가 겹치는 자리 — ${cb.name}</h5>
      <p>${md(cb.desc)}</p><div class="tags yes" style="margin-top:12px">${cb.where.map(w=>`<span>${w}</span>`).join('')}</div></div>`;
  }

  const cm = CAREER_MAP[p.top1];
  car += `<h3 class="blk">${A.ko} 강점이 쓰이는 자리 — 일하는 방식으로 묶으면</h3>
    <p class="src" style="margin-bottom:14px">직업 이름이 아니라 <b>「어떤 방식으로 일하는가」</b>로 묶었습니다. ${WORK_STYLE[p.top1]}입니다.</p>
    <table class="t"><tbody>${cm.map(r=>
      `<tr><td class="k" style="width:190px">${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</tbody></table>`;

  if(p.usePair && CAREER_MAP[p.top2]){
    car += `<h3 class="blk">${B.ko} 쪽에서 열리는 자리</h3>
      <table class="t"><tbody>${CAREER_MAP[p.top2].map(r=>
        `<tr><td class="k" style="width:190px">${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</tbody></table>`;
  }

  car += `<p class="src">HBTS 결과지의 직업 분류를 참고하되, 학생이 읽기 쉽도록 뿌리깊이가 다시 묶은 것입니다.
    여기 없는 직업도 얼마든지 가능합니다.</p>`;

  if(on('06')) H.push(sec(num(),'Career','진로 방향','', car));

  /* ---------- 07 로드맵 ---------- */
  const R=ROADMAP_PRINCIPLE, stage=ROADMAP_STAGE[p.grade], ra=ROADMAP_AREA[p.top1];
  let road = R.body.map(b=>`<p>${md(b)}</p>`).join('');
  road += `<div class="callout"><h5>${R.research.head}</h5>
    ${R.research.body.split('\n\n').map(x=>`<p>${md(x)}</p>`).join('')}
    <p class="src">${R.research.src}</p></div>`;

  road += `<h3 class="blk">${R.cycle.title}</h3>
    <ol class="step">${R.cycle.steps.map(x=>`<li><b>${x.n}</b> — ${md(x.d)}</li>`).join('')}</ol>
    <div class="pull">${md(R.cycle.note)}</div>`;

  road += `<h3 class="blk">지금 시기 — ${stage.label}의 과제는 「${stage.mission}」</h3>
    <div class="mission">${stage.mission}</div>
    <p>${md(stage.focus)}</p>
    <ul class="pl">${stage.tasks.map(t=>`<li>${md(t)}</li>`).join('')}</ul>
    ${stage.grade?`<div class="pull">${md(stage.grade)}</div>`:''}
    <div class="warnbox"><b>이 시기에 하지 말 것</b><br>${md(stage.dont)}</div>`;

  if(stage.fact) road += `<h3 class="blk">${stage.fact.head}</h3>
    <table class="t"><tbody>${stage.fact.rows.map(r=>
      `<tr><td class="k" style="width:200px">${md(r[0])}</td><td>${md(r[1])}</td></tr>`).join('')}</tbody></table>
    <p class="src">2026년 8월 기준. 학교별 세부 운영은 학사일정을 확인하세요.</p>`;

  road += `<h3 class="blk">${ra.headline}</h3>
    <h4 class="mini">학교생활에서</h4>
    <ul class="pl">${ra.school.map(t=>`<li>${md(t)}</li>`).join('')}</ul>
    <h4 class="mini">진로를 탐색할 때</h4>
    <ul class="pl">${ra.explore.map(t=>`<li>${md(t)}</li>`).join('')}</ul>
    <div class="warnbox">${md(ra.caution)}</div>
    ${p.grade!=='초'?`<div class="callout"><h5>고교학점제 관련</h5><p style="margin-bottom:0">${md(ra.hs)}</p></div>`:''}`;

  road += `<h3 class="blk">${R.chance.title}</h3><p>${md(R.chance.lead)}</p>
    <table class="t"><tbody>${R.chance.items.map(r=>
      `<tr><td class="k" style="width:120px">${r[0]}</td><td>${md(r[1])}</td></tr>`).join('')}</tbody></table>
    <p class="src">${R.chance.src}</p>`;

  if(on('07')) H.push(sec(num(),'Roadmap','학창시절 로드맵','', road, 'alt'));

  /* ---------- 08 정서 ---------- */
  let emo = `<table class="t"><tbody>
    <tr><td class="k">전반 감정</td><td class="v">${p.pos} : ${p.neg}</td><td>${md(emoText(p.pos,p.neg))}</td></tr>
    <tr><td class="k">공부에 대한 감정</td><td class="v">${p.wpos} : ${p.wneg}</td><td>${md(emoText(p.wpos,p.wneg))}</td></tr>
  </tbody></table>`;
  if(p.word) emo += `<div class="warnbox">주목해야 할 단어로 <b>「${p.word}」</b>가 나왔습니다.
    어떤 상황에서 이런 마음이 드는지 한 줄로 적어보세요. 적어두면 원인을 찾기가 훨씬 쉬워집니다.</div>`;
  emo += shiftBlock(p);

  if(on('08')) H.push(sec(num(),'State','지금의 마음','', emo));

  /* ---------- 09 이 설계서가 서 있는 자리 ---------- */
  if(on('09')) H.push(sec(num(),'Method', SCIENCE_NOTE.title, '',
    SCIENCE_NOTE.body.map(b=>`<p>${md(b)}</p>`).join('') +
    `<p class="src">${SCIENCE_NOTE.src}</p>` +
    `<div class="callout" style="margin-top:26px"><h5>이 자료에 대하여</h5>${md(DISCLAIMER)}</div>`,
    'alt'));

  /* ---------- AI 자리 ---------- */
  H.push(`<div id="aiSlot"></div>`);

  /* ---------- 교사용 ---------- */
  const hiN = p.comp.length ? p.comp.map(a=>`${KB[a].ko}(${a})`).join(' · ') : `${A.ko}(${p.top1})`;
  /* 교사·학부모용 페이지는 학생이 직접 쓰는 화면에서는 붙지 않는다.
     강사 모드(하단 「강사용 도구」)를 켰을 때만 설계서 뒤에 붙는다. */
  if(document.body.classList.contains('admin'))
  H.push(`<div class="teacher"><div class="wrap">
    <span class="tag">교사 · 학부모용 — 학생 배부용 아님</span>
    <h2 style="font-size:29px;font-weight:800;letter-spacing:-.042em;margin-bottom:20px">${p.name==='학생'?'학생':p.name+' 학생'} 지도 가이드</h2>
    <p style="opacity:.85">이 학생은 <b>${hiN}</b> 기능이 상대적으로 높고,
      <b>${L.ko}(${p.low}) ${s[p.low]}점</b>으로 이 영역이 가장 낮게 나타났습니다.
      <b>능력의 문제가 아니라 작동 방식의 차이</b>로 접근해 주십시오.</p>
    <div class="callout"><h5>먼저 확인해 주십시오</h5><p style="margin-bottom:0">
      이 설계서의 학습법은 <b>유형과 무관하게 모든 학생에게 동일하게 적용되는 검증된 기법</b>입니다.
      유형별로 다른 것은 <b>시작하는 형식</b>뿐입니다.
      「이 학생은 ○○형이라 △△ 과목은 어렵다」는 해석은 이 자료가 지지하지 않습니다.</p></div>
    <h4 class="mini" style="color:rgba(244,241,234,.55)">강점이 드러나는 수업 형태</h4>
    <ul class="pl">${A.activities.map(t=>`<li>${t}</li>`).join('')}</ul>
    <h4 class="mini" style="color:rgba(244,241,234,.55)">이 학생에게 역효과가 나는 방식</h4>
    <ul class="pl">${A.antiStudy.map(t=>`<li>${t}</li>`).join('')}</ul>
    ${ws && s[p.low]<60 ? `
      <h4 class="mini" style="color:rgba(244,241,234,.55)">보완 지도 — ${L.ko}(${p.low}) 기준</h4>
      <ul class="pl">${ws.teacher.map(t=>`<li>${md(t)}</li>`).join('')}</ul>
      ${ws.teacherNote?`<p class="src">${ws.teacherNote}</p>`:''}` : ''}
    <p class="src" style="margin-top:26px">주식회사 뿌리깊이 · 1551-1294 &nbsp;|&nbsp; HBTS 전문가 상담 www.hbbrain.co.kr</p>
  </div></div>`);

  return H.join('');
}

function emoText(pos,neg){
  const t=pos+neg, r=t?pos/t:0;
  if(r>=.85) return '긍정적 감정의 비율이 매우 높게 나타났습니다. 지금 상태가 안정적인 편입니다.';
  if(r>=.65) return '대체로 긍정적인 편입니다. 다만 부정적 감정도 일부 있으니, 어떤 상황에서 그런 마음이 드는지 한 번 살펴보면 좋습니다.';
  if(r>=.40) return '긍정과 부정이 섞여 있습니다. 무엇이 힘들게 하는지 구체적으로 적어보는 것이 도움이 됩니다.';
  return '부정적 감정의 비율이 높게 나타났습니다. 혼자 두지 말고 **믿을 만한 어른과 이야기해보는 것**을 권합니다.';
}

function shiftBlock(p){
  if(!p.shift) return '';
  const sh=p.shift, big=sh.biggest, dir=big.d>=0?'올라':'내려';
  let t=`<h3 class="blk">소아청소년기와 비교하면</h3><p>`;
  t += sh.sameTop
    ? `어릴 때도 지금도 <b>${KB[sh.childTop].ko}</b>가 가장 높습니다. 오래 유지되어 온 방향입니다.`
    : `어릴 때는 <b>${KB[sh.childTop].ko}</b>가 가장 높았고, 지금은 <b>${KB[p.top1].ko}</b>가 가장 높습니다.`;
  t += ` 변화 폭이 가장 큰 영역은 <b>${KB[big.c].ko}</b>로 ${Math.abs(big.d)}점 ${dir}갔습니다.</p>`;
  t += `<table class="t"><thead><tr><th>영역</th><th>어릴 때</th><th>지금</th><th>변화</th></tr></thead><tbody>${
    ORDER.map(c=>{ const d=p.scores[c]-p.child[c];
      return `<tr><td class="k">${KB[c].ko} <span class="code">${c}</span></td>
        <td class="v">${p.child[c]}</td><td class="v">${p.scores[c]}</td>
        <td class="v" style="color:${d>=0?'#2E7D5B':'#C4661C'}">${d>=0?'+':''}${d}</td></tr>`;}).join('')
  }</tbody></table>`;
  t += `<p class="src">이 변화가 「두뇌 우성의 변경(Falsification)」에 해당하는지에 대한 판단은 <b>매우 전문적인 영역이라 이 설계서에서는 하지 않습니다.</b> HBTS 전문가 상담에서 확인하실 수 있습니다.</p>`;
  return t;
}

/* 입력 화면 미리보기 */
function livePreview(){
  const s={}; let ok=true;
  ORDER.forEach(c=>{ const v=parseInt($('s_'+c).value,10); if(isNaN(v)) ok=false; s[c]=v||0; });
  const box=$('preview');
  if(!ok){ box.innerHTML='<p class="hint" style="text-align:center;padding:34px 0">네 영역 점수를 입력하면 여기에 그래프가 나타납니다</p>'; return; }
  const sorted=[...ORDER].sort((a,b)=>s[b]-s[a]);
  box.innerHTML = chart(s,null,false) +
    `<p class="hint" style="text-align:center;margin-top:12px">최고 <b>${KB[sorted[0]].ko} ${s[sorted[0]]}</b> ·
     최저 <b>${KB[sorted[3]].ko} ${s[sorted[3]]}</b> · 기준선 통과 <b>${ORDER.filter(c=>s[c]>=80).length}개</b></p>`;
}

/* ================================================================
   4. AI 심화
   ================================================================ */
const AI_MODEL_DEFAULT='claude-sonnet-4-5';
let AI_MODE='deep';

/* 붙여넣기 사고 대비 — 눈에 안 보이는 문자를 전부 털어낸다.
   콘솔에서 키를 복사하면 제로폭 문자·줄바꿈·비단절 공백이 딸려오는 일이 흔하다. */
function cleanKey(k){
  return String(k||'')
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g,'')   // 제로폭 · 비단절 공백
    .replace(/\s+/g,'')                             // 줄바꿈 · 공백 전부
    .trim();
}
/* 키가 「모양이라도 맞는지」 먼저 본다. 서버에 물어보기 전에 걸러내면
   invalid x-api-key 를 보고 원인을 헤매는 시간이 사라진다. */
function keyProblem(k){
  if(!k) return '키가 비어 있습니다.';
  if(/[…·]|\.\.\./.test(k)) return '콘솔 화면에 <b>가려진 채로 표시된 키</b>를 복사하신 것 같습니다. 가운데가 「…」로 생략된 키는 쓸 수 없습니다.';
  if(!/^sk-ant-/.test(k)) return `키는 <b>sk-ant-</b> 로 시작해야 합니다. 지금 넣으신 값은 「${k.slice(0,10)}…」 로 시작합니다.`;
  if(k.length < 60) return `키가 너무 짧습니다 (${k.length}자). 정상 키는 100자 안팎입니다. <b>일부만 복사</b>되었을 가능성이 높습니다.`;
  return '';
}
function maskKey(k){ return k ? k.slice(0,14)+'…'+k.slice(-4)+` (${k.length}자)` : '없음'; }

function getKey(){ let k=''; try{k=localStorage.getItem('hbts_api_key')||''}catch(e){} return cleanKey(k||window.__hbtsKey||''); }
function setKey(k){ k=cleanKey(k); window.__hbtsKey=k; try{localStorage.setItem('hbts_api_key',k)}catch(e){} }
function clearKey(){ window.__hbtsKey=''; try{localStorage.removeItem('hbts_api_key')}catch(e){} openAI(AI_MODE||'scan'); }

function openAI(mode){
  AI_MODE=mode||'deep';
  const v=(AI_MODE==='vision'), sc=(AI_MODE==='scan');
  $('aiTitle').textContent = sc?'결과지 전체 판독' : v?'결과지에서 점수 읽기':'AI 심화 설계';
  $('aiDesc').innerHTML = sc
    ? '이 결과지는 <b>글자가 전부 이미지</b>로 되어 있습니다. (브라우저에서 인쇄→PDF로 저장하면 이렇게 됩니다.) 텍스트를 뽑을 수 없어 <b>AI가 페이지를 직접 읽어야</b> 합니다. 이름·검사일·점수·비율을 전부 읽어옵니다.'
    : v
    ? '결과지의 <b>네 영역 점수는 그래프 그림 안에 인쇄</b>되어 있어서 글자처럼 복사되지 않습니다. AI가 그 그림을 <b>눈으로 읽어</b> 숫자를 가져옵니다. 키를 한 번만 넣으면 이 컴퓨터에 저장되어 다음부터는 안 물어봅니다.'
    : '위 설계서는 규칙에 따라 조립된 기본형입니다. AI 심화를 켜면 이 학생의 <b>점수 조합·격차·정서·성장 변화</b>를 전부 읽고 이 학생 한 명만을 위한 글이 추가됩니다.';
  $('aiGo').textContent = sc?'전체 판독' : v?'점수 읽기':'설계 생성';
  $('aiMsg').textContent='';
  $('aiModal').style.display='flex';
  $('apiKey').value=getKey();
  setTimeout(()=>$('apiKey').focus(),50);
}
function closeAI(){ $('aiModal').style.display='none'; }

function buildPrompt(p){
  const s=p.scores;
  const ab = c => { const a=KB[c]; return `[${a.ko} ${c}] ${s[c]}점 (${band(s[c]).label})
· 성격: ${a.short} / ${a.tag} / ${a.nick}
· 특징: ${a.traits.join(' / ')}
· 힘내는 일: ${a.core.join(' / ')}
· 대표 분야: ${a.fields.join(', ')}
· 수업에서 강점이 드러나는 활동: ${a.activities.join(', ')}
· 역효과가 나는 방식: ${a.antiStudy.join(' / ')}`; };
  const cb = p.usePair ? COMBO[p.pairKey] : null;
  const en = ENTRY[p.top1];

  /* 캠프 모드에 따라 AI 심화의 무게중심도 옮긴다.
     진로 캠프인데 공부 계획이 절반을 차지하면 설계서 앞부분과 따로 논다. */
  const MODE = p.mode || 'both';
  const modeNote = MODE==='career'
    ? `\n\n════════ 이번 캠프 ════════\n**진로 캠프**입니다. 설계서 본문에 학습법 상세는 들어가 있지 않습니다.\n「나에게 맞는 공부 설계」는 진로 준비에 필요한 공부(관심 분야 탐색·기록·검증)를 중심으로 짧게 쓰고,\n「진로, 이렇게 좁혀 가세요」를 가장 길고 구체적으로 쓰세요.`
    : MODE==='study'
    ? `\n\n════════ 이번 캠프 ════════\n**자기주도학습 캠프**입니다. 설계서 본문에 진로·로드맵 섹션은 들어가 있지 않습니다.\n「나에게 맞는 공부 설계」를 가장 길고 구체적으로 쓰고,\n「진로, 이렇게 좁혀 가세요」는 "지금 공부가 어디로 이어지는가" 정도로 짧게 쓰세요.`
    : '';

  return `당신은 15년 경력의 진로 설계 전문가이자 학습 코치입니다.
중·고등학생 진로 캠프에서 학생 한 명에게 줄 「나만의 진로·학습 설계서」 본문을 씁니다.
아래 학생의 실제 HBTS 검사 결과를 읽고, 이 학생 한 명에게만 해당하는 글을 쓰세요.

════════ 학생 ════════
이름 ${p.name} / ${GRADE[p.grade]}
유형 규모: ${p.kind} (80점 이상: ${p.comp.length?p.comp.join(', '):'없음'})
1순위 ${p.top1} ${s[p.top1]} / 2순위 ${p.top2} ${s[p.top2]} (격차 ${p.gap12}) / 최저 ${p.low} ${s[p.low]} (최고-최저 ${p.spread})
${p.diagIsLowest?`※ 가장 높은 ${p.top1}의 대각선인 ${p.low}가 가장 낮음. 결과지는 대각선끼리 반대 성격이라 설명함.`:''}
${cb?`※ 두 강점이 겹치는 자리: ${cb.name} — ${cb.desc} (${cb.where.join(', ')})`:''}
외향:내향 ${p.ex}:${p.inv} (${EI[p.eiKey].title})
전반 감정 ${p.pos}:${p.neg} / 공부에 대한 감정 ${p.wpos}:${p.wneg}
${p.word?`주목해야 할 단어: 「${p.word}」`:''}
${p.shift?`소아청소년기→현재: ${ORDER.map(c=>`${c} ${p.child[c]}→${s[c]}`).join(', ')} (어릴 때 최고: ${p.shift.childTop})`:'소아청소년기 자료 없음'}
${(typeof PDFMETA!=='undefined'&&PDFMETA&&PDFMETA.childTraits)?`결과지에 기록된 소아청소년기 특징: ${PDFMETA.childTraits}`:''}
${(typeof PDFMETA!=='undefined'&&PDFMETA&&PDFMETA.childWord)?`어릴 때 주목해야 할 단어: 「${PDFMETA.childWord}」`:''}

════════ 네 영역 ════════
${ORDER.map(ab).join('\n\n')}

════════ 이 설계서의 학습 프레임 (반드시 지킬 것) ════════
설계서 본문은 이미 아래 구조로 되어 있습니다. 당신의 글도 같은 프레임 위에 있어야 합니다.

핵심 학습법 4가지 — 유형과 무관하게 모든 학생에게 동일하게 적용:
  01 꺼내기(인출 연습) — 책 덮고 백지에 꺼내기
  02 나눠서(분산 학습) — 며칠에 걸쳐 나눠서
  03 설명하기(자기 설명) — 「왜 그런지」를 말로
  04 섞어서(교차 연습) — 여러 단원을 섞어서 풀기 (단, 영단어·한자는 섞지 않음)

유형별로 다른 것은 「위 4가지를 어떤 형식으로 시작하느냐」뿐입니다.
이 학생(${p.top1})의 진입로: ${en.map.map(m=>`${m[0]} → ${m[1].replace(/\*\*/g,'')}`).join(' / ')}

⛔ 절대 쓰면 안 되는 문장
  · "이 유형은 그림으로 공부하면 더 잘 외운다" 같은, 유형별로 학습 효과가 다르다는 주장
  · "우뇌형이라 수학보다 예체능이 맞다" 같은, 유형으로 과목·능력을 제한하는 말
  · "뇌과학이 증명한" "과학적으로 검증된" "정확도" "예측" "판정"
  · "당신에게 맞는 진로는 ~입니다" 같은 확정
  · 타고난 두뇌 우성 단정, 두뇌 우성 변경(Falsification) 판단

════════ 반드시 지킬 것 ════════
1. 이 학생의 **실제 숫자를 근거로** 쓰세요. "${s[p.top1]}점", "격차 ${p.spread}점"처럼 인용하세요.
   **다른 학생에게 그대로 써도 말이 되는 문장은 실패입니다.**
2. 단정 금지. "당신은 ~입니다" ❌ → "~한 경향이 나타납니다 / ~편입니다" ✅
3. 진로를 확정해주지 마세요. **후보를 좁히는 방법과 검증하는 방법**을 주는 것이 목적입니다.
4. 중학생이 읽습니다. 짧은 문장, 쉬운 단어, 존댓말. 전문용어는 반드시 풀어서.
5. 추상적인 조언 금지. **"주 2회", "25분", "3개"처럼 숫자로 실행 가능하게.**
6. 강조는 **굵게** 로만. 이모지 금지.

════════ 출력 형식 ════════
아래 5개 섹션을 정확히 이 순서·제목으로. 각 제목은 "## "로 시작합니다.
인사·설명·마무리 멘트 없이 본문만 출력하세요.

## 한 문장으로 말하면
${p.name} 학생이 어떤 사람인지 한 문장. 그 아래 2~3문장으로 풀어서. 점수를 근거로.

## 내 안에서 지금 벌어지고 있는 일
강한 영역과 약한 영역이 이 학생의 하루(수업·공부·친구관계)에서 실제로 어떻게 나타나는지.
"이런 적 있지 않나요?"처럼 자기 경험과 맞춰볼 수 있게. 4~6개를 굵은 제목 + 설명으로.

## 나에게 맞는 공부 설계
위 4가지 핵심 기법을 이 학생의 점수 조합에 맞춰 **구체적인 주간 계획**으로. 시간 배분, 과목별 접근.
반드시 숫자로. 5~6개 항목.

## 진로, 이렇게 좁혀 가세요
직업 이름을 나열하지 말고 **어떤 방식으로 일할 때 이 학생이 힘이 나는지**를 먼저 정의.
그다음 그 방식이 통하는 분야를 묶어서. 마지막에 **앞으로 3개월 안에 해볼 것 3가지**를 구체적으로.

## ${({'초':'초등','중':'중학','고':'고등'})[p.grade]} 시기에 꼭 해둘 것
지금 학년에서 해야 할 것을 시기별로. 하지 말아야 할 것도 1가지. 마지막은 격려 한 문장.${modeNote}`;
}

async function runAI(){
  const key=cleanKey($('apiKey').value);
  const model=$('apiModel').value.trim()||AI_MODEL_DEFAULT;
  const bad = keyProblem(key);
  if(bad){ $('aiMsg').innerHTML = bad; return; }
  setKey(key); closeAI();
  if(AI_MODE==='scan'){ await runScan(key); return; }
  if(AI_MODE==='vision'){ await retryVision(); return; }

  const slot=$('aiSlot');
  slot.innerHTML=`<section class="sec"><div class="wrap">
    <div class="sechead"><div class="idx">★</div><div><div class="kicker">AI Analysis</div>
    <h2>AI 심화 설계</h2><p>${P.name} 학생의 결과를 읽고 설계서를 쓰는 중입니다… <span class="spin"></span></p></div></div>
  </div></section>`;
  slot.scrollIntoView({behavior:'smooth',block:'center'});

  try{
    const r=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'content-type':'application/json','x-api-key':key,
        'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model,max_tokens:4500,messages:[{role:'user',content:buildPrompt(P)}]})
    });
    const j=await r.json();
    if(!r.ok) throw new Error(j?.error?.message||('HTTP '+r.status));
    const text=(j.content||[]).map(c=>c.text||'').join('');
    slot.innerHTML=`<section class="sec dark"><div class="wrap">
      <div class="sechead"><div class="idx">★</div><div><div class="kicker">AI Analysis</div>
      <h2>${P.name} 학생 전용 설계</h2></div></div>
      ${mdBlock(text)}
      <p class="src" style="margin-top:26px">검사 결과를 바탕으로 생성된 해석입니다. 다르다고 느끼는 문장은 「직접 고치기」로 수정하세요.</p>
      <div class="btnrow noprint"><button class="btn ghost" style="color:#F4F1EA;border-color:rgba(244,241,234,.5)" onclick="openAI('deep')">다시 생성</button></div>
    </div></section>`;
  }catch(e){
    slot.innerHTML=`<section class="sec alt"><div class="wrap">
      <div class="sechead"><div class="idx">!</div><div><div class="kicker">Error</div>
      <h2>AI 심화 설계 실패</h2><p>${String(e.message||e)}</p></div></div>
      <p class="src">키가 맞는지, 크레딧이 남아 있는지, 모델 이름이 유효한지 확인해 주세요.
      기본 설계서는 위에 그대로 있으니 그것만으로도 사용 가능합니다.</p>
      <div class="btnrow noprint"><button class="btn ghost" onclick="openAI('deep')">다시 시도</button></div>
    </div></section>`;
  }
}

function mdBlock(t){
  const lines=String(t).split('\n'), out=[]; let ul=false;
  const close=()=>{ if(ul){out.push('</ul>');ul=false;} };
  for(const raw of lines){
    const l=raw.trim();
    if(!l){ close(); continue; }
    if(l.startsWith('## ')){ close(); out.push(`<h3 class="blk">${md(l.slice(3))}</h3>`); continue; }
    if(l.startsWith('### ')){ close(); out.push(`<h4 class="mini">${md(l.slice(4))}</h4>`); continue; }
    if(/^[-*·]\s+/.test(l)){ if(!ul){out.push('<ul class="pl">');ul=true;} out.push(`<li>${md(l.replace(/^[-*·]\s+/,''))}</li>`); continue; }
    if(/^\d+\.\s+/.test(l)){ if(!ul){out.push('<ul class="pl">');ul=true;} out.push(`<li>${md(l.replace(/^\d+\.\s+/,''))}</li>`); continue; }
    close(); out.push(`<p>${md(l)}</p>`);
  }
  close(); return out.join('');
}

livePreview();

/* ------------------------------------------------------------------
   강사용 도구 토글
   ------------------------------------------------------------------
   학생이 직접 쓰는 화면이므로 「예시 값 넣기」·「API 키 설정」은 기본으로 숨긴다.
   강사가 자기 기기에서 한 번 켜두면 그 브라우저는 계속 켜진 상태를 기억한다.
   주소 뒤에 #teacher 를 붙여도 켜진다.
------------------------------------------------------------------ */
function setAdmin(on){
  document.body.classList.toggle('admin', !!on);
  const a = document.getElementById('teachToggle');
  if(a) a.textContent = on ? '강사용 도구 숨기기' : '강사용 도구';
  try{ localStorage.setItem('hbts_admin', on?'1':'') }catch(e){}
}
function toggleAdmin(){ setAdmin(!document.body.classList.contains('admin')); }
(function(){
  let on=false;
  try{ on = localStorage.getItem('hbts_admin')==='1' }catch(e){}
  if(location.hash === '#teacher') on = true;
  setAdmin(on);
})();
