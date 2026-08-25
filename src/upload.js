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
/* 마지막 기하 검산 결과. generate() 가 이걸 보고 설계서 생성을 막는다. */
let GEO = null;
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
      PDFDOC = doc; PDFALL = pages;
      await runScan();
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

    /* 2) 점수는 Vision — 키는 필요 없다 (서버가 대신 부른다) */
    setStatus('그래프에서 점수를 읽는 중… <span class="spin"></span>');
    try{
      const sc = await readScores(adultImg, childImg);
      applyScores(sc);
      const chk = await runCheck(adultImg, sc.adult);
      showConfirm(meta, sc, true, null, chk);
    }catch(e){
      showConfirm(meta, null, false, String(e.message||e));
    }
  }catch(e){
    setStatus('PDF를 읽지 못했습니다. ('+String(e.message||e)+') 아래에 직접 입력하셔도 됩니다.','err');
  }
}

/* ---------- 페이지 → PNG ---------- */
async function renderPage(pg, scale, asJpeg){
  const vp = pg.getViewport({scale: scale||2.0});
  const cv = document.createElement('canvas');
  cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
  const cx = cv.getContext('2d');
  /* JPEG 는 투명 배경을 검게 칠하므로 흰 바탕을 먼저 깐다 */
  if(asJpeg){ cx.fillStyle='#fff'; cx.fillRect(0,0,cv.width,cv.height); }
  await pg.render({canvasContext: cx, viewport: vp}).promise;
  /* 스캔본 8장을 PNG로 보내면 5MB가 넘어 전송이 통째로 실패하는 경우가 있다.
     JPEG q0.85 로 보내면 1/3 이하로 줄고 숫자 판독 정확도는 그대로다. */
  return asJpeg ? cv.toDataURL('image/jpeg', 0.85) : cv.toDataURL('image/png');
}

/* dataURL 의 media_type 을 그대로 뽑아 쓴다 (png/jpeg 혼용 대비) */
const mimeOf = u => (u.match(/^data:([^;]+);/)||[,'image/png'])[1];

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
/* ------------------------------------------------------------------
   2차 판독 — 꼭짓점 근처만 잘라 확대해서 숫자를 다시 읽는다
   ------------------------------------------------------------------
   ⚠️ 2026-08-24 J님 지적: 「그림에도 34라고 되어 있는데」
   거리 추정(geoCheck)은 선 두께 때문에 1~3점이 늘 어긋난다.
   결과지에는 숫자가 인쇄돼 있으므로 그걸 직접 읽는 편이 정확하다.
   전체 그림을 다시 보내지 않고 **꼭짓점 주변 200x120 을 2배 확대한 4장**만 보낸다.
   작고 명확해서 오판독이 거의 없고, 토큰도 얼마 안 든다.
   실패하면 기존 거리 추정으로 폴백한다.
------------------------------------------------------------------ */
/* 검산 한 방에 — ① 꼭짓점 숫자 재판독(정확)  ② 거리 추정(폴백)
   둘 다 시도해서 하나의 결과 객체로 만든다. */
async function runCheck(adultImg, scores){
  if(!scores) return null;
  const ORD = ['LAB','RAB','LPB','RPB'];

  /* ① 그림에 인쇄된 숫자를 다시 읽는다 — 오차 없음 */
  const re = await readVertexNumbers(adultImg);
  if(re){
    const per={}; let worst=ORD[0], worstOff=-1, n=0;
    for(const k of ORD){
      const est = re[k];
      if(est==null){ per[k]={given:scores[k], est:null, off:0, unread:true}; continue; }
      n++;
      const off = scores[k]>0 ? Math.abs(est-scores[k])/Math.max(scores[k],est) : 0;
      per[k] = { given:scores[k], est, off };
      if(off>worstOff){ worstOff=off; worst=k; }
    }
    if(n>=2) return { per, worst, dev:worstOff, ok:worstOff<=0.02, src:'read', exact:true };
  }

  /* ② 폴백 — 꼭짓점 거리로 추정 (선 두께만큼 1~3점 오차가 있다) */
  const g = await geoCheck(adultImg, scores, 'red');
  if(g) g.src = 'geo';
  return g;
}

