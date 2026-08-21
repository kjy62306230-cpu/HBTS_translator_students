/* ==================================================================
   결과지 PDF 업로드 → 자동 판독
   ------------------------------------------------------------------
   결과지 구조상 이렇게 나뉩니다.
     · 텍스트로 들어 있음 → 이름·검사일·외향/내향·감정 비율·주목 단어
     · 그래프 이미지 안    → 4개 영역 점수 (79/95/34/107)
   그래서 텍스트는 정규식으로, 점수는 AI Vision으로 읽습니다.
   Vision 실패·API 키 없음이면 그래프를 크게 띄워 직접 입력하게 합니다.
   ================================================================== */

/* pdf.js 워커를 파일 안에서 꺼내 씀 (인터넷 불필요) */
(function(){
  try{
    const src = document.getElementById('pdfWorkerSrc').textContent;
    const blob = new Blob([src], {type:'application/javascript'});
    pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
  }catch(e){ console.warn('pdf worker init', e); }
})();

let PDFPAGES = null;
let PDFDOC = null;    // 스캔 모드에서 재렌더용
let PDFALL = null;   // { adult:{text,dataUrl}, child:{text,dataUrl} }

function setStatus(html, kind){
  const el = $('upStatus');
  el.className = 'upstat ' + (kind||'');
  el.innerHTML = html;
}

/* ---------- 드래그 앤 드롭 ---------- */
(function(){
  const z = $('dropZone');
  if(!z) return;
  ['dragenter','dragover'].forEach(e=>z.addEventListener(e,ev=>{ev.preventDefault();z.classList.add('over')}));
  ['dragleave','drop'].forEach(e=>z.addEventListener(e,ev=>{ev.preventDefault();z.classList.remove('over')}));
  z.addEventListener('drop', ev=>{
    const f = ev.dataTransfer.files[0];
    if(f) handlePdf(f);
  });
})();

function onPickFile(inp){ if(inp.files[0]) handlePdf(inp.files[0]); }

