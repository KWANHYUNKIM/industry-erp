"""QA 기록 docx 에 회차 하나를 이어 쓴다.

    python3 docs/QA기록/qa_doc.py docs/QA기록/QA기록_61-80회차.docx round69.json

모양은 문서에 이미 있는 것을 복제한다(제목·소제목·목록·표·그림·캡션). 그래서 새 회차가 앞 회차와
똑같이 보이고, 스타일을 여기서 따로 정의하지 않는다. 그림 번호는 마지막 '그림 N.' 다음부터 매긴다.

spec(JSON):
  {"date": "2026-10-02", "round": 69,
   "blocks": [
     {"h1": "69회차 — …"}, {"p": "계기: …"}, {"h2": "69-1. 사용법"}, {"li": "…"},
     {"table": [["머리", …], ["값", …]], "widths": [1200, …]},   # widths 는 생략 가능(합 9000)
     {"img": "/abs/path.png", "caption": "…"}                     # 캡션 앞의 '그림 N.' 은 자동
   ]}
"""
import copy, json, re, struct, sys, zipfile
from pathlib import Path
from lxml import etree

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PR = 'http://schemas.openxmlformats.org/package/2006/relationships'
NS = {'w': W, 'r': R,
      'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
      'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture'}
IMG_W = 5760000  # EMU — 앞 회차 그림과 같은 폭


def q(tag):
    p, t = tag.split(':')
    return f'{{{NS[p]}}}{t}'


def style(p):
    s = p.find('w:pPr/w:pStyle', NS)
    return s.get(q('w:val')) if s is not None else ''


def set_text(p, text):
    """첫 run 의 글자 모양을 두고 글자만 바꾼다."""
    runs = p.findall('w:r', NS)
    for r in runs[1:]:
        p.remove(r)
    for t in runs[0].findall('w:t', NS)[1:]:
        runs[0].remove(t)
    t = runs[0].find('w:t', NS)
    t.text = text
    t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    return p


def png_size(data):
    assert data[:8] == b'\x89PNG\r\n\x1a\n', 'PNG 만 넣는다'
    return struct.unpack('>II', data[16:24])


def main(docx, spec_path):
    spec = json.loads(Path(spec_path).read_text(encoding='utf-8'))
    z = zipfile.ZipFile(docx)
    files = {i.filename: z.read(i.filename) for i in z.infolist()}
    z.close()
    doc = etree.fromstring(files['word/document.xml'])
    rels = etree.fromstring(files['word/_rels/document.xml.rels'])
    body = doc.find('w:body', NS)
    kids = list(body)
    sect = kids[-1]

    paras = [k for k in kids if k.tag == q('w:p')]
    last = lambda pred: next(p for p in reversed(paras) if pred(p))
    is_img = lambda p: p.find('.//w:drawing', NS) is not None
    tpl = {
        'h1': last(lambda p: style(p) == 'Heading1'),
        'h2': last(lambda p: style(p) == 'Heading2'),
        'li': last(lambda p: style(p) == 'ListParagraph'),
        'p': last(lambda p: style(p) == '' and not is_img(p) and p.find('w:r', NS) is not None
                  and p.find('w:pPr/w:jc', NS) is None),
        'img': last(is_img),
    }
    tpl['cap'] = kids[kids.index(tpl['img']) + 1]
    tbl_tpl = [k for k in kids if k.tag == q('w:tbl')][-1]
    head_tc = tbl_tpl.findall('w:tr', NS)[0].findall('w:tc', NS)[0]
    body_tc = tbl_tpl.findall('w:tr', NS)[1].findall('w:tc', NS)[-1]

    fig = max([int(m) for m in re.findall(r'그림 (\d+)\.', ''.join(doc.itertext()))] or [0])
    rid = max(int(r.get('Id')[3:]) for r in rels if r.get('Id', '').startswith('rId'))
    pic_id = max([int(x) for x in doc.xpath('//wp:docPr/@id', namespaces=NS)] or [0])

    def cell(tc_tpl, text, width):
        tc = copy.deepcopy(tc_tpl)
        tc.find('w:tcPr/w:tcW', NS).set(q('w:w'), str(width))
        for p in tc.findall('w:p', NS)[1:]:
            tc.remove(p)
        set_text(tc.find('w:p', NS), text)
        return tc

    out = []
    for b in spec['blocks']:
        kind = next(k for k in ('h1', 'h2', 'li', 'p', 'table', 'img') if k in b)
        if kind in ('h1', 'h2', 'li', 'p'):
            out.append(set_text(copy.deepcopy(tpl[kind]), b[kind]))
        elif kind == 'table':
            rows = b['table']
            n = len(rows[0])
            widths = b.get('widths') or [9000 // n] * n
            t = copy.deepcopy(tbl_tpl)
            for tr in t.findall('w:tr', NS):
                t.remove(tr)
            grid = t.find('w:tblGrid', NS)
            for gc in list(grid):
                grid.remove(gc)
            for w in widths:
                etree.SubElement(grid, q('w:gridCol')).set(q('w:w'), str(w))
            for i, row in enumerate(rows):
                tr = etree.SubElement(t, q('w:tr'))
                for text, w in zip(row, widths):
                    tr.append(cell(head_tc if i == 0 else body_tc, str(text), w))
            out.append(t)
        else:
            data = Path(b['img']).read_bytes()
            pw, ph = png_size(data)
            rid += 1; pic_id += 1; fig += 1
            name = f'media/r{spec["round"]}-{fig}.png'
            files['word/' + name] = data
            rel = etree.SubElement(rels, f'{{{PR}}}Relationship')
            rel.set('Id', f'rId{rid}')
            rel.set('Type', f'{R}/image')
            rel.set('Target', name)
            p = copy.deepcopy(tpl['img'])
            cy = str(int(IMG_W * ph / pw))
            for ext in p.xpath('.//wp:extent|.//a:ext', namespaces=NS):
                ext.set('cx', str(IMG_W)); ext.set('cy', cy)
            dp = p.find('.//wp:docPr', NS)
            dp.set('id', str(pic_id)); dp.set('name', f'Picture {pic_id}')
            p.find('.//pic:cNvPr', NS).set('name', Path(name).name)
            p.find('.//a:blip', NS).set(q('r:embed'), f'rId{rid}')
            out.append(p)
            out.append(set_text(copy.deepcopy(tpl['cap']), f'그림 {fig}. {b["caption"]}'))

    body.remove(sect)
    for e in out:
        body.append(e)
    body.append(sect)

    # 앞머리 '최근 갱신 … (N회차)' 를 고친다
    # (날짜가 '최근 갱신 ' 다음 run 에 따로 있다)
    for t in doc.iter(q('w:t')):
        if t.text and re.fullmatch(r'\d{4}-\d{2}-\d{2} \(\d+회차\)', t.text.strip()):
            t.text = f'{spec["date"]} ({spec["round"]}회차)'

    files['word/document.xml'] = etree.tostring(doc, xml_declaration=True, encoding='UTF-8', standalone=True)
    files['word/_rels/document.xml.rels'] = etree.tostring(rels, xml_declaration=True, encoding='UTF-8', standalone=True)
    with zipfile.ZipFile(docx, 'w', zipfile.ZIP_DEFLATED) as o:
        for name, data in files.items():
            o.writestr(name, data)
    print(f'{docx}: 블록 {len(out)}개 추가, 마지막 그림 {fig}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
