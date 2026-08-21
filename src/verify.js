/* ==================================================================
   기하 검산 — AI가 읽은 점수가 맞는지 그림으로 확인
   ------------------------------------------------------------------
   원리
     결과지의 빨간 사각형은 「중심에서 각 꼭짓점까지의 거리 = 그 영역 점수」
     로 그려져 있다. (J님 결과로 검증: 배율 편차 3.9% 이내)
     거리의 「비율」은 그림 크기·해상도와 무관하므로,
     AI가 읽은 네 숫자의 비율과 맞춰보면 오판독을 잡아낼 수 있다.
     이 검산은 API 없이 브라우저에서 공짜로 돌아간다.
   ================================================================== */

/* 다각형 꼭짓점 4개 찾기 */
function findPolygon(dataUrl, want){   // want: 'red' | 'blue'
  return new Promise(resolve=>{
    const img = new Image();
    img.onload = ()=>{
      try{
        const S = 2;                                  // 2배 축소해서 속도 확보
        const w = Math.floor(img.width/S), h = Math.floor(img.height/S);
        const cv = document.createElement('canvas');
        cv.width=w; cv.height=h;
        const cx = cv.getContext('2d', {willReadFrequently:true});
        cx.drawImage(img, 0,0, w,h);
        const d = cx.getImageData(0,0,w,h).data;

        const mask = new Uint8Array(w*h);
        for(let i=0,p=0;i<mask.length;i++,p+=4){
          const r=d[p], g=d[p+1], b=d[p+2];
          mask[i] = (want==='red')
            ? ((r>150 && g<90 && b<90) ? 1:0)
            : ((b>120 && r<90 && g<90) ? 1:0);
        }

        /* 가장 큰 연결 덩어리 = 다각형 (빨간 글자 라벨은 작아서 걸러짐) */
        const seen = new Uint8Array(w*h);
        let best=null, bestN=0;
        const stack = new Int32Array(w*h);
        for(let i=0;i<mask.length;i++){
          if(!mask[i] || seen[i]) continue;
          let sp=0, n=0; stack[sp++]=i; seen[i]=1;
          const pts=[];
          while(sp){
            const q=stack[--sp]; n++;
            const qx=q%w, qy=(q-qx)/w;
            pts.push(qx,qy);
            for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
              const nx=qx+dx, ny=qy+dy;
              if(nx<0||ny<0||nx>=w||ny>=h) continue;
              const k=ny*w+nx;
              if(mask[k] && !seen[k]){ seen[k]=1; stack[sp++]=k; }
            }
          }
          if(n>bestN){ bestN=n; best=pts; }
        }
        if(!best || bestN<300) return resolve(null);

        /* 대각선 4방향 최원점 */
        const dirs={LAB:[-1,-1],RAB:[1,-1],LPB:[-1,1],RPB:[1,1]};
        const V={};
        for(const k in dirs){
          const [dx,dy]=dirs[k];
          let bv=-1e18, bx=0, by=0;
          for(let i=0;i<best.length;i+=2){
            const v=best[i]*dx + best[i+1]*dy;
            if(v>bv){ bv=v; bx=best[i]; by=best[i+1]; }
          }
          V[k]=[bx,by];
        }
        resolve(V);
      }catch(e){ resolve(null); }
    };
    img.onerror = ()=>resolve(null);
    img.src = dataUrl;
  });
}

/* 두 대각선의 교점 = 중심 */
function polyCenter(V){
  const [ax,ay]=V.LAB, [bx,by]=V.RPB, [cx,cy]=V.RAB, [dx,dy]=V.LPB;
  const r1x=bx-ax, r1y=by-ay, r2x=dx-cx, r2y=dy-cy;
  const den = r1x*(-r2y) - r1y*(-r2x);
  if(Math.abs(den) < 1e-6) return null;
  const t = ((cx-ax)*(-r2y) - (cy-ay)*(-r2x)) / den;
  return [ax + r1x*t, ay + r1y*t];
}

/* AI가 읽은 점수와 그림의 비율을 대조 */
async function geoCheck(dataUrl, scores, want){
  const V = await findPolygon(dataUrl, want||'red');
  if(!V) return null;
  const C = polyCenter(V);
  if(!C) return null;

  const dist={}, ORD=['LAB','RAB','LPB','RPB'];
  for(const k of ORD) dist[k]=Math.hypot(V[k][0]-C[0], V[k][1]-C[1]);

  /* 배율 = 거리 / 점수. 네 개가 서로 비슷해야 정상.
     ★ 평균이 아니라 중앙값을 쓴다. 한 개가 크게 틀리면 평균은 그쪽으로 끌려가서
       엉뚱한 영역을 범인으로 지목하게 된다. */
  const keys = ORD.filter(k=>scores[k]>0);
  if(keys.length<3) return null;
  const ratios = keys.map(k=>dist[k]/scores[k]).sort((a,b)=>a-b);
  const mid = ratios.length%2
      ? ratios[(ratios.length-1)/2]
      : (ratios[ratios.length/2-1]+ratios[ratios.length/2])/2;

  /* 영역별로 「그림이 말하는 점수」와 「읽어온 점수」의 상대 오차 */
  const per={};
  let worst=keys[0], worstOff=-1;
  for(const k of ORD){
    const est = Math.round(dist[k]/mid);
    const off = scores[k]>0 ? Math.abs(est-scores[k])/Math.max(scores[k],est) : 0;
    per[k] = { given:scores[k], est, off };
    if(off>worstOff){ worstOff=off; worst=k; }
  }
  return { dev: worstOff, avg: mid, per, ok: worstOff <= 0.15, worst };
}

/* ------------------------------------------------------------------
   소아청소년기 「예시(회색) 그림」 판별
   ------------------------------------------------------------------
   소아청소년 HBTS 를 따로 받지 않은 사람의 비교 페이지는
   왼쪽 그림이 회색 처리된 예시이고 「추가로 실시해주세요」 안내가 덮여 있다.
   거기 보이는 숫자는 진짜 점수가 아니다.
   실제 소아청소년기 그래프는 파란 선으로 그려지므로,
   왼쪽 절반에 파란 픽셀이 거의 없으면 예시 그림으로 본다.
------------------------------------------------------------------ */
function childIsPlaceholder(dataUrl){
  return new Promise(resolve=>{
    const img = new Image();
    img.onload = ()=>{
      try{
        const S = 2;
        const w = Math.floor(img.width/S), h = Math.floor(img.height/S);
        const cv = document.createElement('canvas');
        cv.width=w; cv.height=h;
        const cx = cv.getContext('2d',{willReadFrequently:true});
        cx.drawImage(img,0,0,w,h);
        const half = Math.floor(w/2);
        const d = cx.getImageData(0,0,half,h).data;
        let blue=0;
        for(let p=0;p<d.length;p+=4){
          const r=d[p], g=d[p+1], b=d[p+2];
          /* 진한 파랑만 — 머리글·표 테두리의 옅은 파랑, 회색 예시의 연보라는 걸러진다 */
          if(b>120 && r<90 && g<90) blue++;
        }
        /* 실측: 진짜 소아청소년기 그래프 1140px / 회색 예시 14px (72dpi 기준) */
        resolve(blue < 150);
      }catch(e){ resolve(false); }   // 판단 못 하면 막지 않는다
    };
    img.onerror = ()=>resolve(false);
    img.src = dataUrl;
  });
}