/* ---------- 메인 ---------- */
async function handlePdf(file){
  if(!/\.pdf$/i.test(file.name)){ setStatus('PDF 파일만 올려주세요.','err'); return; }
  setStatus(`<b>${file.name}</b> 읽는 중… <span class="spin"></span>`);

  try{
    const buf = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({data:buf}).promise;

    /* 페이지별 텍스트 수집 */
    const pages=[];
    for(let i=1;i<=doc.numPages;i++){
      const pg = await doc.getPage(i);
      const tc = await pg.getTextContent();
      const raw = tc.items.map(x=>x.str).join(' ');
      /* pdf.js 는 한글을 글자 단위로 쪼개 뽑는다("김 주 엽"). 공백을 지운 판을 따로 둔다 */
      pages.push({ n:i, pg, text: raw, c: raw.replace(/\s+/g,'') });
    }

    /* 성인기 프로파일 페이지 찾기 */
    let adult = pages.find(p=>/두뇌프로파일그래프/.test(p.c) && /외향성:내향성/.test(p.c))
             || pages.find(p=>/외향성:내향성/.test(p.c));
    /* 소아청소년기 비교 페이지
       ⚠️ 목차(INDEX) 페이지에도 「소아청소년기 프로파일과…」 문구가 있어 그것만으로 찾으면 안 된다.
          실제 데이터(외향성:내향성)가 함께 있는 페이지여야 하고, 성인기 페이지와 달라야 한다. */
    let child = pages.find(p=>
      p.n !== (adult?adult.n:-1) &&
      /외향성:내향성/.test(p.c) &&
      (/소아청소년기특징/.test(p.c) || /소아청소년기프로파일과성인기/.test(p.c)) &&
      !/^INDEX/.test(p.c));

    /* ★ 소아청소년 검사를 따로 받지 않은 사람은 비교 페이지 왼쪽이
       회색 「예시 그림」이고 「추가로 실시해주세요」 안내가 덮여 있다.
       거기 보이는 숫자는 진짜 점수가 아니므로 아예 쓰지 않는다. */
    if(child && /추가로실시|추가로실시해주세요|평가를추가/.test(child.c)) child = null;

    /* ★ 스캔본·이미지 PDF 대응
       브라우저에서 인쇄→PDF로 저장한 결과지는 글자가 전부 그림이라 텍스트가 0이다.
       그런 경우 텍스트 파싱이 원천적으로 불가능하므로 Vision이 페이지를 직접 읽는다. */
    const totalChars = pages.reduce((a,x)=>a+x.c.length,0);
    const isScan = (totalChars < 300);

    if(!adult || isScan){
      const key = getKey();
      if(!key){
        setStatus(`<b>이 결과지는 글자가 전부 이미지로 되어 있습니다.</b>
          (브라우저에서 인쇄→PDF로 저장하면 이렇게 됩니다.)<br>
          텍스트를 뽑을 수 없어 <b>AI가 페이지를 직접 읽어야 합니다.</b>
          API 키를 넣어주시면 이름·점수·비율을 전부 읽어옵니다.`, 'warnst');
        PDFDOC = doc; PDFALL = pages;
        openAI('scan');
        return;
      }
      PDFDOC = doc; PDFALL = pages;
      await runScan(key);
      return;
    }

    setStatus('그래프를 이미지로 변환하는 중… <span class="spin"></span>');
    const adultImg = await renderPage(adult.pg);
    let childImg = child ? await renderPage(child.pg) : null;
    /* 파란 그래프가 실제로 그려져 있는지 픽셀로 확인 — 회색 예시면 버린다 */
    if(childImg && await childIsPlaceholder(childImg)){ childImg = null; child = null; }
    PDFPAGES = { adult:{text:adult.text, c:adult.c, img:adultImg, n:adult.n},
                 child: child?{text:child.text, c:child.c, img:childImg, n:child.n}:null };

    /* 1) 텍스트에서 뽑히는 것 먼저 채움 */
    const meta = parseMeta(adult.c, child?child.c:null);
    applyMeta(meta);

    /* 2) 점수는 Vision */
    const key = getKey();
    if(key){
      setStatus('그래프에서 점수를 읽는 중… <span class="spin"></span>');
      try{
        const sc = await readScores(key, adultImg, childImg);
        applyScores(sc);
        const chk = sc.adult ? await geoCheck(adultImg, sc.adult, 'red') : null;
        showConfirm(meta, sc, true, null, chk);
      }catch(e){
        showConfirm(meta, null, false, String(e.message||e));
      }
    } else {
      /* 키가 없으면 떠넘기지 말고, 그 자리에서 한 번만 받는다 */
      showConfirm(meta, null, false, 'nokey');
      openAI('vision');
    }
  }catch(e){
    setStatus('PDF를 읽지 못했습니다. ('+String(e.message||e)+') 아래에 직접 입력하셔도 됩니다.','err');
  }
}

/* ---------- 페이지 → PNG ---------- */
async function renderPage(pg, scale){
  const vp = pg.getViewport({scale: scale||2.0});
  const cv = document.createElement('canvas');
  cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
  await pg.render({canvasContext: cv.getContext('2d'), viewport: vp}).promise;
  return cv.toDataURL('image/png');
}