async function readVertexNumbers(adultImg){
  let crops;
  try{ crops = await vertexCrops(adultImg, 'red'); }catch(e){ return null; }
  if(!crops) return null;

  const model = ($('apiModel') && $('apiModel').value.trim()) || AI_MODEL_DEFAULT;
  const ORD = ['LAB','RAB','LPB','RPB'];
  const NAME = {LAB:'좌측 전뇌(왼쪽 위)', RAB:'우측 전뇌(오른쪽 위)',
                LPB:'좌측 후뇌(왼쪽 아래)', RPB:'우측 후뇌(오른쪽 아래)'};
  const content = [{type:'text', text:
`아래 4장은 HBTS 결과지 그래프에서 **빨간 사각형의 꼭짓점 부분만 잘라 확대한 것**입니다.
각 이미지에는 그 꼭짓점에 붙은 **굵은 검은색 숫자**가 하나 들어 있습니다. 그 숫자만 읽어 주세요.

· 숫자는 보통 20~140 사이의 두세 자리입니다
· **빨간 글씨·설명 문구·라벨은 무시**하세요. 굵은 검은 숫자만 읽습니다
· 숫자가 잘려 보이거나 확실하지 않으면 그 항목은 **null** 로 두세요. 추측하지 마세요`}];

  for(const k of ORD){
    content.push({type:'image', source:{type:'base64', media_type:'image/png', data: crops[k].split(',')[1]}});
    content.push({type:'text', text:`↑ ${NAME[k]} 꼭짓점`});
  }
  content.push({type:'text', text:
`JSON 만 출력하세요. 설명·코드블록 없이.
{"LAB":숫자,"RAB":숫자,"LPB":숫자,"RPB":숫자}`});

  try{
    const r = await aiFetch({ model, max_tokens:200, messages:[{role:'user', content}] });
    const j = await r.json();
    if(!r.ok) return null;
    const txt = (j.content||[]).map(c=>c.text||'').join('');
    const m = txt.match(/\{[\s\S]*\}/);
    if(!m) return null;
    const o = JSON.parse(m[0]);
    const out = {};
    for(const k of ORD){
      const v = parseInt(o[k],10);
      out[k] = (isNaN(v) || v<0 || v>200) ? null : v;
    }
    /* 네 개 다 못 읽었으면 쓸모없다 */
    return ORD.some(k=>out[k]!==null) ? out : null;
  }catch(e){ return null; }
}

