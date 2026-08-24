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
    six: !!($('six')&&$('six').checked),
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

  /* ⚠️ 2026-08-24 — 점수가 틀리면 설계서 전체가 틀린다.
     실제로 LPB 34 를 84 로 오판독한 설계서가 그대로 나갔다.
     기하 검산이 불일치를 잡았는데도 그냥 눌러서 넘어갈 수 있었던 것이 원인이다.
     이제는 한 번 막고, 사용자가 「그래도 진행」을 명시적으로 눌러야 넘어간다. */
  if(typeof GEO!=='undefined' && GEO && !GEO.ok && !window.__geoAck){
    const bad = ['LAB','RAB','LPB','RPB'].filter(a=>GEO.per[a].off>0.15);
    const lines = bad.map(a=>`  · ${KB[a].ko} — 넣은 값 ${GEO.per[a].given}점 / 그림이 말하는 값 ${GEO.per[a].est}점`).join('\n');
    const go = confirm(
      `잠깐만요. 점수가 결과지 그래프와 맞지 않습니다.\n\n${lines}\n\n`+
      `점수가 틀리면 설계서 전체가 틀립니다.\n`+
      `위로 올라가서 「그림이 말하는 값으로 전부 고치기」를 누르시거나,\n`+
      `결과지 원본과 대조해 직접 고쳐 주세요.\n\n`+
      `[취소] 올라가서 고치기 (권장)\n[확인] 이 값이 맞으니 그대로 진행`);
    if(!go){
      const sc=document.getElementById('scoreCard');
      if(sc) sc.scrollIntoView({behavior:'smooth',block:'start'});
      return;
    }
    window.__geoAck = true;   /* 사용자가 확인했다. 다시 묻지 않는다 */
  }

  P=p;
  $('report').innerHTML=renderReport(p);
  $('input').style.display='none';
  $('result').style.display='block';
  window.scrollTo(0,0);
  bumpStat(p.mode);          /* 사용 실적 — 개인정보 없이 건수만 */

  /* 진로 캠프는 심화 설계서가 그날의 산출물이다 (2026-08-24 J님 확정).
     버튼을 눌러야만 나오면 30명 중 몇 명은 빈손으로 나간다. 그래서 자동으로 돌린다.
     study·both 는 학습 파트가 본체이므로 기존대로 버튼을 눌러야 나온다. */
  if(p.mode==='career') setTimeout(startDeep, 300);
}
function backToInput(){ $('result').style.display='none'; $('input').style.display='block'; window.scrollTo(0,0); }

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
  /* career 는 03(4기법 상세)·05(시험 2주 계획)를 뺀다.
     다만 04 는 「간략판」으로 살린다 — 진로 캠프에서도 학습법을 숙지하기 때문. */
  const SKIP = MODE==='career' ? ['03','05']
             : MODE==='study'  ? ['06','07'] : [];
  const BRIEF = (MODE==='career');   /* 학습 파트를 짧게 */
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

  /* ── 진행 안내 — 4차시에 학생이 화면에서 길을 잃지 않게 ──
     이 설계서는 수업을 다 듣고 난 뒤에 여는 도구다.
     22장을 처음부터 읽는 게 아니라 「지금 할 것」만 짚어준다. */
  /* 캠프마다 오늘의 목적지가 다르다. 진로 캠프에서 「내 학습법을 본다」가 뜨면 안 된다. */
  const GS2 = MODE==='career'
    ? { href:'#gs2', b:'내 진로를 좁힌다', s:'후보 넓히기 → 3개로 → 확인하기' }
    : { href:'#gs2', b:'내 학습법을 본다', s:'1·2순위 조합에 맞춘 실행 방법' };
  H.push(`<section class="sec guide noprint"><div class="wrap">
    <div class="gh">오늘 이 순서로 보세요</div>
    <p class="gl">이 설계서는 <b>수업에서 들은 내용을 내 점수로 다시 보는</b> 자료입니다.
       처음부터 다 읽지 마세요. <b>초록 카드만 따라가면</b> 됩니다.</p>
    <div class="gsteps">
      <a href="#gs1"><i>①</i><b>나를 확인한다</b><span>내 점수가 무엇을 말하는지</span></a>
      <a href="${GS2.href}"><i>②</i><b>${GS2.b}</b><span>${GS2.s}</span></a>
    </div>
    <p class="gn">각 카드 아래 <b>「이것만」</b> 줄이 그 카드의 요약입니다. 시간이 없으면 그 줄만 읽으세요.
       읽고 나면 <b>활동지에 내 것으로 옮겨 적습니다.</b></p>
  </div></section>`);

  if(on('01')) H.push(`<a id="gs1"></a>`+sec(num(),'Profile','두뇌 프로파일','',pf));

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

  if(MODE==='study'){
    who += `<h3 class="blk">참고 — 이 유형이 강한 분야</h3>
      <p class="hint" style="margin:-6px 0 14px">이번 캠프는 <b>공부하는 방법</b>이 주제라 진로는 깊게 다루지 않습니다.
         아래는 <b>참고용</b>이고, 여기 없는 일을 해도 전혀 문제없습니다.</p>
      <table class="t"><tbody>${CAREER_MAP[p.top1].map(([k,v])=>
        `<tr><td class="k">${k}</td><td>${v}</td></tr>`).join('')}</tbody></table>`;
  }
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
        ${c.warn?`<div class="warnbox">${md(c.warn)}</div>`:''}
        ${c.worry?`<p style="margin-top:14px;font-size:14.5px;opacity:.85">${md(c.worry)}</p>`:''}
        <div class="only" style="margin:18px -24px -22px -84px;padding-left:84px">
          <i>이것만</i><span>${md(c.tip)}</span></div>
      </div></div>`;
    return t;
  }).join('');

  if(on('03')) H.push(sec(num(),'Learning Science','공부는 이 네 가지로 갑니다',
    '이 네 가지는 수백 편의 연구로 검증된 것이고, **유형과 상관없이 모든 학생에게 똑같이 효과가 있습니다.** 여기부터가 실제로 성적을 움직이는 부분입니다.',
    methodCards() + core, 'dark'));

  /* ---------- 04 나의 진입로 ----------
     ⚠️ 읽기 구조 원칙 (2026-08-24 J님 지시)
     학생은 글 덩어리를 안 읽는다. 모든 학습 내용은 반드시 lcard() 프레임 안에 넣는다.
     카드 헤더 = 번호 + 제목 + 한 줄 요약. 스캔만 해도 뭔지 알아야 한다.
     카드 끝 = 「이것만」 바. 한 줄만 가져가도 손해가 없게 한다.
     career 모드에서는 이 섹션이 맨 뒤로 밀리고 분량이 반으로 준다. */
  const en = ENTRY[p.top1];
  const fl = FLOW[p.top1];
  const ei = EI[p.eiKey];
  const csk = comboStudyKey(p);
  let LN = 0;
  const card = (title, sub, body, only) => {
    LN++;
    return `<div class="lc"><div class="lch"><div class="n">${String(LN).padStart(2,'0')}</div><div>
        <h3>${title}</h3>${sub?`<span class="sub">${md(sub)}</span>`:''}</div></div>
      <div class="lcb">${body}${only?`<div class="only"><i>이것만</i><span>${md(only)}</span></div>`:''}</div></div>`;
  };
  const rankBadge = () =>
    `<div class="rank">
       <div><i>1순위</i><b>${KB[p.top1].nick}</b><u>${s[p.top1]}</u></div>
       <div><i>2순위</i><b>${KB[p.top2].nick}</b><u>${s[p.top2]}</u></div>
     </div>`;

  let entry = '';

  /* ── 카드 1 · 네 가지 기본 (career 는 강사 PPT 대신 여기서 한 번에) ── */
  if(BRIEF){
    entry += card('모두에게 통하는 네 가지',
      '유형과 상관없이 효과가 확인된 기본입니다. 이 넷을 알고, 그다음 내 형식으로 바꾸면 됩니다.',
      `<table class="t"><tbody>${CORE.map(c=>
        `<tr><td class="k">${c.n} ${c.name}</td><td>${md(c.oneLine)}</td></tr>`).join('')}</tbody></table>`,
      '네 가지는 누구에게나 같습니다. **달라지는 건 방법이 아니라 형식뿐입니다.**');
  }

  /* ── 카드 2 · 내 진입로 ── */
  entry += card(`${KB[p.top1].nick} — 나는 이렇게 시작합니다`,
    '첫날에 포기하지 않을 모습으로 바꾼 것입니다. 내용이 아니라 **입구**를 바꿉니다.',
    `<div class="entry">${en.map.map(([k,v])=>
      `<div class="er"><b>${k}</b><span>${md(v)}</span></div>`).join('')}</div>`,
    '똑같은 방법도 **내 형식으로 들어가야** 손이 움직입니다.');

  /* ── 카드 3 · 하루 흐름 (study·both 만) ── */
  if(!BRIEF){
    entry += card(fl.day.title,
      '네 가지 기법이 이 흐름 안에 전부 들어 있습니다. 달라지는 것은 순서와 형식뿐입니다.',
      `<table class="t"><tbody>${fl.day.rows.map(r=>
         `<tr><td class="k">${r[0]}</td><td>${md(r[1])}</td></tr>`).join('')}</tbody></table>
       <h3 class="blk">${fl.week.title}</h3>
       <table class="t"><tbody>${fl.week.rows.map(r=>
         `<tr><td class="k">${r[0]}</td><td>${md(r[1])}</td></tr>`).join('')}</tbody></table>`,
      fl.key.replace(/^이 학생에게 가장 중요한 한 줄 — /,''));
  }

  /* ── 카드 4 · 1·2순위 조합 — 학습 파트의 핵심 ──
     유형별 4종 표는 강사 PPT 와 활동지가 맡는다.
     이 종이에는 「이 학생의 두 우성이 함께 작동하는 방식」만 담는다. */
  if(csk){
    const cs = COMBO_STUDY[csk];
    entry += card(`내 우성 두뇌 두 개 — ${cs.name}`,
      '이 결과지에서 **가장 중요한 카드**입니다. 두 강점이 함께 굴러가는 방식입니다.',
      `${rankBadge()}<p>${md(cs.line)}</p>
       <ol class="step">${cs.how.map(t=>`<li>${md(t)}</li>`).join('')}</ol>
       <div class="warnbox">${md(cs.warn)}</div>`,
      cs.line.replace(/\*\*/g,'').replace(/입니다\.$/,'') + ' — 이 조합으로 갑니다.');
  }

  /* ── 카드 5 · 혼자 / 함께 ── */
  entry += card(`혼자 vs 함께 — ${ei.title}`,
    `외향성 ${p.ex} : 내향성 ${p.inv}. 어디서 공부하느냐가 방법만큼 중요합니다.`,
    `<p>${md(ei.body)}</p><div class="pull">${md(ei.todo)}</div>`,
    ei.todo.replace(/\*\*/g,''));

  /* ── 카드 6·7 · study·both 전용 ── */
  if(!BRIEF){
    entry += card(AB_TEST.title,
      '위 진입로는 제안이지 정답이 아닙니다. 진짜 답은 2주만 재보면 나옵니다.',
      `<ol class="step">${AB_TEST.steps.map(x=>`<li><b>${x.n}</b> — ${md(x.d)}</li>`).join('')}</ol>
       <div class="callout"><h5>왜 느낌이 아니라 숫자인가</h5>
         <p style="margin-bottom:0">${md(AB_TEST.note)}</p></div>`,
      '**느낌이 아니라 점수로** 정하세요. 공부 직후의 느낌은 자주 거짓말을 합니다.');

    entry += card(DAILY.title,
      '더 오래 앉아 있는 게 답이 아닙니다. 근거가 있는 상한선이 있습니다.',
      `<table class="t"><tbody>${DAILY.rows.map(r=>
         `<tr><td class="k">${r[0]}</td><td class="v">${r[1]}</td></tr>`).join('')}</tbody></table>
       <p>${md(DAILY.note)}</p><p class="src">${DAILY.src}</p>`,
      '**3시간 넘게 앉아 있는 계획표는 근거가 없습니다.**');
  }

  /* career 는 이 섹션을 08 뒤로 민다 — 진로가 메인이므로 학습법이 앞에 오면 안 된다.
     num() 은 호출 시점에 번호를 매기므로 push 순서만 바꾸면 번호는 자동으로 맞는다. */
  const studySec = () => `<a id="gsStudy"></a>` + sec(num(),'Study',
    BRIEF ? '나에게 맞는 공부법' : `${en.label}`,
    BRIEF ? '진로 캠프에서는 **간략판**입니다. 자세한 학습 설계는 자기주도학습 캠프에서 다룹니다.'
          : '위 네 가지를 **어떤 모습으로 시작하면 이 학생이 첫 주에 포기하지 않을지**에 대한 제안입니다.',
    entry);

  if(on('04') && !BRIEF) H.push(`<a id="gs2"></a>`+studySec());

  /* ---------- 05 시험 계획 ---------- */
  let exam = `<p>${md(EXAM_PLAN.lead)}</p>
    <table class="t"><tbody>${EXAM_PLAN.rows.map(r=>
      `<tr><td class="k">${r[0]}</td><td>${md(r[1])}</td></tr>`).join('')}</tbody></table>`;

  /* ★ 시작 강도 — 공부에 대한 감정으로 나눈다.
     긍정이 0인 학생에게 표준 계획표를 그대로 주면 첫 주에 덮는다. */
  const pk = paceKey(p);
  if(pk){
    const pc = PACE[pk];
    exam += `<h3 class="blk">${pc.title}</h3>
      <p>${md(pc.body)}</p>
      <table class="t"><tbody>${pc.plan.map(r=>
        `<tr><td class="k">${r[0]}</td><td>${md(r[1])}</td></tr>`).join('')}</tbody></table>
      <div class="${pk==='hard'?'warnbox':'pull'}" style="margin-top:16px">${md(pc.tip)}</div>`;
  }

  /* 혼자 / 함께 — 외향:내향 */
  const so = SOLO[p.eiKey] || SOLO.balanced;
  exam += `<h3 class="blk">${so.title}</h3><p>${md(so.body)}</p>`;

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
  /* ⚠️ 진로 섹션도 전부 카드 프레임. 표만 늘어놓으면 학생이 안 읽는다. */
  let CN = 0;
  const ccard = (title, sub, body, only) => {
    CN++;
    return `<div class="lc"><div class="lch"><div class="n">${String(CN).padStart(2,'0')}</div><div>
        <h3>${title}</h3>${sub?`<span class="sub">${md(sub)}</span>`:''}</div></div>
      <div class="lcb">${body}${only?`<div class="only"><i>이것만</i><span>${md(only)}</span></div>`:''}</div></div>`;
  };

  let car = `<p>여기서 <b>방향을 세 개로 좁혀 드립니다.</b> 직업 이름이 아니라 <b>「어떤 자리에서 일할 때 힘이 나는가」</b>입니다.
    <b>다음 시간에 이 셋 중 하나를 골라</b> 로드맵을 그리게 됩니다.</p>`;

  /* ── 카드 · 내 진로 방향 3순위 ──────────────────────────────────
     ⚠️ 여기가 이 결과지의 핵심이다 (2026-08-24 J님 지시).
     「탐색 지도」로 두면 4차시에 30명이 다 헤맨다. 방향을 못 박아 준다.
     ⚠️ 순위는 외향/내향으로 조정한다 — 사람을 많이 만나는 방향은 성향을 탄다. */
  const DR = DIRECTION[p.pairKey];
  if(DR){
    /* 순위는 외향/내향으로만 조정한다.
       ⚠️ 이름에서 키워드를 추측하지 말 것 — 「조직을 굴리는 자리」의 '조직'이 사람으로 오탐됐다.
       people(0~2) 과 alsoNeeds 는 데이터에 명시되어 있다. */
    /* 순서 규칙 — 최저 영역을 요구하는 방향은 뒤로 민다.
       그 뒤에 외향/내향으로 조정한다. 「조심하라」고 써놓고 1순위에 두면 앞뒤가 안 맞는다. */
    const isRisky = d => (d.alsoNeeds||[]).includes(p.low) && s[p.low] < 70;
    let dirs = DR.dirs.slice().sort((a,b)=>{
      const r = (isRisky(a)?1:0) - (isRisky(b)?1:0);
      if(r) return r;
      if(p.eiKey==='extra') return b.people - a.people;
      if(p.eiKey==='intro') return a.people - b.people;
      return 0;
    });
    const ord = ['1순위','2순위','3순위'];

    car += `<h3 class="blk">내 방향 세 개 — ${DR.type}</h3>
      <p>1순위 <b>${A.ko} ${s[p.top1]}점</b> · 2순위 <b>${B.ko} ${s[p.top2]}점</b> 조합에서 나온 것입니다.
         <b>순서는 참고일 뿐,</b> 3순위를 골라도 전혀 이상하지 않습니다.</p>`;

    dirs.forEach((d,i)=>{
      const risky = isRisky(d);
      car += ccard(`${ord[i]} — ${d.name}`,
        d.why,
        `<h4 class="mini">이런 자리들입니다</h4>
         <div class="tags">${d.jobs.map(j=>`<span>${j}</span>`).join('')}</div>
         <div class="callout" style="margin-top:16px"><h5>이 방향이 맞는 신호</h5>
           <p style="margin-bottom:0">${md(d.signal)}</p></div>
         ${risky?`<div class="warnbox">${md(DIR_CAUTION[p.low])}</div>`:''}
         <h4 class="mini">다음 시간에 AI에게 이렇게 물으세요</h4>
         <div class="promptbox"><pre>${esc(d.ask)}</pre></div>`,
        `**${d.jobs.slice(0,3).join(' · ')}** — 다음 시간에 이 셋부터 찾아보세요.`);
    });

    car += `<div class="pull">셋 다 안 끌린다면 그것도 답입니다. <b>「셋 다 아니다」를 알아낸 것</b>도 오늘의 성과입니다 —
      다음 시간에 AI에게 <b>「이 셋 말고 다른 방향」</b>을 물으면 됩니다.</div>`;
  }

  /* ── 카드 · 어떤 분야에서 ── */
  {
    let fields = `<h4 class="mini">${A.ko}(${p.top1}) ${s[p.top1]}점 기준</h4>
      <div class="tags">${A.fields.map(f=>`<span>${f}</span>`).join('')}</div>`;
    if(p.usePair){
      fields += `<h4 class="mini">${B.ko}(${p.top2}) ${s[p.top2]}점 기준</h4>
        <div class="tags">${B.fields.map(f=>`<span>${f}</span>`).join('')}</div>`;
      const cb=COMBO[p.pairKey];
      if(cb) fields += `<div class="callout"><h5>두 개가 겹치는 자리 — ${cb.name}</h5>
        <p>${md(cb.desc)}</p>
        <div class="tags yes" style="margin-top:12px">${cb.where.map(w=>`<span>${w}</span>`).join('')}</div></div>`;
    }
    car += ccard('어떤 분야에서 힘이 나는가',
      '내 점수가 가리키는 **탐색 시작점**입니다. 정답 목록이 아닙니다.',
      fields,
      p.usePair && COMBO[p.pairKey]
        ? `두 강점이 **겹치는 자리(${COMBO[p.pairKey].name})**부터 보세요. 거기가 경쟁이 가장 덜합니다.`
        : '여기 없는 분야가 답일 수도 있습니다. **시작점일 뿐입니다.**');
  }

  /* ── 카드 · 어떤 방식으로 ── */
  {
    const cm = CAREER_MAP[p.top1];
    let ways = `<p style="margin:0 0 14px">직업 이름이 아니라 <b>「어떤 방식으로 일하는가」</b>로 묶었습니다.
        ${WORK_STYLE[p.top1]}입니다.</p>
      <table class="t"><tbody>${cm.map(r=>
        `<tr><td class="k" style="width:190px">${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</tbody></table>`;
    if(p.usePair && CAREER_MAP[p.top2]){
      ways += `<h3 class="blk">${B.ko} 쪽에서 열리는 자리</h3>
        <table class="t"><tbody>${CAREER_MAP[p.top2].map(r=>
          `<tr><td class="k" style="width:190px">${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</tbody></table>`;
    }
    ways += `<p class="src">HBTS 결과지의 직업 분류를 참고하되, 학생이 읽기 쉽도록 뿌리깊이가 다시 묶은 것입니다.</p>`;
    car += ccard('어떤 방식으로 일할 때 힘이 나는가',
      '직업 이름보다 **이쪽이 훨씬 중요합니다.** 같은 직업도 방식이 다르면 결과가 다릅니다.',
      ways,
      '직업 이름을 고르지 말고 **일하는 방식**을 고르세요. 이름은 바뀌어도 방식은 남습니다.');
  }

  /* ── 진로 보강 (2026-08-24) — 카드 프레임으로 분리한다.
     ① 못 견디는 환경  ② 좁히기 3단계 + 검증법  ③ 고교 과목 선택
     진로 캠프가 메인일 때(career·both) 학생이 「그래서 뭘 하지」에 답을 갖고 나가야 한다. */
  /* ① 못 견디는 환경 — 최저 영역 기반. 진로 선택에서 이게 더 결정적이다. */
  const cst = CANT_STAND[p.low];
  if(cst){
    car += `<h3 class="blk">방향을 고르기 전에 — 피해야 할 것부터</h3>
      <p>진로에서 <b>「하고 싶은 것」보다 「오래 못 버티는 것」이 더 결정적</b>입니다.
         좋아하는 일도 못 버티는 환경에 놓이면 3년을 못 갑니다.</p>` +
      ccard(`${KB[p.low].nick} ${s[p.low]}점 — ${cst.head}`,
        '네 영역 중 가장 낮은 곳입니다. 여기서 나오는 신호를 미리 알아두세요.',
        `<p>${md(cst.lead)}</p>
         <h4 class="mini">이런 자리가 그렇습니다</h4>
         <ul class="pl">${cst.signs.map(t=>`<li>${md(t)}</li>`).join('')}</ul>
         <div class="callout"><h5>그래서 이렇게 고릅니다</h5>
           <p style="margin-bottom:0">${md(cst.how)}</p></div>`,
        '**못 한다는 뜻이 아닙니다.** 이 일이 **전부**인 자리를 피하라는 뜻입니다.');
  }

  /* ② 좁히기 3단계 + 검증법 */
  const NW = NARROW;
  car += `<h3 class="blk">${NW.head}</h3>` +
    ccard('넓히고 → 줄이고 → 확인한다',
      NW.lead,
      `<ol class="step">${NW.steps.map(x=>
         `<li><b>${x.n}</b> — ${md(x.d)}<br>
            <span style="display:inline-block;margin-top:7px;font-size:14px;
              background:rgba(46,125,91,.1);border:1px solid #B4CBB9;padding:5px 12px;border-radius:2px">
              이번 달에 할 것 · ${md(x.do)}</span></li>`).join('')}</ol>`,
      '**3단계를 안 하면 아무것도 정해지지 않습니다.** 머리로 고른 것은 반이 틀립니다.') +
    ccard(NW.verify.head,
      NW.verify.lead,
      `<table class="t"><tbody>${NW.verify.rows.map(r=>
         `<tr><td class="k" style="width:130px">${r[0]}</td><td>${md(r[1])}</td></tr>`).join('')}</tbody></table>
       <div class="warnbox">${md(NW.verify.warn)}</div>`,
      '**그 일의 가장 지루한 부분을 견딜 수 있는지**가 진짜 기준입니다.');

  /* ③ 고교 과목 선택 — 초등은 너무 이르므로 중·고만 */
  if(p.grade !== '초'){
    const SP = SUBJECT_PICK, bt = SP.bytype[p.top1];
    car += `<h3 class="blk">${SP.head}</h3>` +
      ccard('고르는 기준 세 가지',
        SP.lead,
        `<table class="t"><tbody>${SP.rules.map(r=>
           `<tr><td class="k" style="width:210px">${r[0]}</td><td>${md(r[1])}</td></tr>`).join('')}</tbody></table>
         <div class="pull">${md(SP.note)}</div>`,
        '진로가 안 정해졌다면 **후보 3개가 공통으로 요구하는 과목**부터 고르세요.') +
      ccard(`${KB[p.top1].nick} — 과목에서는 이렇게 나타납니다`,
        '1순위 영역이 과목 선택에서 어떻게 작동하는지입니다.',
        `<div class="entry">
           <div class="er"><b>힘이 나는 곳</b><span>${md(bt.fit)}</span></div>
           <div class="er"><b>우선 고를 것</b><span>${md(bt.pick)}</span></div>
           <div class="er"><b>조심할 것</b><span>${md(bt.care)}</span></div>
         </div>
         <div class="warnbox">${md(SP.warn)}</div>`,
        bt.pick.replace(/\*\*/g,''));
  }

  /* ④ 4차시에 그릴 로드맵 뼈대 — 틀이 없으면 「그려보세요」에 아무도 못 그린다 */
  if(MODE!=='study'){
    const RD = ROADMAP_DRAW;
    car += `<h3 class="blk">${RD.head}</h3>` +
      ccard('다섯 칸을 채우면 로드맵이 됩니다',
        RD.lead,
        `<table class="t"><tbody>${RD.rows.map(r=>
           `<tr><td class="k" style="width:150px">${r[0]}</td><td>${md(r[1])}</td></tr>`).join('')}</tbody></table>
         <div class="pull">${md(RD.note)}</div>
         <div class="warnbox">${md(RD.warn)}</div>`,
        '**「지금 이번 학기」 칸부터** 채우세요. 거기가 실제로 움직이는 칸입니다.');
  }

  if(on('06')) H.push((MODE==='career'?`<a id="gs2"></a>`:'')+sec(num(),'Career','진로 방향','', car));

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

  /* career 는 여기서 학습법 — 진로가 메인이므로 뒤로 밀었다 (2026-08-24 J님 지시) */
  if(on('04') && BRIEF) H.push(studySec());

  /* ---------- AI 와 더 대화 (진로 캠프 전용) ----------
     흐름 (2026-08-24 J님 확정):
       설계서 생성 → AI 심화 설계 자동 생성 → 「AI에 올릴 PDF」로 저장 → ChatGPT 에 올려 대화
     ⚠️ 이름이 박힌 PDF 를 올리게 두면 안 된다. 반드시 printAnon() 쪽으로 안내한다. */
  if(MODE==='career'){
    const A2=AI_DEEP;
    let AN = 0;
    const acard = (title, sub, body, only) => {
      AN++;
      return `<div class="lc"><div class="lch"><div class="n">${String(AN).padStart(2,'0')}</div><div>
          <h3>${title}</h3>${sub?`<span class="sub">${md(sub)}</span>`:''}</div></div>
        <div class="lcb">${body}${only?`<div class="only"><i>이것만</i><span>${md(only)}</span></div>`:''}</div></div>`;
    };

    let ai = `<p>${md(A2.lead)}</p><div class="warnbox">${md(A2.privacy)}</div>`;

    ai += acard(A2.how.head,
      '세 단계면 됩니다. 프롬프트를 길게 쓸 필요 없습니다 — **PDF가 내 정보를 전부 담고 있습니다.**',
      `<ol class="step">${A2.how.steps.map(x=>
         `<li><b>${x.n}</b> — ${md(x.d)}</li>`).join('')}</ol>
       <h4 class="mini">PDF를 올린 뒤 보낼 첫 문장</h4>
       <div class="promptbox"><pre id="aiPrompt">${esc(A2.how.first)}</pre></div>
       <div class="btnrow noprint" style="margin:12px 0 0">
         <button class="btn sm" onclick="copyAiPrompt()">${A2.copy}</button>
         <span id="cpMsg" class="hint" style="margin-left:8px"></span>
       </div>`,
      '저장한 **PDF를 그대로 올리면** 됩니다. 긴 프롬프트를 쓸 필요 없어요.');

    ai += acard(A2.checkTitle,
      A2.checkLead,
      `<table class="t"><tbody>${A2.checks.map(r=>
         `<tr><td class="k" style="width:110px">${r[0]}</td><td>${md(r[1])}</td></tr>`).join('')}</tbody></table>
       <div class="callout"><h5>⑤번이 오늘의 핵심입니다</h5>
         <p style="margin-bottom:0">${md(A2.roadmapNote)}</p></div>
       <div class="warnbox">${md(A2.warn)}</div>`,
      '**⑤번에서 받은 표를 활동지에 옮겨 그리는 것**이 오늘의 결과물입니다.');

    ai += acard(A2.blocked.head,
      A2.blocked.lead,
      `<table class="t"><tbody>${A2.blocked.rows.map(r=>
         `<tr><td class="k" style="width:120px">${r[0]}</td><td>${md(r[1])}</td></tr>`).join('')}</tbody></table>`,
      'AI가 안 돼도 **심화 설계서는 이미 손에 있습니다.** 오늘 것은 이미 챙겼습니다.');

    ai += `<div class="callout" style="margin-top:22px"><h5>오늘 손에 남는 것</h5>
      <p style="margin-bottom:0">대화하며 알게 된 것은 <b>활동지 3장 「나의 진로 로드맵」</b>에 적습니다.
        오늘의 산출물은 화면이 아니라 <b>손에 남는 종이</b>입니다.</p></div>`;

    H.push(sec(num(),'Go Deeper', A2.title, '', ai, 'alt'));
  }

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
  /* 교사·학부모용 페이지는 학생 설계서에 붙지 않는다.
     학급 자료는 관리자 페이지에서 따로 다룬다. */
  if(false)
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
/* ------------------------------------------------------------------
   AI 호출 창구 — 여기 한 곳만 거친다
   ------------------------------------------------------------------
   학생은 키가 없습니다. 그래서 기본은 「우리 서버(프록시)」로 보냅니다.
   키는 서버에만 있고 브라우저로는 내려오지 않습니다.

   강사가 자기 키를 넣어둔 경우에는 그 키로 직접 보냅니다.
   (프록시 하루 한도와 무관하게 쓰고 싶을 때)
------------------------------------------------------------------ */
const AI_PROXY_URL = 'https://cqzqtjpukvalhwsqjpcg.supabase.co/functions/v1/ai';
const AI_PROXY_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxenF0anB1a3ZhbGh3c3FqcGNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzOTg1NzQsImV4cCI6MjA5MDk3NDU3NH0.VFxV-j8GYt-vmf7gkBO0l6y0H1dtpIKtSN3r5YsobP0';

async function aiFetch(body){
  const key = getKey();
  if(key){
    /* 강사가 넣어둔 개인 키로 직접 */
    return fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'content-type':'application/json','x-api-key':key,
        'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body: JSON.stringify(body)
    });
  }
  /* 기본 — 키 없이 우리 서버를 거친다 */
  return fetch(AI_PROXY_URL,{
    method:'POST',
    headers:{'content-type':'application/json',
      'apikey': AI_PROXY_ANON,
      'Authorization': 'Bearer '+AI_PROXY_ANON},
    body: JSON.stringify(body)
  });
}

function clearKey(){ window.__hbtsKey=''; try{localStorage.removeItem('hbts_api_key')}catch(e){} }

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

/* 모달에서 「저장」을 눌렀을 때 — 강사가 개인 키를 넣는 경로 */
async function runAI(){
  const key=cleanKey($('apiKey').value);
  const bad = keyProblem(key);
  if(bad){ $('aiMsg').innerHTML = bad; return; }
  setKey(key); closeAI();
  if(AI_MODE==='scan'){ await runScan(); return; }
  if(AI_MODE==='vision'){ await retryVision(); return; }
  await startDeep();
}

/* ★ 학생이 누르는 「AI 심화 설계 추가」 — 키를 묻지 않는다 */
async function startDeep(){
  const model=($('apiModel')&&$('apiModel').value.trim())||AI_MODEL_DEFAULT;
  const slot=$('aiSlot');
  slot.innerHTML=`<section class="sec"><div class="wrap">
    <div class="sechead"><div class="idx">★</div><div><div class="kicker">AI Analysis</div>
    <h2>AI 심화 설계</h2><p>${P.name} 학생의 결과를 읽고 <b>이 학생만을 위한 설계서</b>를 쓰는 중입니다.
      20~30초 걸립니다. <b>이 페이지를 닫지 마세요.</b> <span class="spin"></span></p></div></div>
  </div></section>`;
  slot.scrollIntoView({behavior:'smooth',block:'center'});

  try{
    const r=await aiFetch({model,max_tokens:4000,messages:[{role:'user',content:buildPrompt(P)}]});
    const j=await r.json();
    if(!r.ok) throw new Error(j?.error?.message||('HTTP '+r.status));
    const text=(j.content||[]).map(c=>c.text||'').join('');
    slot.innerHTML=`<section class="sec dark"><div class="wrap">
      <div class="sechead"><div class="idx">★</div><div><div class="kicker">AI Analysis</div>
      <h2>${P.name} 학생 전용 설계</h2></div></div>
      ${mdBlock(text)}
      <p class="src" style="margin-top:26px">검사 결과를 바탕으로 생성된 해석입니다.
        <b>다르다고 느끼는 문장이 있으면 그것도 발견입니다</b> — 활동지에 「나는 이 부분이 다르다」로 적으세요.</p>
      <div class="btnrow noprint"><button class="btn ghost" style="color:#F4F1EA;border-color:rgba(244,241,234,.5)" onclick="startDeep()">다시 생성</button></div>
    </div></section>`;
  }catch(e){
    slot.innerHTML=`<section class="sec alt"><div class="wrap">
      <div class="sechead"><div class="idx">!</div><div><div class="kicker">Error</div>
      <h2>AI 심화 설계를 못 만들었습니다</h2><p>${String(e.message||e)}</p></div></div>
      <p><b>위의 설계서는 그대로 살아 있습니다.</b> 심화 설계는 거기에 덧붙이는 것이라, 없어도 오늘 수업은 진행됩니다.</p>
      <p class="src">아래 「다시 시도」를 한 번 눌러보시고, 그래도 안 되면 <b>강사님께 알려주세요.</b>
        여러 명이 동시에 누르면 순서를 기다려야 할 수 있습니다.</p>
      <div class="btnrow noprint"><button class="btn ghost" onclick="startDeep()">다시 시도</button></div>
    </div></section>`;
  }
}

/* ── AI 에 올릴 PDF — 이름을 지운다 ──────────────────────────────
   학생 30명이 자기 이름이 박힌 PDF 를 ChatGPT 에 올리면 학교가 문제 삼는다.
   점수·해석은 그대로 두고 이름만 「학생」으로 바꿔서 인쇄한다.
   인쇄가 끝나면 원래 DOM 으로 되돌린다. */
function printAnon(){
  const rep = $('report'), slot = $('aiSlot');
  const keepR = rep.innerHTML, keepS = slot ? slot.innerHTML : '';
  const nm = (P && P.name) ? String(P.name).trim() : '';
  const swap = h => (!nm || nm==='학생') ? h
    : h.split(nm).join('학생');
  try{
    rep.innerHTML = swap(keepR);
    if(slot) slot.innerHTML = swap(keepS);
    window.print();
  } finally {
    setTimeout(()=>{ rep.innerHTML = keepR; if(slot) slot.innerHTML = keepS; }, 600);
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

/* 강사용 우회 통로는 두지 않는다.
   코드 게이트가 생긴 뒤로는 그 자체가 구멍이 된다.
   관리 기능은 전부 관리자 페이지(admin.html)에서 다룬다. */

/* ==================================================================
   학생이 AI 에 붙여넣을 프롬프트
   ------------------------------------------------------------------
   ⚠️ 이름·학교는 넣지 않는다. 점수와 방향만으로 충분하다.
   ================================================================== */
const esc = t => String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function studentPrompt(p){
  const s=p.scores, A=KB[p.top1], B=KB[p.top2];
  const cb = p.usePair ? COMBO[p.pairKey] : null;
  return `나는 ${GRADE[p.grade]}이야. HBTS 뇌 사고유형 검사를 받았고 결과는 아래와 같아.

[검사 결과]
${ORDER.map(c=>`${KB[c].ko}(${KB[c].nick}) ${s[c]}점`).join('\n')}
가장 높은 곳: ${A.nick} ${s[p.top1]}점
두 번째: ${B.nick} ${s[p.top2]}점
가장 낮은 곳: ${KB[p.low].nick} ${s[p.low]}점
외향성:내향성 = ${p.ex}:${p.inv}
${cb?`두 강점이 겹치는 자리: ${cb.name} — ${cb.desc}`:''}

[내가 힘이 나는 방식]
${WORK_STYLE[p.top1]}

너는 진로 상담 전문가야. 아래 네 가지를 꼭 지켜줘.
1. 직업 하나로 확정하지 마. 후보를 넓혔다가 좁히는 걸 도와줘.
2. 연봉·전망·합격선 같은 숫자는 확실하지 않으면 "직접 확인이 필요하다"고 말해줘.
3. ${GRADE[p.grade]}이 알아들을 수 있는 말로, 짧게.
4. 답을 준 다음에는 나한테 되물어줘. 내가 스스로 생각하게.

준비됐으면 "준비됐어"라고만 답해줘. 내가 하나씩 물어볼게.`;
}

function copyAiPrompt(){
  const el = $('aiPrompt'); if(!el) return;
  const t = el.textContent;
  const done = ()=>{ const m=$('cpMsg'); if(m){ m.textContent=AI_DEEP.copied;
    setTimeout(()=>{ m.textContent=''; }, 3000); } };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(t).then(done).catch(()=>fallbackCopy(t,done));
  } else fallbackCopy(t,done);
}
function fallbackCopy(t, done){
  const ta=document.createElement('textarea');
  ta.value=t; ta.style.position='fixed'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.select();
  try{ document.execCommand('copy'); done(); }
  catch(e){ const m=$('cpMsg'); if(m) m.textContent='복사가 안 됩니다 — 글상자를 직접 드래그해 복사하세요'; }
  document.body.removeChild(ta);
}

/* ==================================================================
   입장 코드 · 사용 실적
   ------------------------------------------------------------------
   코드 하나가 세 가지를 한다.
     ① 아무나 링크로 들어오는 것을 막는다
     ② 캠프 종류·학년·6차시 여부를 코드가 정한다
        (학생 30명이 각자 고르다 생기는 사고를 원천 차단)
     ③ AI 호출 남용을 막는다
   ================================================================== */
const CAMP_URL = 'https://cqzqtjpukvalhwsqjpcg.supabase.co/functions/v1/camp';

async function campCall(body){
  const r = await fetch(CAMP_URL, {
    method:'POST',
    headers:{'content-type':'application/json',
      'apikey': AI_PROXY_ANON, 'Authorization':'Bearer '+AI_PROXY_ANON},
    body: JSON.stringify(body)
  });
  return r.json();
}

function gateMsg(html, cls){
  const el=$('gateMsg'); if(!el) return;
  el.style.display='block'; el.className='upstat '+(cls||''); el.innerHTML=html;
}
function enterTool(){
  $('gate').style.display='none';
  $('input').style.display='block';
  window.scrollTo(0,0);
}
async function gateGo(){
  const code = ($('gateCode').value||'').trim().toUpperCase();
  if(!code){ gateMsg('코드를 넣어주세요.','warnst'); return; }
  gateMsg('확인하는 중… <span class="spin"></span>');
  try{
    const j = await campCall({action:'check', code});
    if(!j || !j.ok){
      const why = {
        notfound:'그런 코드가 없습니다. <b>대소문자·하이픈(-)</b>까지 정확히 넣어주세요.',
        inactive:'지금은 닫혀 있는 코드입니다. 강사님께 확인해 주세요.',
        early:'아직 열리지 않은 코드입니다. 캠프 시작일에 다시 시도해 주세요.',
        expired:'기간이 지난 코드입니다. 강사님께 확인해 주세요.',
        used_up:'사용 가능 인원을 넘었습니다. 강사님께 알려주세요.',
        empty:'코드를 넣어주세요.'
      }[j && j.reason] || '확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
      gateMsg(why,'err'); return;
    }
    /* 코드가 캠프 설정을 정한다 */
    try{ sessionStorage.setItem('hbts_gate', JSON.stringify(j)) }catch(e){}
    applyCamp(j);
    enterTool();
  }catch(e){
    gateMsg(`확인에 실패했습니다. ${String(e.message||e)}<br>
      인터넷 연결을 확인하고 다시 시도해 주세요.`,'err');
  }
}

const CAMPNAME = {career:'진로 캠프', study:'자기주도학습 캠프', both:'학업 로드맵 캠프'};

function applyCamp(j){
  if($('mode') && j.mode) $('mode').value = j.mode;
  if($('grade') && j.grade) $('grade').value = j.grade;
  if($('six')) $('six').checked = !!j.six;
  const nm = CAMPNAME[j.mode] || '';
  const gr = {'초':'초등 고학년','중':'중학생','고':'고등학생'}[j.grade] || '';
  const line = j.label ? `<b>${j.label}</b> · ${nm}${j.six?' (6차시)':''} · ${gr}` : '';

  /* 입력 화면 위 — 코드가 제대로 먹혔는지 보여준다.
     조용히 넘어가면 학생도 강사도 확인할 방법이 없다. */
  const bar = $('codeBar'), txt = $('codeBarTxt');
  if(bar && txt && line){ txt.innerHTML = '입장했습니다 — ' + line; bar.style.display='flex'; }

  const box = $('campBadge');
  if(box && line){ box.innerHTML = line; box.style.display='block'; }
}

/* 코드를 다시 넣고 싶을 때 — 강사 모드 표시도 함께 지운다 */
function gateReset(){
  try{ sessionStorage.removeItem('hbts_gate') }catch(e){}
  location.href = location.pathname;
}

/* 사용 실적 — 학교 제안 때 쓰는 숫자.
   숫자가 작을 때 학생에게 보이면 오히려 역효과라 일정 수 넘어야 노출한다. */
const STAT_MIN_SHOW = 100;
async function loadStat(){
  try{
    const j = await campCall({action:'stats'});
    const n = j && j.stats && Number(j.stats.reports);
    if(!n) return;
    const el = $('gateStat'); if(!el) return;
    if(n >= STAT_MIN_SHOW){
      el.innerHTML = `지금까지 <b>${n.toLocaleString()}명</b>의 학생이 이 도구로 설계서를 만들었습니다`;
    }
  }catch(e){ /* 실적은 없어도 툴은 돈다 */ }
}
async function bumpStat(mode){
  try{ await campCall({action:'made', mode}); }catch(e){}
}

/* 시작할 때 — 이미 들어온 세션이면 코드 화면을 건너뛴다 */
(function(){
  let g=null;
  try{ g = sessionStorage.getItem('hbts_gate') }catch(e){}
  if(g && g!=='teacher'){
    try{ applyCamp(JSON.parse(g)); enterTool(); }
    catch(e){ try{ sessionStorage.removeItem('hbts_gate') }catch(e2){} }
  } else if(g==='teacher'){
    /* 예전 버전에서 남은 강사 통과 표시는 지운다 */
    try{ sessionStorage.removeItem('hbts_gate') }catch(e){}
  }
  const q = new URLSearchParams(location.search);
  const c = q.get('code');
  if(c && $('gateCode')){ $('gateCode').value = c.toUpperCase(); if(!g) gateGo(); }
  loadStat();
})();