/* ---------- 텍스트 파싱 ----------
   pdf.js 가 한글을 글자 단위로 쪼개 뽑으므로 공백을 전부 지운 문자열에서 매칭한다.
   "김 주 엽 님 의  두 뇌" → "김주엽님의두뇌"
   "외 향 성 : 내 향 성  7 : 5" → "외향성:내향성7:5"
------------------------------------ */
function parseMeta(C, childC){
  const m = {};

  const nm = C.match(/([가-힣]{2,5})님의두뇌프로파일/) || C.match(/([가-힣]{2,5})님의/);
  if(nm) m.name = nm[1];

  const dt = C.match(/(\d{4}-\d{2}-\d{2})/);
  if(dt) m.date = dt[1];

  const ei = C.match(/외향성:내향성(\d+):(\d+)/);
  if(ei){ m.ex=+ei[1]; m.inv=+ei[2]; }

  /* 업무(공부) 줄을 먼저 뽑고, 전반 감정은 그 줄을 지운 뒤 매칭 */
  const wk = C.match(/(?:업무에대한|공부및일상생활에대한)긍정적감정:부정적감정(\d+):(\d+)/);
  if(wk){ m.wpos=+wk[1]; m.wneg=+wk[2]; }
  const rest = wk ? C.replace(wk[0],'|') : C;
  const pn = rest.match(/긍정적감정:부정적감정(\d+):(\d+)/);
  if(pn){ m.pos=+pn[1]; m.neg=+pn[2]; }

  const wd = C.match(/주목해야할단어(.{0,30}?)(?:소아청소년기|외향성|긍정적감정|$)/);
  if(wd){
    const v = wd[1].trim();
    m.word = /선택안함|없음|해당없음/.test(v) ? '' : v;
  }

  /* 소아청소년기 페이지에서 참고 정보 (AI 심화에만 씀) */
  if(childC){
    const ct = childC.match(/소아청소년기특징(.{0,120}?)(?:외향성|긍정적감정|$)/);
    if(ct) m.childTraits = ct[1].trim().replace(/,/g, ', ');
    const cw = childC.match(/주목해야할단어(.{0,30}?)(?:소아청소년기|외향성|긍정적감정|$)/);
    if(cw && !/선택안함|없음/.test(cw[1])) m.childWord = cw[1].trim();
  }
  return m;
}

let PDFMETA = null;
function applyMeta(m){
  PDFMETA = m;
  if(m.name) $('name').value = m.name;
  if(m.ex!=null){ $('ex').value=m.ex; $('inv').value=m.inv; }
  if(m.pos!=null){ $('pos').value=m.pos; $('neg').value=m.neg; }
  if(m.wpos!=null){ $('wpos').value=m.wpos; $('wneg').value=m.wneg; }
  if(m.word!=null) $('word').value = m.word;
}

function applyScores(sc){
  if(!sc) return;
  ORDER.forEach(c=>{ if(sc.adult && sc.adult[c]!=null) $('s_'+c).value = sc.adult[c]; });
  if(sc.child) ORDER.forEach(c=>{ if(sc.child[c]!=null) $('c_'+c).value = sc.child[c]; });
  livePreview();
}