async function readScores(adultImg, childImg){
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
숫자 옆의 라벨(좌측 전뇌:LAB 같은 글자)이 아니라, 뇌 그림 위에 그려진 빨간/파란 선 꼭짓점에 붙은 굵은 숫자를 읽으세요.

★ 가장 자주 틀리는 부분 — 반드시 지키세요.
점수가 낮은 영역은 꼭짓점이 **뇌 그림 중앙 쪽으로 깊이 들어와 있고, 숫자도 중앙 근처에 붙어 있습니다.**
사분면의 바깥 모서리만 훑으면 이 숫자를 통째로 놓치거나 옆 영역 숫자를 잘못 가져옵니다.
**빨간 선을 따라가면서 꺾이는 지점(꼭짓점) 4개를 먼저 찾고, 각 꼭짓점에 가장 가까이 붙은 숫자를 읽으세요.**
꼭짓점이 중앙에 가까울수록 점수가 낮습니다. 30~40점대 값이 중앙 바로 옆에 있는 경우가 흔합니다.
네 숫자는 서로 다른 값인 것이 보통이며, 같은 숫자를 두 영역에 넣지 마세요.`});

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

  const r = await aiFetch({ model, max_tokens:500, messages:[{role:'user', content}] });
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

  /* 기하 검산 결과 — AI 판독을 그림으로 되짚어 본 것
     ------------------------------------------------------------------
     ⚠️ 2026-08-24 실제 사고: LPB 34 를 84 로 오판독한 설계서가 그대로 나갔다.
     검산 로직 자체는 정확했다 (실측 오차 1~3%, 오답은 58% 로 잡아냄).
     새어나간 이유는 두 가지였다.
       ① 네 개 중 「가장 나쁜 하나」만 보여줘서 눈에 안 띄었다
       ② 경고만 하고 「설계서 만들기」를 그대로 누를 수 있었다
     그래서 지금은 네 개를 전부 표로 보여주고, 불일치가 남아 있으면 생성을 막는다. */
  GEO = chk || null;
  let geo='';

  /* 검산 경로에 따라 임계값과 말이 다르다.
     read = 그림에 인쇄된 숫자를 다시 읽음 → 다르면 무조건 틀린 것
     geo  = 꼭짓점 거리로 추정      → 선 두께만큼 1~3점 오차가 늘 있다 */
  const EXACT = !!(chk && chk.exact);
  const LIMIT = EXACT ? 0.02 : 0.15;
  const COL2  = EXACT ? '그래프에서 다시 읽은 값' : '그래프 모양으로 잰 값';

  const geoRow = c => ['LAB','RAB','LPB','RPB'].map(a=>{
      const pe=c.per[a];
      if(pe.unread) return `<tr>
        <td><span class="sw" style="background:${KB[a].color}"></span>${KB[a].ko}</td>
        <td class="n">${pe.given}</td><td class="n" style="opacity:.45">—</td>
        <td class="n" style="opacity:.6;font-weight:600">못 읽음</td></tr>`;
      const bad=pe.off>LIMIT;
      const same=pe.est===pe.given;
      return `<tr${bad?' class="x"':''}>
        <td><span class="sw" style="background:${KB[a].color}"></span>${KB[a].ko}</td>
        <td class="n">${pe.given}</td>
        <td class="n">${pe.est}</td>
        <td class="n ${bad?'r':''}">${bad ? (EXACT?'다릅니다':Math.round(pe.off*100)+'% 차이')
                                          : (EXACT&&same?'일치':'맞음')}</td>
      </tr>`;}).join('');

  if(chk){
    const badKeys = ['LAB','RAB','LPB','RPB'].filter(a=>!chk.per[a].unread && chk.per[a].off>LIMIT);
    const table = `<table class="geot"><thead><tr>
        <th>영역</th><th class="n">읽어온 값</th><th class="n">${COL2}</th><th class="n">판정</th>
      </tr></thead><tbody>${geoRow(chk)}</tbody></table>`;

    if(chk.ok){
      geo = EXACT
        ? `<div class="geo ok">✓ <b>검산 통과</b> — 그래프에 인쇄된 숫자를 <b>다시 읽어서</b> 대조했고 같습니다.
            <span>꼭짓점 부분만 잘라 확대해 두 번째로 읽은 값입니다. 추정이 아니라 실제 숫자입니다.</span>${table}</div>`
        : `<div class="geo ok">✓ <b>검산 통과</b> — 네 영역 모두 그래프 모양과 맞습니다.
            <span>꼭짓점까지의 거리로 계산한 값이라 <b>1~3점 오차</b>가 있습니다. 판정만 보시면 됩니다.</span>${table}</div>`;
    } else {
      const names = badKeys.map(a=>`<b>${KB[a].ko}</b>`).join(' · ');
      geo = `<div class="geo bad">⚠ <b>검산 불일치 — ${badKeys.length}개 영역이 그림과 다릅니다</b><br>
        ${names} 에서 차이가 납니다. <b>점수가 틀리면 설계서 전체가 틀립니다.</b>
        결과지 원본(아래 이미지)을 꼭 확인해 주세요.
        ${table}
        <p style="margin:10px 0 0;font-size:12.5px;opacity:.85">
          ${EXACT
            ? '오른쪽 값은 <b>그래프에 인쇄된 숫자를 확대해 다시 읽은 것</b>입니다. 대개 이쪽이 맞습니다.'
            : '그림 계산은 <b>실측 오차 1~3%</b>로 검증돼 있습니다. 대개 그림 쪽이 맞습니다.'}</p>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn sm" onclick="applyGeoAll()">${EXACT?'다시 읽은 값으로 고치기':'그림이 말하는 값으로 전부 고치기'}</button>
          ${badKeys.map(a=>`<button class="btn sm ghost" onclick="applyGeoFix('${a}',${chk.per[a].est})">
            ${KB[a].ko} → ${chk.per[a].est}</button>`).join('')}
        </div></div>`;
    }
  } else if(ok){
    /* ⚠️ 검산을 못 했는데 아무 말도 안 하면, 사용자는 검증된 줄 안다. */
    geo = `<div class="geo bad">⚠ <b>검산을 하지 못했습니다</b><br>
      그래프에서 빨간 사각형을 찾지 못했습니다. 판독값이 맞는지 <b>자동으로 확인할 수 없었습니다.</b>
      아래 결과지 원본과 입력값 네 개를 <b>직접 대조</b>해 주세요.</div>`;
  }

  /* 검산이 틀렸다고 하는데 머리글이 「자동으로 다 읽었습니다」면 서로 모순이다.
     사용자는 머리글을 먼저 읽는다. 여기서 톤을 맞춰야 경고가 산다. */
  if(chk && !chk.ok){
    head = `<b>점수를 다시 확인해 주세요.</b> 읽어온 값이 결과지 그래프와 맞지 않습니다`;
    cls = 'warnst';
  } else if(!chk && ok){
    head = `${head}<br><b style="color:#8B4A1B">다만 자동 검산은 하지 못했습니다.</b>`;
    cls = 'warnst';
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
    const sc = await readScores(PDFPAGES.adult.img, PDFPAGES.child?PDFPAGES.child.img:null);
    applyScores(sc);
    const chk = await runCheck(PDFPAGES.adult.img, sc.adult);
    showConfirm(PDFMETA||{}, sc, true, null, chk);
  }catch(e){
    showConfirm(PDFMETA||{}, null, false, String(e.message||e));
  }
}


/* 검산이 제안한 값으로 네 개 전부 교체 */
function applyGeoAll(){
  if(!GEO) return;
  const ORD=['LAB','RAB','LPB','RPB'];
  const changed=[];
  /* ⚠️ 오차가 큰 영역만 고친다.
     맞게 읽은 값까지 그림 추정치로 덮으면 79 를 81 로 바꿔 오히려 나빠진다.
     그림 계산에는 선 두께만큼의 1~3% 오차가 늘 있다. */
  const LIM = GEO.exact ? 0.02 : 0.15;
  ORD.forEach(a=>{
    const pe=GEO.per[a];
    if(pe && !pe.unread && pe.est>0 && pe.off>LIM){
      $('s_'+a).value=pe.est; changed.push(`${KB[a].ko} ${pe.given} → ${pe.est}`);
    }
  });
  livePreview();
  /* 고친 값으로 다시 검산한다. 눈속임이 아니라 실제로 맞는지 본다. */
  (async()=>{
    const sc={}; ORD.forEach(a=>sc[a]=parseInt($('s_'+a).value,10));
    GEO = PDFPAGES ? await runCheck(PDFPAGES.adult.img, sc) : null;
    setStatus(`<div class="cf"><div class="geo ok">✓ <b>그림이 말하는 값으로 고쳤습니다.</b><br>
      ${changed.length?changed.join(' &nbsp;·&nbsp; '):'바뀐 값이 없습니다.'}
      ${GEO&&GEO.ok?'<br><b>다시 검산했고 이제 맞습니다.</b>':''}</div>
      <div class="cfimg"><img src="${PDFPAGES.adult.img}" alt="결과지">
        ${PDFPAGES.child?`<img src="${PDFPAGES.child.img}" alt="소아청소년기">`:''}</div>
      <p class="hint">↑ 원본과 한 번 더 대조해 주세요. 이미지를 클릭하면 크게 보입니다.</p></div>`, 'okst');
    document.querySelectorAll('.cfimg img').forEach(im=> im.onclick=()=>im.classList.toggle('big'));
  })();
}

/* 검산이 제안한 값으로 한 번에 교체 */
function applyGeoFix(area, val){
  $('s_'+area).value = val;
  livePreview();
  if(PDFPAGES){ (async()=>{
    const sc={}; ['LAB','RAB','LPB','RPB'].forEach(a=>sc[a]=parseInt($('s_'+a).value,10));
    GEO = await runCheck(PDFPAGES.adult.img, sc);
  })(); }
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

async function runScan(){
  if(!PDFDOC || !PDFALL){ setStatus('먼저 결과지 PDF를 올려주세요.','err'); return; }
  const model = ($('apiModel') && $('apiModel').value.trim()) || AI_MODEL_DEFAULT;
  const n = Math.min(SCAN_MAX_PAGES, PDFDOC.numPages);

  setStatus(`글자가 이미지로 된 결과지입니다. <b>AI가 앞 ${n}페이지를 직접 읽는 중…</b> <span class="spin"></span>`);

  try{
    /* 탐색용은 가볍게 렌더 */
    const thumbs=[];
    for(let i=1;i<=n;i++) thumbs.push(await renderPage(await PDFDOC.getPage(i), 1.5, true));

    const sentMB = thumbs.reduce((a,t)=>a+t.length,0)/1024/1024;
    setStatus(`AI가 앞 ${n}페이지를 읽는 중… <b>${sentMB.toFixed(1)}MB 전송</b> <span class="spin"></span>`);

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
      content.push({type:'image', source:{type:'base64', media_type:mimeOf(t), data:t.split(',')[1]}});
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

    const r = await aiFetch({ model, max_tokens:1200, messages:[{role:'user',content}] });
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

    const chk = await runCheck(adultImg, sc.adult);
    showConfirm(meta, sc, true, null, chk, true);

  }catch(e){
    const msg = String(e.message||e);
    /* 「Failed to fetch」 는 서버가 답을 준 게 아니라 요청 자체가 막힌 것이다.
       키·크레딧 문제가 아니므로 안내를 갈라준다. */
    const blocked = /failed to fetch|networkerror|load failed/i.test(msg);
    setStatus(`<b>AI 판독에 실패했습니다.</b> ${msg}<br>
      ${blocked
        ? `이건 <b>키나 크레딧 문제가 아니라 요청이 브라우저 밖으로 못 나간 것</b>입니다.
           아래 <b>연결 테스트</b>를 눌러 원인을 좁혀 보세요.`
        : (/invalid x-api-key|authentication/i.test(msg)
            ? `<b>통신은 정상입니다.</b> 서버가 「이 키는 없는 키」라고 답했습니다.
               지금 저장된 키: <code>${maskKey(getKey())}</code><br>
               <b>가장 흔한 원인은 콘솔에서 키를 잘라 복사한 것</b>입니다.
               키 전체는 <b>만들 때 딱 한 번만</b> 보입니다. 목록 화면에 보이는 가려진 키는 쓸 수 없어요.
               console.anthropic.com 에서 <b>새 키를 만들어</b> 그 자리에서 복사해 넣어 주세요.`
            : `키·크레딧·모델명을 확인 후 다시 시도해 주세요. 아래 칸에 <b>직접 입력</b>하셔도 됩니다.`)}
      <div style="margin-top:10px">
        <button class="btn sm" onclick="clearKey()">키 지우고 새로 넣기</button>
        <button class="btn sm ghost" onclick="apiSelfTest()">연결 테스트</button>
        <button class="btn sm ghost" onclick="runScan()">다시 시도</button>
      </div>`, 'err');
  }
}

/* ------------------------------------------------------------------
   연결 테스트 — 「Failed to fetch」 의 원인을 좁힌다
   ------------------------------------------------------------------
   ① 아주 작은 텍스트 요청을 보낸다 (이미지 없음, 토큰 몇 개)
      성공 → 통신은 되는 것. 앞의 실패는 전송량 문제였다.
      실패 → api.anthropic.com 자체가 막혀 있다.
             (광고·추적 차단 확장, 회사·학교 방화벽, 백신의 웹 보호 기능)
------------------------------------------------------------------ */
async function apiSelfTest(){
  const model = ($('apiModel') && $('apiModel').value.trim()) || AI_MODEL_DEFAULT;
  const via = getKey() ? '개인 키' : '뿌리깊이 서버';
  setStatus(`연결을 확인하는 중… (${via}) <span class="spin"></span>`);
  try{
    const r = await aiFetch({ model, max_tokens:8, messages:[{role:'user',content:'1+1은?'}] });
    const j = await r.json().catch(()=>({}));
    if(r.ok){
      setStatus(`<b>통신은 정상입니다.</b> 키·크레딧 모두 살아 있습니다.<br>
        앞의 실패는 <b>보내는 이미지가 너무 컸던 것</b>으로 보입니다.
        <div style="margin-top:10px"><button class="btn sm" onclick="runScan()">다시 판독</button></div>`, 'okst');
    } else {
      setStatus(`<b>통신은 정상입니다.</b> 서버가 거절했습니다 — HTTP ${r.status} ${j?.error?.message||''}<br>
        경로: <b>${getKey()?'개인 키':'뿌리깊이 서버'}</b>${getKey()?` · <code>${maskKey(getKey())}</code>`:''}<br>
        ${/invalid x-api-key|authentication/i.test(j?.error?.message||'')
          ? `이 키는 <b>존재하지 않는 키</b>입니다. 키 전체는 <b>만들 때 딱 한 번만</b> 보이므로,
             목록 화면에서 복사하면 가운데가 잘린 값이 들어갑니다.
             console.anthropic.com → API Keys → <b>Create Key</b> 로 새로 만들어 그 자리에서 복사해 주세요.`
          : `크레딧 잔액과 모델명을 확인해 주세요.`}
        <div style="margin-top:10px">
          <button class="btn sm" onclick="clearKey()">키 지우고 새로 넣기</button>
        </div>`, 'err');
    }
  }catch(e){
    setStatus(`<b>요청이 아예 나가지 못했습니다.</b> ${String(e.message||e)}<br>
      api.anthropic.com 으로 가는 길이 막혀 있습니다. 아래를 차례로 확인해 주세요.
      <ul style="margin:8px 0 0 18px">
        <li>광고·추적 차단 확장 프로그램 (uBlock, AdGuard 등) — 이 페이지에서 잠시 끄기</li>
        <li>백신 프로그램의 <b>웹 보호 / HTTPS 검사</b> 기능</li>
        <li>회사·학교 와이파이 — 개인 네트워크나 휴대폰 핫스팟으로 바꿔 시도</li>
        <li>브라우저를 <b>시크릿 창</b>으로 열어 확장 없이 시도</li>
      </ul>
      <div style="margin-top:10px"><button class="btn sm ghost" onclick="apiSelfTest()">다시 테스트</button></div>`, 'err');
  }
}
