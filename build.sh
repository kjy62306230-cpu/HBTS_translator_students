#!/bin/bash
# HBTS 진로학습 설계 툴 — 빌드
# src/*.js 를 수정한 뒤 이 스크립트를 돌리면 index.html 이 다시 만들어집니다.
cd "$(dirname "$0")"
python3 - <<'PY'
import io
shell = io.open('src/shell.html', encoding='utf-8').read()
head, _ = shell.rsplit('<script>', 1)
pdfmin = io.open('vendor/pdf.min.js', encoding='utf-8').read()
worker = io.open('vendor/pdf.worker.min.js', encoding='utf-8').read()
out = [head,
       '<script type="text/plain" id="pdfWorkerSrc">\n', worker, '\n</' + 'script>\n',
       '<' + 'script>\n', pdfmin, '\n</' + 'script>\n',
       '<' + 'script>\n']
for f in ['kb.js', 'science.js', 'roadmap.js', 'engine.js', 'verify.js', 'upload.js']:
    out.append('\n/* ===== %s ===== */\n' % f)
    out.append(io.open('src/' + f, encoding='utf-8').read())
out.append('\n</' + 'script>\n</body>\n</html>\n')
io.open('index.html', 'w', encoding='utf-8').write(''.join(out))
print('built index.html')
PY