/* ---------- Vision 판독 ---------- */
async function readScores(key, adultImg, childImg){
  const model = ($('apiModel') && $('apiModel').value.trim()) || AI_MODEL_DEFAULT;
  const content = [];

  content.push({type:'text', text:
`이 이미지는 HBTS 뇌 사고유형 검사 결과지의 두뇌 프로파일 그래프입니다.
뇌 그림이 4분면으로 나뉘어 있고, 각 모서리에 굵은 숫자가 하나씩 적혀 있습니다.

4분면 위치와 영역의 대응은 이렇습니다.
· 왼쪽 위  = LAB (좌측 전뇌)
· 오른쪽 위 = RAB (우측 전뇌)
· 왼쪽 아래 = LPB (좌측 후뇌)
· 오른쪽 아래 = RPB (우측 후뇌)

각 위치에 적힌 숫자를 정확히 읽어 주세요. 숫자는 보통 20~140 사이입니다.
숫자 옆의 라벨(좌측 전뇌:LAB 같은 글자)이 아니라, 뇌 그림 위에 그려진 빨간/파란 선 꼭짓점에 붙은 굵은 숫자를 읽으세요.`});

  content.push({type:'image', source:{type:'base64', media_type:'image/png', data: adultImg.split(',')[1]}});
  content.push({type:'text', text:'↑ 위 이미지는 성인기(현재) 프로파일입니다.'});

  if(childImg){
    content.push({type:'image', source:{type:'base64', media_type:'image/png', data: childImg.split(',')[1]}});
    content.push({type:'text', text:
`↑ 위 이미지는 「소아청소년기 프로파일과 성인기(현재) 프로파일 비교」 페이지로, 뇌 그림이 두 개 있습니다.
왼쪽 그림 = 소아청소년기, 오른쪽 그림 = 성인기(현재)입니다. **왼쪽(소아청소년기)** 의 4개 숫자를 읽어 주세요.

★ 매우 중요 — 소아청소년 검사를 하지 않은 사람은 왼쪽 그림이 **회색으로 흐리게 처리된 예시 그림**이고,
그 위에 「소아청소년기 프로파일을 보고 싶은 경우에는 '소아청소년 HBTS' 평가를 추가로 실시해주세요」
같은 안내 문구가 덮여 있습니다. 이때 보이는 숫자는 **진짜 점수가 아니라 예시 값**입니다.
아래 중 하나라도 해당하면 child 를 반드시 null 로 두세요. 절대 숫자를 채우지 마세요.
 · 왼쪽 그림이 회색/반투명/흐림 처리되어 있다
 · 왼쪽 그림 위에 '추가로 실시', '평가를 실시', '예시' 같은 안내 문구가 덮여 있다
 · 왼쪽 그림의 선 색이 오른쪽처럼 뚜렷한 색이 아니라 회색이다`});
  }

  content.push({type:'text', text:
`읽은 값을 아래 JSON 형식으로만 출력하세요. 설명·인사·코드블록 표시 없이 JSON만 출력합니다.
확실하지 않은 값은 null 로 두세요. 추측해서 채우지 마세요.

{"adult":{"LAB":숫자,"RAB":숫자,"LPB":숫자,"RPB":숫자},"child":${childImg?'{"LAB":숫자,"RAB":숫자,"LPB":숫자,"RPB":숫자}':'null'}}`});

  const r = await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{'content-type':'application/json','x-api-key':key,
             'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
    body: JSON.stringify({ model, max_tokens:500, messages:[{role:'user', content}] })
  });
  const j = await r.json();
  if(!r.ok) throw new Error(j?.error?.message || ('HTTP '+r.status));

  const txt = (j.content||[]).map(c=>c.text||'').join('');
  const mm = txt.match(/\{[\s\S]*\}/);
  if(!mm) throw new Error('판독 결과를 이해하지 못했습니다.');
  const out = JSON.parse(mm[0]);

  /* 값 검증 — 말이 안 되는 숫자는 버림 */
  const clean = o => { if(!o) return null; const r={}; let ok=false;
    ORDER.forEach(c=>{ const v=o[c]; r[c] = (typeof v==='number' && v>=0 && v<=200) ? Math.round(v) : null; if(r[c]!=null) ok=true; });
    return ok?r:null; };
  return { adult: clean(out.adult), child: clean(out.child) };
}

/* ---------- 확인 화면 ---------- */
function showConfirm(meta, sc, visionOk, err, chk, scanned){
  const got = [];
  if(meta.name) got.push(`이름 <b>${meta.name}</b>`);
  if(meta.date) got.push(`검사일 <b>${meta.date}</b>`);
  if(meta.ex!=null) got.push(`외향:내향 <b>${meta.ex}:${meta.inv}</b>`);
  if(meta.pos!=null) got.push(`감정 <b>${meta.pos}:${meta.neg}</b>`);
  if(meta.wpos!=null) got.push(`공부 감정 <b>${meta.wpos}:${meta.wneg}</b>`);
  got.push(`주목 단어 <b>${meta.word||'없음'}</b>`);

  let head, cls, extra='';
  if(visionOk && sc && sc.adult){
    const miss = ORDER.filter(c=>sc.adult[c]==null);
    if(miss.length){
      head = `일부만 읽었습니다 — <b>${miss.join(', ')}</b> 는 아래 그래프를 보고 직접 넣어주세요`;
      cls='warnst';
    } else {
      head = scanned
        ? `<b>글자가 이미지로 된 결과지였습니다. AI가 페이지를 직접 읽었습니다.</b><br>
           이 경우는 오차 가능성이 조금 더 있으니 <b>아래 값을 원본과 꼭 대조</b>해 주세요`
        : `<b>자동으로 다 읽었습니다.</b> 아래 값이 결과지와 맞는지 확인만 해주세요`;
      cls='okst';
    }
    if(sc.child) extra = `<p class="hint" style="margin-top:6px">소아청소년기 점수도 함께 읽었습니다.</p>`;
  } else if(err==='nokey'){
    head = `텍스트 정보는 자동으로 채웠습니다. <b>4개 점수는 API 키가 있어야 자동으로 읽습니다.</b><br>
      지금은 아래 그래프를 보고 숫자 4개만 직접 넣어주세요.`;
    cls='warnst';
  } else {
    head = `텍스트 정보는 자동으로 채웠습니다. 점수 자동 판독은 실패했습니다.<br>
      <span style="opacity:.75;font-size:12.5px">${err||''}</span><br>아래 그래프를 보고 숫자 4개만 직접 넣어주세요.`;
    cls='warnst';
  }

  /* 기하 검산 결과 — AI 판독을 그림으로 되짚어 본 것 */
  let geo='';
  if(chk){
    if(chk.ok){
      geo = `<div class="geo ok">✓ <b>검산 통과</b> — 결과지 그래프의 모양을 되짚어봤을 때 읽어온 숫자와 맞습니다.
        <span>AI 판독과 그림 계산이 서로 독립적으로 같은 답을 냈습니다.</span></div>`;
    } else {
      const w=chk.worst, pe=chk.per[w];
      geo = `<div class="geo bad">⚠ <b>검산 불일치 — 확인이 필요합니다</b><br>
        그래프 모양으로 되짚어보면 <b>${KB[w].ko}(${w})</b>는 <b>${pe.est}점 정도</b>로 보이는데,
        읽어온 값은 <b>${pe.given}점</b>입니다. 결과지 원본을 꼭 확인해 주세요.
        <div style="margin-top:9px"><button class="btn sm ghost" onclick="applyGeoFix('${w}',${pe.est})">
          ${pe.est}점으로 고치기</button></div></div>`;
    }
  }

  setStatus(`<div class="cf">
      <p>${head}</p>
      ${geo}
      <div class="cfgot">${got.join(' &nbsp;·&nbsp; ')}</div>
      ${extra}
      <div class="cfimg"><img src="${PDFPAGES.adult.img}" alt="결과지 프로파일">
        ${PDFPAGES.child?`<img src="${PDFPAGES.child.img}" alt="소아청소년기 비교">`:''}</div>
      <p class="hint">↑ 결과지 원본입니다. 아래 입력값과 대조해 보세요. 이미지 클릭하면 크게 보입니다.</p>
    </div>`, cls);

  document.querySelectorAll('.cfimg img').forEach(im=>{
    im.onclick = ()=> im.classList.toggle('big');
  });
  $('scoreCard').scrollIntoView({behavior:'smooth', block:'start'});
}

/* 결과지에 없는 것 = 학년. 자동으로 채울 수 없어 사용자가 고릅니다. */


/* ---------- 키를 새로 넣은 뒤, 이미 올린 PDF 로 다시 판독 ---------- */
async function retryVision(){
  if(!PDFPAGES){ setStatus('먼저 결과지 PDF를 올려주세요.','err'); return; }
  setStatus('결과지 그래프에서 점수를 읽는 중… <span class="spin"></span>');
  try{
    const sc = await readScores(getKey(), PDFPAGES.adult.img, PDFPAGES.child?PDFPAGES.child.img:null);
    applyScores(sc);
    const chk = sc.adult ? await geoCheck(PDFPAGES.adult.img, sc.adult, 'red') : null;
    showConfirm(PDFMETA||{}, sc, true, null, chk);
  }catch(e){
    showConfirm(PDFMETA||{}, null, false, String(e.message||e));
  }
}


/* 검산이 제안한 값으로 한 번에 교체 */
function applyGeoFix(area, val){
  $('s_'+area).value = val;
  livePreview();
  setStatus(`<div class="cf"><div class="geo ok">✓ <b>${KB[area].ko}(${area})</b>를 <b>${val}점</b>으로 고쳤습니다.
    결과지 원본과 한 번 더 대조해 주세요.</div>
    <div class="cfimg"><img src="${PDFPAGES.adult.img}" alt="결과지">
      ${PDFPAGES.child?`<img src="${PDFPAGES.child.img}" alt="소아청소년기">`:''}</div>
    <p class="hint">↑ 이미지를 클릭하면 크게 보입니다.</p></div>`, 'okst');
  document.querySelectorAll('.cfimg img').forEach(im=> im.onclick=()=>im.classList.toggle('big'));
}


/* ==================================================================
   스캔본 전용 — Vision 이 페이지를 직접 읽는다
   ------------------------------------------------------------------
   결과지를 브라우저 인쇄로 저장하면 19페이지 전부 텍스트가 0이 된다.
   이때는 앞쪽 페이지들을 이미지로 만들어 AI에게 통째로 보여주고
   「어느 페이지가 프로파일인지 + 거기 적힌 값 전부」를 받아온다.
   ================================================================== */
const SCAN_MAX_PAGES = 8;

async function runScan(key){
  if(!PDFDOC || !PDFALL){ setStatus('먼저 결과지 PDF를 올려주세요.','err'); return; }
  const model = ($('apiModel') && $('apiModel').value.trim()) || AI_MODEL_DEFAULT;
  const n = Math.min(SCAN_MAX_PAGES, PDFDOC.numPages);

  setStatus(`글자가 이미지로 된 결과지입니다. <b>AI가 앞 ${n}페이지를 직접 읽는 중…</b> <span class="spin"></span>`);

  try{
    /* 탐색용은 가볍게 렌더 */
    const thumbs=[];
    for(let i=1;i<=n;i++) thumbs.push(await renderPage(await PDFDOC.getPage(i), 1.5));

    const content=[{type:'text', text:
`HBTS 뇌 사고유형 검사 결과지 PDF입니다. 글자가 전부 이미지로 되어 있어 직접 읽어야 합니다.
앞쪽 ${n}페이지를 순서대로 보여드립니다.

찾아야 할 페이지는 두 가지입니다.
① 「○○님의 두뇌 프로파일 그래프 / 성인기(현재) 프로파일」 — 뇌 그림 1개 + 빨간 사각형
② 「소아청소년기 프로파일과 성인기(현재) 프로파일 비교」 — 뇌 그림 2개 (없을 수 있음)

뇌 그림의 4분면 대응:
· 왼쪽 위 = LAB(좌측 전뇌) · 오른쪽 위 = RAB(우측 전뇌)
· 왼쪽 아래 = LPB(좌측 후뇌) · 오른쪽 아래 = RPB(우측 후뇌)
각 꼭짓점에 붙은 굵은 숫자가 그 영역의 점수입니다 (보통 20~140).
비교 페이지에서는 **왼쪽 그림이 소아청소년기**입니다.

★ 매우 중요 — 소아청소년 검사를 하지 않은 사람은 비교 페이지 왼쪽 그림이
**회색으로 흐리게 처리된 예시 그림**이고, 그 위에 「소아청소년기 프로파일을 보고 싶은 경우에는
'소아청소년 HBTS' 평가를 추가로 실시해주세요」 같은 안내 문구가 덮여 있습니다.
이때 보이는 숫자는 **진짜 점수가 아니라 예시 값**입니다.
아래 중 하나라도 해당하면 child 를 반드시 null 로 두세요. 절대 숫자를 채우지 마세요.
 · 왼쪽 그림이 회색/반투명/흐림 처리되어 있다
 · 왼쪽 그림 위에 '추가로 실시', '평가를 실시', '예시' 같은 안내 문구가 덮여 있다
 · 왼쪽 그림의 선 색이 오른쪽처럼 뚜렷한 색이 아니라 회색이다`}];

    thumbs.forEach((t,i)=>{
      content.push({type:'text', text:`── ${i+1}페이지 ──`});
      content.push({type:'image', source:{type:'base64', media_type:'image/png', data:t.split(',')[1]}});
    });

    content.push({type:'text', text:
`아래 JSON 형식으로만 출력하세요. 설명·코드블록 표시 없이 JSON만.
확실하지 않은 값은 null. 추측해서 채우지 마세요.

{
 "profilePage": 프로파일페이지번호,
 "comparePage": 비교페이지번호 또는 null,
 "name": "이름",
 "date": "YYYY-MM-DD",
 "ex": 외향성숫자, "inv": 내향성숫자,
 "pos": 긍정적감정, "neg": 부정적감정,
 "wpos": 업무긍정, "wneg": 업무부정,
 "word": "주목해야 할 단어 (없거나 '선택 안함'이면 빈 문자열)",
 "adult": {"LAB":숫자,"RAB":숫자,"LPB":숫자,"RPB":숫자},
 "child": {"LAB":숫자,"RAB":숫자,"LPB":숫자,"RPB":숫자} 또는 null
}`});

    const r = await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'content-type':'application/json','x-api-key':key,
        'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body: JSON.stringify({ model, max_tokens:1200, messages:[{role:'user',content}] })
    });
    const j = await r.json();
    if(!r.ok) throw new Error(j?.error?.message || ('HTTP '+r.status));
    const txt=(j.content||[]).map(c=>c.text||'').join('');
    const mm=txt.match(/\{[\s\S]*\}/);
    if(!mm) throw new Error('판독 결과를 이해하지 못했습니다.');
    const o=JSON.parse(mm[0]);

    /* 값 검증 */
    const clean = x => { if(!x) return null; const out={}; let ok=false;
      ORDER.forEach(c=>{ const v=x[c]; out[c]=(typeof v==='number'&&v>=0&&v<=200)?Math.round(v):null; if(out[c]!=null) ok=true; });
      return ok?out:null; };
    const sc = { adult: clean(o.adult), child: clean(o.child) };

    /* 확인용 원본 페이지는 고해상도로 다시 렌더 */
    const pp = (typeof o.profilePage==='number' && o.profilePage>=1 && o.profilePage<=PDFDOC.numPages) ? o.profilePage : null;
    const cp = (typeof o.comparePage==='number' && o.comparePage>=1 && o.comparePage<=PDFDOC.numPages) ? o.comparePage : null;
    const adultImg = pp ? await renderPage(await PDFDOC.getPage(pp), 2.0) : thumbs[0];
    let childImg = cp ? await renderPage(await PDFDOC.getPage(cp), 2.0) : null;
    /* ★ 회색 예시 그림이면 AI가 숫자를 읽어왔더라도 전부 버린다 */
    let cpUse = cp;
    if(childImg && await childIsPlaceholder(childImg)){ childImg = null; cpUse = null; sc.child = null; }
    PDFPAGES = { adult:{text:'', c:'', img:adultImg, n:pp||1},
                 child: cpUse?{text:'', c:'', img:childImg, n:cpUse}:null };

    /* 메타 반영 */
    const meta = {};
    if(o.name) meta.name=String(o.name).trim();
    if(o.date) meta.date=String(o.date).trim();
    const num = v => (typeof v==='number' && v>=0 && v<=100) ? v : null;
    if(num(o.ex)!=null){ meta.ex=num(o.ex); meta.inv=num(o.inv)??0; }
    if(num(o.pos)!=null){ meta.pos=num(o.pos); meta.neg=num(o.neg)??0; }
    if(num(o.wpos)!=null){ meta.wpos=num(o.wpos); meta.wneg=num(o.wneg)??0; }
    meta.word = (o.word && !/선택\s*안함|없음/.test(String(o.word))) ? String(o.word).trim() : '';
    applyMeta(meta);
    applyScores(sc);

    const chk = sc.adult ? await geoCheck(adultImg, sc.adult, 'red') : null;
    showConfirm(meta, sc, true, null, chk, true);

  }catch(e){
    setStatus(`<b>AI 판독에 실패했습니다.</b> ${String(e.message||e)}<br>
      이 결과지는 글자가 이미지로 되어 있어 자동 추출이 안 됩니다.
      아래 칸에 <b>직접 입력</b>하시거나, 키·크레딧·모델명을 확인 후 다시 시도해 주세요.
      <div style="margin-top:10px"><button class="btn sm ghost" onclick="openAI('scan')">다시 시도</button></div>`, 'err');
  }
}
